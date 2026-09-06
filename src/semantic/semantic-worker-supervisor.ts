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
  #terminatePromise: Promise<void> | undefined
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
      error: error => this.#fail(error),
      exit: code => this.#fail(new Error(`Semantic worker exited with code ${code}`)),
    })
  }

  mutate(input: RootSemanticWorkerMutationInput): Promise<void> {
    this.#assertAvailable()
    assertMutationTargetsRoot(this.#rootUri, input)
    if (mutationExceedsTransportBounds(input)) {
      return this.#rejectMutationAndRestart()
    }
    let snapshot: RootSemanticWorkerMutationInput
    try {
      snapshot = canonicalMutationInput(this.#epoch, input)
    } catch (error) {
      throw new SemanticWorkerSupervisorError("invalid-request", { cause: error })
    }
    if (
      snapshot.kind === "workspaceFilesChanged"
        ? snapshot.rootUri !== this.#rootUri
        : !isUriWithinRoot(snapshot.uri, this.#rootUri)
    ) throw new SemanticWorkerSupervisorError("invalid-request")
    const documentKey = snapshot.kind === "workspaceFilesChanged" ? undefined : snapshot.uri
    const existing = snapshot.kind === "workspaceFilesChanged"
      ? this.#pendingMutations.find(record => record.input.kind === "workspaceFilesChanged")
      : this.#pendingMutations.find(record => record.documentKey === documentKey)
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
    const documentCount = this.#pendingMutations.reduce(
      (count, record) => count + Number(record.documentKey !== undefined),
      0,
    ) + Number(documentKey !== undefined && !existing)
    if (
      documentCount > RootSemanticWorkerSupervisor.maxQueuedMutationDocuments
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
      snapshot = canonicalRequestInput(this.#epoch, this.#nextRequestId, input, cancelCell)
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
        const wire = decodeSemanticWorkerMutation({
          protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
          epoch: this.#epoch,
          revision: this.#appliedRevision + 1,
          ...record.input,
        })
        record.wire = wire
        this.#endpoint.send(wire)
      } else {
        const wire = decodeSemanticWorkerRequest({
          protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
          epoch: this.#epoch,
          id: this.#nextRequestId++,
          requiredRevision: this.#appliedRevision,
          ...record.input,
          cancelCell: record.cancelCell,
        })
        record.wire = wire
        this.#endpoint.send(wire)
      }
    } catch (error) {
      this.#fail(error)
    }
  }

  #receive(message: unknown): void {
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

  #fail(error: unknown): void {
    if (this.#failure) return
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
    if (this.#active?.kind === "mutation") {
      this.#active.completion.reject(failure)
    } else {
      this.#active?.completion.reject(failure)
    }
    this.#active = undefined
    this.#finishActiveTerminal()
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
    this.#unlisten?.()
    this.#unlisten = undefined
    void this.#terminate().catch(() => {})
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
    void this.#terminate().then(
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
    } else {
      this.#active?.completion.reject(failure)
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

  #terminate(): Promise<void> {
    if (!this.#terminatePromise) {
      this.#unlisten?.()
      this.#unlisten = undefined
      this.#terminatePromise = Promise.resolve()
        .then(() => this.#endpoint.terminate())
        .then(() => undefined)
    }
    return this.#terminatePromise
  }

  async #disposeActive(disposalError: SemanticWorkerSupervisorError): Promise<void> {
    if (this.#active) {
      const terminal = this.#activeTerminal?.promise ?? Promise.resolve()
      const outcome = await Promise.race([
        terminal.then(() => "terminal" as const),
        Promise.resolve()
          .then(() => this.#waitForDisposeDeadline())
          .then(
            () => "deadline" as const,
            () => "deadline" as const,
          ),
      ])
      if (outcome === "deadline" && this.#active) {
        try {
          await this.#terminate()
        } finally {
          if (this.#active?.kind === "mutation") {
            this.#active.completion.reject(disposalError)
          } else {
            this.#active?.completion.reject(disposalError)
          }
          this.#active = undefined
          this.#finishActiveTerminal()
        }
        return
      }
    }
    await this.#terminate()
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
  const mutation = decodeSemanticWorkerMutation({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch,
    revision: 1,
    ...input,
  })
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
  const request = decodeSemanticWorkerRequest({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch,
    id,
    requiredRevision: 0,
    ...input,
    cancelCell,
  })
  return Object.freeze({
    method: request.method,
    uri: request.uri,
    expectedDocumentVersion: request.expectedDocumentVersion,
    args: request.args,
  }) as RootSemanticWorkerRequestInput
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
  return input.kind === "workspaceFilesChanged"
    && Array.isArray(input.changes)
    && input.changes.length > MAX_SEMANTIC_WORKER_FILE_CHANGES
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

function assertCanonicalRootUri(rootUri: string): void {
  try {
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
  const uri = new URL(uriValue)
  const root = new URL(rootValue)
  const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`
  return uri.host === root.host
    && (uri.pathname === root.pathname || uri.pathname.startsWith(rootPath))
}
