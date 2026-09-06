import {
  MAX_SEMANTIC_WORKER_FILE_CHANGES,
  MAX_SEMANTIC_WORKER_TEXT_BYTES,
  SEMANTIC_WORKER_PROTOCOL_VERSION,
  SemanticWorkerCancelState,
  cancelSemanticWorkerRequest,
  createSemanticWorkerError,
  createSemanticWorkerCancellationCell,
  decodeSemanticWorkerMutation,
  decodeSemanticWorkerMutationAck,
  decodeSemanticWorkerRequest,
  decodeSemanticWorkerResponse,
  isCanonicalSemanticWorkerFileUri,
  readSemanticWorkerCancellationState,
  type SemanticWorkerJsonValue,
  type SemanticWorkerErrorCode,
  type SemanticWorkerMethod,
  type SemanticWorkerMutation,
  type SemanticWorkerRequest,
  type SemanticWorkerRequestArgsByMethod,
  type SemanticWorkerTerminalCancellationState,
} from "./worker-protocol.js"

export { SEMANTIC_WORKER_PROTOCOL_VERSION, SemanticWorkerCancelState } from "./worker-protocol.js"

export type RootSemanticWorkerMutationInput =
  | {
      readonly kind: "open" | "change"
      readonly uri: string
      readonly documentVersion: number
      readonly text: string
    }
  | {
      readonly kind: "close"
      readonly uri: string
      readonly documentVersion: number
    }
  | {
      readonly kind: "workspaceFilesChanged"
      readonly rootUri: string
      readonly rootDirty: boolean
      readonly resourceDirty: boolean
      readonly resourceChanged: boolean
      readonly changes: readonly {
        readonly uri: string
        readonly kind: "created" | "changed" | "deleted"
      }[]
    }

export type RootSemanticWorkerRequestInput = {
  readonly [Method in SemanticWorkerMethod]: {
    readonly method: Method
    readonly uri: string
    readonly expectedDocumentVersion: number
    readonly args: SemanticWorkerRequestArgsByMethod[Method]
  }
}[SemanticWorkerMethod]

export interface RootSemanticWorkerRequestHandle {
  readonly result: Promise<SemanticWorkerJsonValue>
  cancel(
    reason: SemanticWorkerTerminalCancellationState,
  ): SemanticWorkerTerminalCancellationState
}

export interface RootSemanticWorkerEndpointHandlers {
  readonly message: (message: unknown) => void
  readonly error: (error: unknown) => void
  readonly exit: (code: number) => void
}

export interface RootSemanticWorkerEndpoint {
  listen(handlers: RootSemanticWorkerEndpointHandlers): () => void
  send(message: SemanticWorkerMutation | SemanticWorkerRequest): void
  terminate(): void | Promise<void>
}

export interface RootSemanticWorkerSupervisorOptions {
  readonly rootUri: string
  readonly epoch: number
  readonly endpoint: RootSemanticWorkerEndpoint
  readonly waitForDisposeDeadline: () => Promise<void>
}

export class SemanticWorkerSupervisorError extends Error {
  readonly code: SemanticWorkerErrorCode

  constructor(code: SemanticWorkerErrorCode, options?: ErrorOptions) {
    const workerError = createSemanticWorkerError(code)
    super(workerError.message, options)
    this.name = "SemanticWorkerSupervisorError"
    this.code = code
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

interface MutationRecord {
  readonly kind: "mutation"
  input: RootSemanticWorkerMutationInput
  readonly completion: Deferred<void>
  readonly documentKey: string | undefined
  textBytes: number
  wire?: SemanticWorkerMutation
}

interface RequestRecord {
  readonly kind: "request"
  readonly input: RootSemanticWorkerRequestInput
  readonly cancelCell: SharedArrayBuffer
  readonly completion: Deferred<SemanticWorkerJsonValue>
  readonly stateGeneration: number
  wire?: SemanticWorkerRequest
}

type CommandRecord = MutationRecord | RequestRecord

export class RootSemanticWorkerSupervisor {
  static readonly maxWaitingRequests = 64
  static readonly maxQueuedMutationDocuments = 32
  static readonly maxQueuedMutationRecords = 32
  static readonly maxQueuedMutationTextBytes = MAX_SEMANTIC_WORKER_TEXT_BYTES
  readonly #rootUri: string
  readonly #epoch: number
  readonly #endpoint: RootSemanticWorkerEndpoint
  readonly #waitForDisposeDeadline: () => Promise<void>
  readonly #pendingMutations: MutationRecord[] = []
  readonly #pendingRequests: RequestRecord[] = []
  #active: CommandRecord | undefined
  #activeTerminal: Deferred<void> | undefined
  #appliedRevision = 0
  #stateGeneration = 0
  #queuedMutationTextBytes = 0
  #nextRequestId = 1
  #disposed = false
  #failure: SemanticWorkerSupervisorError | undefined
  #disposePromise: Promise<void> | undefined
  #disposeDeadlinePromise: Promise<void> | undefined
  #terminatePromise: Promise<SemanticWorkerSupervisorError | undefined> | undefined
  readonly #terminationCauses: unknown[] = []
  #unlisten: (() => void) | undefined

  constructor(options: RootSemanticWorkerSupervisorOptions) {
    assertCanonicalRootUri(options.rootUri)
    if (!Number.isSafeInteger(options.epoch) || options.epoch <= 0) {
      throw new SemanticWorkerSupervisorError("invalid-request")
    }
    this.#rootUri = options.rootUri
    this.#epoch = options.epoch
    this.#endpoint = options.endpoint
    this.#waitForDisposeDeadline = options.waitForDisposeDeadline
    this.#unlisten = this.#endpoint.listen({
      message: message => this.#receive(message),
      error: error => this.#fail(error, true),
      exit: code => this.#fail(
        new Error(`Semantic worker exited with code ${code}`),
        true,
      ),
    })
  }

  mutate(input: RootSemanticWorkerMutationInput): Promise<void> {
    this.#assertAvailable()
    let snapshot: RootSemanticWorkerMutationInput
    try {
      const candidate = readPlainMutationInput(input)
      assertMutationTargetsRoot(this.#rootUri, candidate)
      if (workspaceMutationExceedsFileChangeBound(candidate)) {
        assertOverboundWorkspaceMutationStructure(this.#rootUri, candidate)
      }
      if (mutationExceedsTransportBounds(candidate)) {
        return this.#rejectMutationAndRestart()
      }
      snapshot = canonicalMutationInput(this.#epoch, candidate)
    } catch (error) {
      if (error instanceof SemanticWorkerSupervisorError) throw error
      throw new SemanticWorkerSupervisorError("invalid-request", { cause: error })
    }
    if (
      snapshot.kind === "workspaceFilesChanged"
        ? snapshot.rootUri !== this.#rootUri
        : !isUriWithinRoot(snapshot.uri, this.#rootUri)
    ) throw new SemanticWorkerSupervisorError("invalid-request")
    const documentKey = snapshot.kind === "workspaceFilesChanged" ? undefined : snapshot.uri
    const existing = findCoalescingMutation(
      this.#pendingMutations,
      snapshot,
      documentKey,
    )
    let nextSnapshot: RootSemanticWorkerMutationInput
    try {
      if (
        existing?.input.kind === "workspaceFilesChanged"
        && snapshot.kind === "workspaceFilesChanged"
      ) {
        nextSnapshot = mergeWorkspaceInvalidations(this.#epoch, existing.input, snapshot)
      } else if (
        existing
        && existing.input.kind !== "workspaceFilesChanged"
        && snapshot.kind !== "workspaceFilesChanged"
      ) {
        nextSnapshot = mergeDocumentMutations(this.#epoch, existing.input, snapshot)
      } else {
        nextSnapshot = snapshot
      }
    } catch (error) {
      return this.#rejectMutationAndRestart(error)
    }
    const textBytes = mutationTextBytes(nextSnapshot)
    const nextTextBytes = this.#queuedMutationTextBytes - (existing?.textBytes ?? 0) + textBytes
    const queuedDocumentCount = this.#pendingMutations.reduce(
      (count, record) => count + Number(record.documentKey !== undefined),
      0,
    ) + Number(documentKey !== undefined && !existing)
    const queuedRecordCount = this.#pendingMutations.length + Number(!existing)
    if (
      queuedDocumentCount > RootSemanticWorkerSupervisor.maxQueuedMutationDocuments
      || queuedRecordCount > RootSemanticWorkerSupervisor.maxQueuedMutationRecords
      || nextTextBytes > RootSemanticWorkerSupervisor.maxQueuedMutationTextBytes
    ) {
      return this.#rejectMutationAndRestart()
    }
    this.#stateGeneration += 1
    this.#invalidateRequests()
    if (existing) {
      this.#queuedMutationTextBytes = nextTextBytes
      existing.input = nextSnapshot
      existing.textBytes = textBytes
    } else {
      const completion = deferred<void>()
      this.#queuedMutationTextBytes = nextTextBytes
      this.#pendingMutations.push({
        kind: "mutation",
        input: nextSnapshot,
        completion,
        documentKey,
        textBytes,
      })
      this.#pump()
      return completion.promise
    }
    this.#pump()
    return existing.completion.promise
  }

  request(input: RootSemanticWorkerRequestInput): RootSemanticWorkerRequestHandle {
    this.#assertAvailable()
    const cancelCell = createSemanticWorkerCancellationCell()
    let snapshot: RootSemanticWorkerRequestInput
    try {
      snapshot = canonicalRequestInput(
        this.#epoch,
        this.#nextRequestId,
        readPlainRequestInput(input),
        cancelCell,
      )
    } catch (error) {
      throw new SemanticWorkerSupervisorError("invalid-request", { cause: error })
    }
    if (!isUriWithinRoot(snapshot.uri, this.#rootUri)) {
      throw new SemanticWorkerSupervisorError("invalid-request")
    }
    const completion = deferred<SemanticWorkerJsonValue>()
    if (
      this.#pendingRequests.length >= RootSemanticWorkerSupervisor.maxWaitingRequests
    ) {
      completion.reject(new SemanticWorkerSupervisorError("queue-overflow"))
      return requestHandle(completion.promise, reason => (
        cancelSemanticWorkerRequest(cancelCell, reason)
      ))
    }
    const record: RequestRecord = {
      kind: "request",
      input: snapshot,
      cancelCell,
      completion,
      stateGeneration: this.#stateGeneration,
    }
    this.#pendingRequests.push(record)
    this.#pump()
    return requestHandle(completion.promise, reason => this.#cancelRequest(record, reason))
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise
    this.#disposed = true
    if (this.#active?.kind === "request") {
      cancelWithoutThrowing(
        this.#active.cancelCell,
        SemanticWorkerCancelState.supervisorDisposing,
      )
    }
    const disposalError = new SemanticWorkerSupervisorError("worker-unavailable")
    for (const record of this.#pendingMutations.splice(0)) {
      record.completion.reject(disposalError)
    }
    for (const record of this.#pendingRequests.splice(0)) {
      cancelWithoutThrowing(
        record.cancelCell,
        SemanticWorkerCancelState.supervisorDisposing,
      )
      record.completion.reject(disposalError)
    }
    this.#queuedMutationTextBytes = 0
    this.#disposePromise = this.#disposeActive(disposalError)
    return this.#disposePromise
  }

  #pump(): void {
    if (this.#active || this.#disposed) return
    const mutation = this.#pendingMutations.shift()
    if (mutation) this.#queuedMutationTextBytes -= mutation.textBytes
    const record = mutation ?? this.#pendingRequests.shift()
    if (!record) return
    if (
      record.kind === "request"
      && record.stateGeneration !== this.#stateGeneration
    ) {
      cancelWithoutThrowing(record.cancelCell, SemanticWorkerCancelState.contentModified)
      record.completion.reject(new SemanticWorkerSupervisorError("content-modified"))
      this.#pump()
      return
    }
    this.#active = record
    this.#activeTerminal = deferred<void>()
    try {
      if (record.kind === "mutation") {
        const wire = wireMutation(this.#epoch, this.#appliedRevision + 1, record.input)
        record.wire = wire
        this.#endpoint.send(wire)
      } else {
        const wire = wireRequest(
          this.#epoch,
          this.#nextRequestId++,
          this.#appliedRevision,
          record.input,
          record.cancelCell,
        )
        record.wire = wire
        this.#endpoint.send(wire)
      }
    } catch (error) {
      this.#fail(error)
    }
  }

  #receive(message: unknown): void {
    if (this.#failure) return
    const active = this.#active
    if (!active) return this.#fail(new Error("Unexpected semantic worker message"))
    try {
      if (active.kind === "mutation") {
        const ack = decodeSemanticWorkerMutationAck(message)
        if (
          !active.wire
          || ack.epoch !== this.#epoch
          || ack.appliedRevision !== active.wire.revision
        ) throw new Error("Mismatched semantic worker mutation acknowledgement")
        this.#appliedRevision = ack.appliedRevision
        this.#active = undefined
        this.#finishActiveTerminal()
        active.completion.resolve(undefined)
      } else {
        const response = decodeSemanticWorkerResponse(message)
        if (
          !active.wire
          || response.epoch !== this.#epoch
          || response.id !== active.wire.id
          || response.appliedRevision !== active.wire.requiredRevision
          || response.documentVersion !== active.wire.expectedDocumentVersion
        ) throw new Error("Mismatched semantic worker response")
        const cancellation = readSemanticWorkerCancellationState(active.cancelCell)
        this.#active = undefined
        this.#finishActiveTerminal()
        if (cancellation !== SemanticWorkerCancelState.active) {
          active.completion.reject(cancellationError(cancellation))
        } else if (response.ok) {
          active.completion.resolve(response.value)
        } else {
          active.completion.reject(new SemanticWorkerSupervisorError(response.error.code))
        }
      }
      this.#pump()
    } catch (error) {
      this.#fail(error)
    }
  }

  #fail(error: unknown, endpointTerminal = false): void {
    if (this.#failure) {
      if (endpointTerminal) this.#settleActiveFailure(this.#failure)
      return
    }
    const failure = new SemanticWorkerSupervisorError("worker-unavailable", {
      cause: error,
    })
    this.#failure = failure
    this.#disposed = true
    if (this.#active?.kind === "request") {
      cancelWithoutThrowing(
        this.#active.cancelCell,
        SemanticWorkerCancelState.supervisorDisposing,
      )
    }
    for (const record of this.#pendingMutations.splice(0)) {
      record.completion.reject(failure)
    }
    for (const record of this.#pendingRequests.splice(0)) {
      cancelWithoutThrowing(
        record.cancelCell,
        SemanticWorkerCancelState.supervisorDisposing,
      )
      record.completion.reject(failure)
    }
    this.#queuedMutationTextBytes = 0
    const termination = this.#terminateWithinDeadline()
    if (endpointTerminal) {
      this.#settleActiveFailure(failure)
      void termination.catch(() => {})
    } else {
      void termination.then(
        () => this.#settleActiveFailure(failure),
        () => this.#settleActiveFailure(failure),
      )
    }
  }

  #beginFatalShutdown(failure: SemanticWorkerSupervisorError): void {
    if (this.#failure) return
    this.#failure = failure
    this.#disposed = true
    if (this.#active?.kind === "request") {
      cancelWithoutThrowing(
        this.#active.cancelCell,
        SemanticWorkerCancelState.supervisorDisposing,
      )
    }
    for (const record of this.#pendingMutations.splice(0)) {
      record.completion.reject(failure)
    }
    for (const record of this.#pendingRequests.splice(0)) {
      cancelWithoutThrowing(
        record.cancelCell,
        SemanticWorkerCancelState.supervisorDisposing,
      )
      record.completion.reject(failure)
    }
    this.#queuedMutationTextBytes = 0
    void this.#terminateWithinDeadline().then(
      () => this.#settleActiveFailure(failure),
      () => this.#settleActiveFailure(failure),
    )
  }

  #rejectMutationAndRestart(cause?: unknown): Promise<void> {
    const failure = new SemanticWorkerSupervisorError("restart-required", { cause })
    const completion = deferred<void>()
    completion.reject(failure)
    this.#beginFatalShutdown(failure)
    return completion.promise
  }

  #settleActiveFailure(failure: SemanticWorkerSupervisorError): void {
    if (this.#active?.kind === "mutation") {
      this.#active.completion.reject(failure)
    } else if (this.#active) {
      const cancellation = readCancellationWithoutThrowing(this.#active.cancelCell)
      this.#active.completion.reject(
        cancellation === SemanticWorkerCancelState.clientCancelled
        || cancellation === SemanticWorkerCancelState.contentModified
          ? cancellationError(cancellation)
          : failure,
      )
    }
    this.#active = undefined
    this.#finishActiveTerminal()
  }

  #assertAvailable(): void {
    if (this.#failure) throw this.#failure
    if (this.#disposed) {
      throw new SemanticWorkerSupervisorError("worker-unavailable", {
        cause: new Error(`Semantic worker unavailable for ${this.#rootUri}`),
      })
    }
  }

  #invalidateRequests(): void {
    if (this.#active?.kind === "request") {
      cancelWithoutThrowing(
        this.#active.cancelCell,
        SemanticWorkerCancelState.contentModified,
      )
    }
    for (const record of this.#pendingRequests.splice(0)) {
      cancelWithoutThrowing(record.cancelCell, SemanticWorkerCancelState.contentModified)
      record.completion.reject(new SemanticWorkerSupervisorError("content-modified"))
    }
  }

  #cancelRequest(
    record: RequestRecord,
    reason: SemanticWorkerTerminalCancellationState,
  ): SemanticWorkerTerminalCancellationState {
    const winner = cancelSemanticWorkerRequest(record.cancelCell, reason)
    if (this.#active === record) return winner
    const pendingIndex = this.#pendingRequests.indexOf(record)
    if (pendingIndex >= 0) {
      this.#pendingRequests.splice(pendingIndex, 1)
      record.completion.reject(cancellationError(winner))
    }
    return winner
  }

  #terminate(): Promise<SemanticWorkerSupervisorError | undefined> {
    if (!this.#terminatePromise) {
      const completion = deferred<SemanticWorkerSupervisorError | undefined>()
      this.#terminatePromise = completion.promise
      const unlisten = this.#unlisten
      this.#unlisten = undefined
      try {
        unlisten?.()
      } catch (error) {
        this.#terminationCauses.push(error)
      }
      void Promise.resolve().then(() => {
        let termination: void | Promise<void>
        try {
          termination = this.#endpoint.terminate()
        } catch (error) {
          this.#terminationCauses.push(error)
          completion.resolve(this.#terminationFailure())
          return
        }
        void Promise.resolve(termination).then(
          () => completion.resolve(this.#terminationFailure()),
          error => {
            this.#terminationCauses.push(error)
            completion.resolve(this.#terminationFailure())
          },
        )
      })
    }
    return this.#terminatePromise
  }

  #terminationFailure(): SemanticWorkerSupervisorError | undefined {
    if (this.#terminationCauses.length === 0) return undefined
    const cause = this.#terminationCauses.length === 1
      ? this.#terminationCauses[0]
      : new AggregateError(
          [...this.#terminationCauses],
          "Semantic worker termination failed",
        )
    return new SemanticWorkerSupervisorError("worker-unavailable", { cause })
  }

  #disposeDeadline(): Promise<void> {
    if (!this.#disposeDeadlinePromise) {
      this.#disposeDeadlinePromise = Promise.resolve()
        .then(() => this.#waitForDisposeDeadline())
        .then(
          () => undefined,
          () => undefined,
        )
    }
    return this.#disposeDeadlinePromise
  }

  async #terminateWithinDeadline(): Promise<void> {
    const outcome = await Promise.race([
      this.#terminate().then(
        failure => ({ kind: "terminated" as const, failure }),
      ),
      this.#disposeDeadline().then(() => ({ kind: "deadline" as const })),
    ])
    const failure = outcome.kind === "terminated"
      ? outcome.failure
      : this.#terminationFailure()
    if (failure) throw failure
  }

  async #disposeActive(disposalError: SemanticWorkerSupervisorError): Promise<void> {
    if (this.#active) {
      const terminal = this.#activeTerminal?.promise ?? Promise.resolve()
      const outcome = await Promise.race([
        terminal.then(() => "terminal" as const),
        this.#disposeDeadline().then(() => "deadline" as const),
      ])
      if (outcome === "deadline" && this.#active) {
        void this.#terminate()
        this.#settleActiveFailure(disposalError)
        await Promise.resolve()
        const terminationFailure = this.#terminationFailure()
        if (terminationFailure) throw terminationFailure
        return
      }
    }
    await this.#terminateWithinDeadline()
  }

  #finishActiveTerminal(): void {
    this.#activeTerminal?.resolve(undefined)
    this.#activeTerminal = undefined
  }
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function requestHandle(
  result: Promise<SemanticWorkerJsonValue>,
  cancel: (
    reason: SemanticWorkerTerminalCancellationState,
  ) => SemanticWorkerTerminalCancellationState,
): RootSemanticWorkerRequestHandle {
  return Object.freeze({ result, cancel })
}

function canonicalMutationInput(
  epoch: number,
  input: RootSemanticWorkerMutationInput,
): RootSemanticWorkerMutationInput {
  const mutation = wireMutation(epoch, 1, input)
  if (mutation.kind === "workspaceFilesChanged") {
    return Object.freeze({
      kind: mutation.kind,
      rootUri: mutation.rootUri,
      rootDirty: mutation.rootDirty,
      resourceDirty: mutation.resourceDirty,
      resourceChanged: mutation.resourceChanged,
      changes: mutation.changes,
    })
  }
  return Object.freeze({
    kind: mutation.kind,
    uri: mutation.uri,
    documentVersion: mutation.documentVersion,
    ...(mutation.kind === "close" ? {} : { text: mutation.text as string }),
  }) as RootSemanticWorkerMutationInput
}

function canonicalRequestInput(
  epoch: number,
  id: number,
  input: RootSemanticWorkerRequestInput,
  cancelCell: SharedArrayBuffer,
): RootSemanticWorkerRequestInput {
  const request = wireRequest(epoch, id, 0, input, cancelCell)
  return Object.freeze({
    method: request.method,
    uri: request.uri,
    expectedDocumentVersion: request.expectedDocumentVersion,
    args: request.args,
  }) as RootSemanticWorkerRequestInput
}

function wireMutation(
  epoch: number,
  revision: number,
  input: RootSemanticWorkerMutationInput,
): SemanticWorkerMutation {
  if (input.kind === "workspaceFilesChanged") {
    return decodeSemanticWorkerMutation({
      protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
      epoch,
      revision,
      kind: input.kind,
      rootUri: input.rootUri,
      rootDirty: input.rootDirty,
      resourceDirty: input.resourceDirty,
      resourceChanged: input.resourceChanged,
      changes: input.changes,
    })
  }
  return decodeSemanticWorkerMutation({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch,
    revision,
    kind: input.kind,
    uri: input.uri,
    documentVersion: input.documentVersion,
    ...(input.kind === "close" ? {} : { text: input.text }),
  })
}

function wireRequest(
  epoch: number,
  id: number,
  requiredRevision: number,
  input: RootSemanticWorkerRequestInput,
  cancelCell: SharedArrayBuffer,
): SemanticWorkerRequest {
  return decodeSemanticWorkerRequest({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch,
    id,
    requiredRevision,
    method: input.method,
    uri: input.uri,
    expectedDocumentVersion: input.expectedDocumentVersion,
    args: input.args,
    cancelCell,
  })
}

function readPlainMutationInput(value: unknown): RootSemanticWorkerMutationInput {
  const input = ownPlainInputRecord(value)
  if (!input) throw new Error("Invalid semantic worker mutation input")
  const expectedKeys = input.kind === "close"
    ? ["kind", "uri", "documentVersion"]
    : input.kind === "open" || input.kind === "change"
      ? ["kind", "uri", "documentVersion", "text"]
      : input.kind === "workspaceFilesChanged"
        ? [
            "kind",
            "rootUri",
            "rootDirty",
            "resourceDirty",
            "resourceChanged",
            "changes",
          ]
        : []
  if (expectedKeys.length === 0 || !hasExactInputKeys(input, expectedKeys)) {
    throw new Error("Invalid semantic worker mutation input")
  }
  return input as unknown as RootSemanticWorkerMutationInput
}

function readPlainRequestInput(value: unknown): RootSemanticWorkerRequestInput {
  const input = ownPlainInputRecord(value)
  if (!input || !hasExactInputKeys(input, [
    "method",
    "uri",
    "expectedDocumentVersion",
    "args",
  ])) throw new Error("Invalid semantic worker request input")
  return input as unknown as RootSemanticWorkerRequestInput
}

function ownPlainInputRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  if (Object.getPrototypeOf(value) !== Object.prototype) return undefined
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return undefined
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined
    copy[key] = descriptor.value
  }
  return copy
}

function hasExactInputKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key))
}

function mutationTextBytes(input: RootSemanticWorkerMutationInput): number {
  return input.kind === "open" || input.kind === "change"
    ? Buffer.byteLength(input.text)
    : 0
}

function mutationExceedsTransportBounds(input: RootSemanticWorkerMutationInput): boolean {
  if (
    (input.kind === "open" || input.kind === "change")
    && typeof input.text === "string"
    && Buffer.byteLength(input.text) > MAX_SEMANTIC_WORKER_TEXT_BYTES
  ) return true
  return workspaceMutationExceedsFileChangeBound(input)
}

function workspaceMutationExceedsFileChangeBound(
  input: RootSemanticWorkerMutationInput,
): input is Extract<RootSemanticWorkerMutationInput, { kind: "workspaceFilesChanged" }> {
  if (input.kind !== "workspaceFilesChanged" || !Array.isArray(input.changes)) return false
  if (Object.getPrototypeOf(input.changes) !== Array.prototype) {
    throw new Error("Invalid semantic worker workspace changes")
  }
  const length = Object.getOwnPropertyDescriptor(input.changes, "length")
  if (!length || !("value" in length) || !Number.isSafeInteger(length.value)) {
    throw new Error("Invalid semantic worker workspace changes")
  }
  return length.value > MAX_SEMANTIC_WORKER_FILE_CHANGES
}

function assertOverboundWorkspaceMutationStructure(
  rootUri: string,
  input: Extract<RootSemanticWorkerMutationInput, { kind: "workspaceFilesChanged" }>,
): void {
  if (
    input.rootUri !== rootUri
    || !isCanonicalSemanticWorkerFileUri(input.rootUri)
    || typeof input.rootDirty !== "boolean"
    || typeof input.resourceDirty !== "boolean"
    || typeof input.resourceChanged !== "boolean"
    || (input.resourceDirty && !input.resourceChanged)
  ) throw new Error("Invalid semantic worker workspace mutation")
  const keys = Reflect.ownKeys(input.changes)
  if (
    keys.length !== input.changes.length + 1
    || keys.some((key, index) => index < input.changes.length
      ? key !== String(index)
      : key !== "length")
  ) throw new Error("Invalid semantic worker workspace changes")
  for (let index = 0; index < input.changes.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input.changes, String(index))
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new Error("Invalid semantic worker workspace change")
    }
    const change = ownPlainInputRecord(descriptor.value)
    if (
      !change
      || !hasExactInputKeys(change, ["uri", "kind"])
      || !isCanonicalSemanticWorkerFileUri(change.uri)
      || !isUriWithinRoot(change.uri, rootUri)
      || (change.kind !== "created"
        && change.kind !== "changed"
        && change.kind !== "deleted")
    ) throw new Error("Invalid semantic worker workspace change")
  }
}

function assertMutationTargetsRoot(
  rootUri: string,
  input: RootSemanticWorkerMutationInput,
): void {
  if (input.kind === "workspaceFilesChanged") {
    if (input.rootUri !== rootUri) {
      throw new SemanticWorkerSupervisorError("invalid-request")
    }
    return
  }
  if (input.kind !== "open" && input.kind !== "change" && input.kind !== "close") return
  try {
    const target = decodeSemanticWorkerMutation({
      protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
      epoch: 1,
      revision: 1,
      kind: "close",
      uri: input.uri,
      documentVersion: input.documentVersion,
    })
    if (target.kind === "workspaceFilesChanged" || !isUriWithinRoot(target.uri, rootUri)) {
      throw new SemanticWorkerSupervisorError("invalid-request")
    }
  } catch (error) {
    if (error instanceof SemanticWorkerSupervisorError) throw error
    throw new SemanticWorkerSupervisorError("invalid-request", { cause: error })
  }
}

function mergeWorkspaceInvalidations(
  epoch: number,
  previous: Extract<RootSemanticWorkerMutationInput, { kind: "workspaceFilesChanged" }>,
  next: Extract<RootSemanticWorkerMutationInput, { kind: "workspaceFilesChanged" }>,
): RootSemanticWorkerMutationInput {
  const changes = new Map(previous.changes.map(change => [change.uri, change.kind]))
  for (const change of next.changes) {
    const prior = changes.get(change.uri)
    const merged = mergeWorkspaceFileChange(prior, change.kind)
    if (merged) changes.set(change.uri, merged)
    else changes.delete(change.uri)
  }
  return canonicalMutationInput(epoch, {
    kind: "workspaceFilesChanged",
    rootUri: previous.rootUri,
    rootDirty: previous.rootDirty || next.rootDirty,
    resourceDirty: previous.resourceDirty || next.resourceDirty,
    resourceChanged: previous.resourceChanged || next.resourceChanged,
    changes: [...changes].map(([uri, kind]) => ({ uri, kind })),
  })
}

function findCoalescingMutation(
  pending: readonly MutationRecord[],
  input: RootSemanticWorkerMutationInput,
  documentKey: string | undefined,
): MutationRecord | undefined {
  const tail = pending.at(-1)
  if (input.kind === "workspaceFilesChanged") {
    return tail?.input.kind === "workspaceFilesChanged" ? tail : undefined
  }
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const record = pending[index]
    if (!record || record.input.kind === "workspaceFilesChanged") return undefined
    if (record.documentKey === documentKey) return record
  }
  return undefined
}

function mergeDocumentMutations(
  epoch: number,
  previous: Exclude<RootSemanticWorkerMutationInput, { kind: "workspaceFilesChanged" }>,
  next: Exclude<RootSemanticWorkerMutationInput, { kind: "workspaceFilesChanged" }>,
): RootSemanticWorkerMutationInput {
  if (previous.kind !== "open" || next.kind !== "change") return next
  return canonicalMutationInput(epoch, {
    kind: "open",
    uri: next.uri,
    documentVersion: next.documentVersion,
    text: next.text,
  })
}

function mergeWorkspaceFileChange(
  previous: "created" | "changed" | "deleted" | undefined,
  next: "created" | "changed" | "deleted",
): "created" | "changed" | "deleted" | undefined {
  if (!previous) return next
  if (previous === "created") {
    return next === "changed" ? "created" : next
  }
  if (previous === "deleted") return next === "created" ? "changed" : next
  return next === "created" ? "changed" : next
}

function cancellationError(
  state: SemanticWorkerTerminalCancellationState,
): SemanticWorkerSupervisorError {
  if (state === SemanticWorkerCancelState.clientCancelled) {
    return new SemanticWorkerSupervisorError("client-cancelled")
  }
  if (state === SemanticWorkerCancelState.contentModified) {
    return new SemanticWorkerSupervisorError("content-modified")
  }
  return new SemanticWorkerSupervisorError("worker-unavailable")
}

function cancelWithoutThrowing(
  cell: SharedArrayBuffer,
  reason: SemanticWorkerTerminalCancellationState,
): void {
  try {
    cancelSemanticWorkerRequest(cell, reason)
  } catch {
    // The fatal path must still settle if the shared cell was corrupted by the worker.
  }
}

function readCancellationWithoutThrowing(
  cell: SharedArrayBuffer,
): number | undefined {
  try {
    return readSemanticWorkerCancellationState(cell)
  } catch {
    return undefined
  }
}

function assertCanonicalRootUri(rootUri: string): void {
  try {
    if (!isCanonicalSemanticWorkerFileUri(rootUri)) {
      throw new Error("Invalid semantic worker root URI")
    }
    decodeSemanticWorkerMutation({
      protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
      epoch: 1,
      revision: 1,
      kind: "workspaceFilesChanged",
      rootUri,
      rootDirty: true,
      resourceDirty: false,
      resourceChanged: false,
      changes: [],
    })
    return
  } catch (error) {
    throw new SemanticWorkerSupervisorError("invalid-request", { cause: error })
  }
}

function isUriWithinRoot(uriValue: string, rootValue: string): boolean {
  if (
    !isCanonicalSemanticWorkerFileUri(uriValue)
    || !isCanonicalSemanticWorkerFileUri(rootValue)
  ) return false
  const uri = new URL(uriValue)
  const root = new URL(rootValue)
  const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`
  return uri.host === root.host
    && (uri.pathname === root.pathname || uri.pathname.startsWith(rootPath))
}
