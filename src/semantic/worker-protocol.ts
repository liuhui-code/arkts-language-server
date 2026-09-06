export const SEMANTIC_WORKER_PROTOCOL_VERSION = 1 as const
export const MAX_SEMANTIC_WORKER_TEXT_BYTES = 4 * 1024 * 1024
export const MAX_SEMANTIC_WORKER_ARGS_BYTES = 256 * 1024
export const MAX_SEMANTIC_WORKER_MESSAGE_BYTES = 8 * 1024 * 1024
export const MAX_SEMANTIC_WORKER_FILE_CHANGES = 1_024
export const MAX_SEMANTIC_WORKER_URI_BYTES = 16 * 1024
export const MAX_SEMANTIC_WORKER_VALUE_DEPTH = 32
export const MAX_SEMANTIC_WORKER_VALUE_NODES = 4_096

export const SemanticWorkerCancelState = Object.freeze({
  active: 0,
  clientCancelled: 1,
  contentModified: 2,
  supervisorDisposing: 3,
} as const)

export type SemanticWorkerCancellationState =
  typeof SemanticWorkerCancelState[keyof typeof SemanticWorkerCancelState]
export type SemanticWorkerTerminalCancellationState = Exclude<SemanticWorkerCancellationState, 0>

export type SemanticWorkerDocumentMutationKind = "open" | "change" | "close"
export type SemanticWorkerMutationKind =
  | SemanticWorkerDocumentMutationKind
  | "workspaceFilesChanged"

export const SEMANTIC_WORKER_METHODS = Object.freeze([
  "complete",
  "resolveCompletion",
  "define",
  "typeDefinitions",
  "implementations",
  "references",
  "prepareRename",
  "rename",
  "documentHighlights",
  "inlayHints",
  "foldingRanges",
  "formatDocument",
  "documentSymbols",
  "diagnose",
  "codeActions",
  "resolveCodeAction",
  "hover",
  "signatureHelp",
] as const)

export type SemanticWorkerMethod = typeof SEMANTIC_WORKER_METHODS[number]

export const SEMANTIC_WORKER_ERROR_CODES = Object.freeze([
  "client-cancelled",
  "content-modified",
  "invalid-request",
  "workspace-incomplete",
  "queue-overflow",
  "worker-unavailable",
  "restart-required",
  "internal-error",
] as const)

export type SemanticWorkerErrorCode = typeof SEMANTIC_WORKER_ERROR_CODES[number]

const SEMANTIC_WORKER_ERROR_MESSAGES: Readonly<Record<SemanticWorkerErrorCode, string>> =
  Object.freeze({
    "client-cancelled": "Semantic request cancelled",
    "content-modified": "Semantic document changed",
    "invalid-request": "Invalid semantic worker request",
    "workspace-incomplete": "Semantic workspace is incomplete",
    "queue-overflow": "Semantic worker queue is full",
    "worker-unavailable": "Semantic worker unavailable",
    "restart-required": "Semantic worker restart required",
    "internal-error": "Semantic worker request failed",
  })

export interface SemanticWorkerError {
  readonly code: SemanticWorkerErrorCode
  readonly message: string
}

export type SemanticWorkerJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SemanticWorkerJsonValue[]
  | SemanticWorkerJsonObject

export interface SemanticWorkerJsonObject {
  readonly [key: string]: SemanticWorkerJsonValue
}

export interface SemanticWorkerDocumentMutation {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly revision: number
  readonly kind: SemanticWorkerDocumentMutationKind
  readonly uri: string
  readonly documentVersion: number
  readonly text?: string
}

export interface SemanticWorkerWorkspaceFileChange {
  readonly uri: string
  readonly kind: "created" | "changed" | "deleted"
}

export interface SemanticWorkerWorkspaceFilesChangedMutation {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly revision: number
  readonly kind: "workspaceFilesChanged"
  readonly rootUri: string
  readonly rootDirty: boolean
  readonly resourceDirty: boolean
  readonly resourceChanged: boolean
  readonly changes: readonly SemanticWorkerWorkspaceFileChange[]
}

export type SemanticWorkerMutation =
  | SemanticWorkerDocumentMutation
  | SemanticWorkerWorkspaceFilesChangedMutation

export interface SemanticWorkerMutationAck {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly appliedRevision: number
}

export interface SemanticWorkerPosition {
  readonly line: number
  readonly character: number
}

export interface SemanticWorkerRange {
  readonly start: SemanticWorkerPosition
  readonly end: SemanticWorkerPosition
}

export interface SemanticWorkerPositionArgs {
  readonly position: SemanticWorkerPosition
}

export interface SemanticWorkerReferencesArgs {
  readonly position: SemanticWorkerPosition
  readonly includeDeclaration: boolean
}

export interface SemanticWorkerRequestArgsByMethod {
  readonly complete: SemanticWorkerPositionArgs
  readonly resolveCompletion: SemanticWorkerPositionArgs & {
    readonly completion: SemanticWorkerJsonObject
  }
  readonly define: SemanticWorkerPositionArgs
  readonly typeDefinitions: SemanticWorkerPositionArgs
  readonly implementations: SemanticWorkerPositionArgs
  readonly references: SemanticWorkerReferencesArgs
  readonly prepareRename: SemanticWorkerPositionArgs
  readonly rename: SemanticWorkerPositionArgs & { readonly newName: string }
  readonly documentHighlights: SemanticWorkerPositionArgs
  readonly inlayHints: { readonly range: SemanticWorkerRange }
  readonly foldingRanges: {
    readonly lineFoldingOnly?: boolean
    readonly rangeLimit?: number
  }
  readonly formatDocument: {
    readonly options: {
      readonly tabSize: number
      readonly insertSpaces: boolean
      readonly trimTrailingWhitespace?: boolean
      readonly insertFinalNewline?: boolean
      readonly trimFinalNewlines?: boolean
    }
  }
  readonly documentSymbols: Readonly<Record<string, never>>
  readonly diagnose: Readonly<Record<string, never>>
  readonly codeActions: { readonly range: SemanticWorkerRange }
  readonly resolveCodeAction: { readonly action: SemanticWorkerJsonObject }
  readonly hover: SemanticWorkerPositionArgs
  readonly signatureHelp: SemanticWorkerPositionArgs & {
    readonly triggerReason:
      | { readonly kind: "invoked" }
      | {
          readonly kind: "characterTyped"
          readonly triggerCharacter: "(" | "," | "<"
        }
      | {
          readonly kind: "retrigger"
          readonly triggerCharacter?: "(" | "," | "<" | ")"
        }
  }
}

export interface SemanticWorkerRequestEnvelope<
  Method extends SemanticWorkerMethod,
  Args extends SemanticWorkerRequestArgsByMethod[Method],
> {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly id: number
  readonly requiredRevision: number
  readonly method: Method
  readonly uri: string
  readonly expectedDocumentVersion: number
  readonly args: Args
  readonly cancelCell: SharedArrayBuffer
}

export type SemanticWorkerRequest = {
  readonly [Method in SemanticWorkerMethod]: SemanticWorkerRequestEnvelope<
    Method,
    SemanticWorkerRequestArgsByMethod[Method]
  >
}[SemanticWorkerMethod]

export interface SemanticWorkerSuccessResponse {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly id: number
  readonly appliedRevision: number
  readonly documentVersion: number
  readonly ok: true
  readonly value: SemanticWorkerJsonValue
}

export interface SemanticWorkerErrorResponse {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly id: number
  readonly appliedRevision: number
  readonly documentVersion: number
  readonly ok: false
  readonly error: SemanticWorkerError
}

export type SemanticWorkerResponse = SemanticWorkerSuccessResponse | SemanticWorkerErrorResponse

export class SemanticWorkerProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SemanticWorkerProtocolError"
  }
}

export function createSemanticWorkerCancellationCell(): SharedArrayBuffer {
  return Object.freeze(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
}

export function readSemanticWorkerCancellationState(
  cell: unknown,
): SemanticWorkerCancellationState {
  const view = cancellationView(cell)
  const state = Atomics.load(view, 0)
  if (!isCancellationState(state)) {
    throw new SemanticWorkerProtocolError("Invalid semantic worker cancellation state")
  }
  return state
}

export function cancelSemanticWorkerRequest(
  cell: unknown,
  reason: SemanticWorkerTerminalCancellationState,
): SemanticWorkerTerminalCancellationState {
  if (
    reason !== SemanticWorkerCancelState.clientCancelled
    && reason !== SemanticWorkerCancelState.contentModified
    && reason !== SemanticWorkerCancelState.supervisorDisposing
  ) {
    throw new SemanticWorkerProtocolError("Invalid semantic worker cancellation state")
  }
  const view = cancellationView(cell)
  const previous = Atomics.compareExchange(view, 0, SemanticWorkerCancelState.active, reason)
  if (!isCancellationState(previous)) {
    throw new SemanticWorkerProtocolError("Invalid semantic worker cancellation state")
  }
  if (previous === SemanticWorkerCancelState.active) Atomics.notify(view, 0)
  return previous === SemanticWorkerCancelState.active ? reason : previous
}

export function createSemanticWorkerError(code: SemanticWorkerErrorCode): SemanticWorkerError {
  if (!isSemanticWorkerErrorCode(code)) throw invalidResponse()
  return Object.freeze({ code, message: SEMANTIC_WORKER_ERROR_MESSAGES[code] })
}

export function decodeSemanticWorkerMutation(value: unknown): SemanticWorkerMutation {
  const input = ownDataRecord(value)
  if (!input) throw invalidMutation()
  if (input.kind === "workspaceFilesChanged") return decodeWorkspaceFilesChangedMutation(input)
  const kind = input.kind
  const expectedKeys = kind === "close"
    ? ["protocol", "epoch", "revision", "kind", "uri", "documentVersion"]
    : ["protocol", "epoch", "revision", "kind", "uri", "documentVersion", "text"]
  if (
    !hasExactKeys(input, expectedKeys)
    || input.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION
    || !isPositiveSafeInteger(input.epoch)
    || !isPositiveSafeInteger(input.revision)
    || (kind !== "open" && kind !== "change" && kind !== "close")
    || !isCanonicalDocumentUri(input.uri)
    || !isNonNegativeSafeInteger(input.documentVersion)
    || (kind !== "close" && typeof input.text !== "string")
  ) throw invalidMutation()
  if (kind !== "close" && Buffer.byteLength(input.text as string) > MAX_SEMANTIC_WORKER_TEXT_BYTES) {
    throw new SemanticWorkerProtocolError("Semantic worker document text exceeds byte limit")
  }
  const mutation: SemanticWorkerDocumentMutation = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch as number,
    revision: input.revision as number,
    kind,
    uri: input.uri as string,
    documentVersion: input.documentVersion as number,
    ...(kind === "close" ? {} : { text: input.text as string }),
  }
  assertMessageByteLimit(mutation)
  return Object.freeze(mutation)
}

export function decodeSemanticWorkerMutationAck(value: unknown): SemanticWorkerMutationAck {
  const input = ownDataRecord(value)
  if (
    !input
    || !hasExactKeys(input, ["protocol", "epoch", "appliedRevision"])
    || input.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION
    || !isPositiveSafeInteger(input.epoch)
    || !isPositiveSafeInteger(input.appliedRevision)
  ) {
    throw new SemanticWorkerProtocolError("Invalid semantic worker mutation acknowledgement")
  }
  return Object.freeze({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch,
    appliedRevision: input.appliedRevision,
  })
}

export function decodeSemanticWorkerRequest(value: unknown): SemanticWorkerRequest {
  const input = ownDataRecord(value)
  if (
    !input
    || !hasExactKeys(input, [
      "protocol",
      "epoch",
      "id",
      "requiredRevision",
      "method",
      "uri",
      "expectedDocumentVersion",
      "args",
      "cancelCell",
    ])
    || input.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION
    || !isPositiveSafeInteger(input.epoch)
    || !isPositiveSafeInteger(input.id)
    || !isNonNegativeSafeInteger(input.requiredRevision)
    || !isSemanticWorkerMethod(input.method)
    || !isCanonicalDocumentUri(input.uri)
    || !isNonNegativeSafeInteger(input.expectedDocumentVersion)
  ) throw invalidRequest()
  const args = decodeRequestArgs(input.method, input.args)
  if (Buffer.byteLength(JSON.stringify(args)) > MAX_SEMANTIC_WORKER_ARGS_BYTES) {
    throw new SemanticWorkerProtocolError("Semantic worker request args exceed byte limit")
  }
  readSemanticWorkerCancellationState(input.cancelCell)
  Object.freeze(input.cancelCell as SharedArrayBuffer)
  const request = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch,
    id: input.id,
    requiredRevision: input.requiredRevision,
    method: input.method,
    uri: input.uri,
    expectedDocumentVersion: input.expectedDocumentVersion,
    args,
    cancelCell: input.cancelCell as SharedArrayBuffer,
  }
  assertMessageByteLimit(request)
  return Object.freeze(request) as SemanticWorkerRequest
}

export function decodeSemanticWorkerResponse(value: unknown): SemanticWorkerResponse {
  const input = ownDataRecord(value)
  if (
    !input
    || input.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION
    || !isPositiveSafeInteger(input.epoch)
    || !isPositiveSafeInteger(input.id)
    || !isNonNegativeSafeInteger(input.appliedRevision)
    || !isNonNegativeSafeInteger(input.documentVersion)
    || typeof input.ok !== "boolean"
  ) throw invalidResponse()
  if (input.ok) {
    if (!hasExactKeys(input, [
      "protocol",
      "epoch",
      "id",
      "appliedRevision",
      "documentVersion",
      "ok",
      "value",
    ])) throw invalidResponse()
    const response: SemanticWorkerSuccessResponse = {
      protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
      epoch: input.epoch,
      id: input.id,
      appliedRevision: input.appliedRevision,
      documentVersion: input.documentVersion,
      ok: true,
      value: decodeJsonValue(input.value, 0, { nodes: 0 }, invalidResponse),
    }
    assertMessageByteLimit(response)
    return Object.freeze(response)
  }
  if (!hasExactKeys(input, [
    "protocol",
    "epoch",
    "id",
    "appliedRevision",
    "documentVersion",
    "ok",
    "error",
  ])) throw invalidResponse()
  const response: SemanticWorkerErrorResponse = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch,
    id: input.id,
    appliedRevision: input.appliedRevision,
    documentVersion: input.documentVersion,
    ok: false,
    error: decodeSemanticWorkerError(input.error),
  }
  assertMessageByteLimit(response)
  return Object.freeze(response)
}

function invalidMutation(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Invalid semantic worker mutation")
}

function decodeWorkspaceFilesChangedMutation(
  input: Record<string, unknown>,
): SemanticWorkerWorkspaceFilesChangedMutation {
  if (
    !hasExactKeys(input, [
      "protocol",
      "epoch",
      "revision",
      "kind",
      "rootUri",
      "rootDirty",
      "resourceDirty",
      "resourceChanged",
      "changes",
    ])
    || input.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION
    || !isPositiveSafeInteger(input.epoch)
    || !isPositiveSafeInteger(input.revision)
    || !isCanonicalDocumentUri(input.rootUri)
    || typeof input.rootDirty !== "boolean"
    || typeof input.resourceDirty !== "boolean"
    || typeof input.resourceChanged !== "boolean"
    || (input.resourceDirty === true && input.resourceChanged !== true)
  ) throw invalidMutation()
  const changes = decodeWorkspaceFileChanges(input.changes, input.rootUri)
  if (!input.rootDirty && !input.resourceChanged && changes.length === 0) throw invalidMutation()
  const mutation: SemanticWorkerWorkspaceFilesChangedMutation = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch,
    revision: input.revision,
    kind: "workspaceFilesChanged",
    rootUri: input.rootUri,
    rootDirty: input.rootDirty,
    resourceDirty: input.resourceDirty,
    resourceChanged: input.resourceChanged,
    changes,
  }
  assertMessageByteLimit(mutation)
  return Object.freeze(mutation)
}

function decodeWorkspaceFileChanges(
  value: unknown,
  rootUri: string,
): readonly SemanticWorkerWorkspaceFileChange[] {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > MAX_SEMANTIC_WORKER_FILE_CHANGES
  ) throw invalidMutation()
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== value.length + 1
    || keys.some((key, index) => index < value.length
      ? key !== String(index)
      : key !== "length")
  ) throw invalidMutation()
  const changes: SemanticWorkerWorkspaceFileChange[] = []
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor?.enumerable || !("value" in descriptor)) throw invalidMutation()
    const change = ownDataRecord(descriptor.value)
    if (
      !change
      || !hasExactKeys(change, ["uri", "kind"])
      || !isCanonicalDocumentUri(change.uri)
      || !isUriWithinRoot(change.uri, rootUri)
      || (change.kind !== "created" && change.kind !== "changed" && change.kind !== "deleted")
    ) throw invalidMutation()
    changes.push(Object.freeze({ uri: change.uri, kind: change.kind }))
  }
  return Object.freeze(changes)
}

function invalidRequest(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Invalid semantic worker request")
}

function invalidResponse(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Invalid semantic worker response")
}

function isSemanticWorkerErrorCode(value: unknown): value is SemanticWorkerErrorCode {
  return typeof value === "string"
    && (SEMANTIC_WORKER_ERROR_CODES as readonly string[]).includes(value)
}

function decodeSemanticWorkerError(value: unknown): SemanticWorkerError {
  const error = ownDataRecord(value)
  if (
    !error
    || !hasExactKeys(error, ["code", "message"])
    || !isSemanticWorkerErrorCode(error.code)
    || error.message !== SEMANTIC_WORKER_ERROR_MESSAGES[error.code]
  ) throw invalidResponse()
  return createSemanticWorkerError(error.code)
}

function isSemanticWorkerMethod(value: unknown): value is SemanticWorkerMethod {
  return typeof value === "string"
    && (SEMANTIC_WORKER_METHODS as readonly string[]).includes(value)
}

function decodeRequestArgs(
  method: SemanticWorkerMethod,
  value: unknown,
): SemanticWorkerRequestArgsByMethod[SemanticWorkerMethod] {
  switch (method) {
    case "complete":
    case "define":
    case "typeDefinitions":
    case "implementations":
    case "prepareRename":
    case "documentHighlights":
    case "hover":
      return decodePositionArgs(value)
    case "resolveCompletion":
      return decodePositionAndJsonArgs(value, "completion")
    case "references":
      return decodeReferencesArgs(value)
    case "rename":
      return decodeRenameArgs(value)
    case "inlayHints":
    case "codeActions":
      return decodeRangeArgs(value)
    case "foldingRanges":
      return decodeFoldingRangeArgs(value)
    case "formatDocument":
      return decodeFormattingArgs(value)
    case "documentSymbols":
    case "diagnose":
      return decodeEmptyArgs(value)
    case "resolveCodeAction":
      return decodeJsonFieldArgs(value, "action")
    case "signatureHelp":
      return decodeSignatureHelpArgs(value)
  }
}

function decodePositionArgs(value: unknown): SemanticWorkerPositionArgs {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, ["position"])) throw invalidRequest()
  return Object.freeze({ position: decodePosition(args.position) })
}

function decodePositionAndJsonArgs(
  value: unknown,
  field: "completion",
): SemanticWorkerRequestArgsByMethod["resolveCompletion"] {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, ["position", field])) throw invalidRequest()
  return Object.freeze({
    position: decodePosition(args.position),
    [field]: decodeJsonObject(args[field]),
  }) as SemanticWorkerRequestArgsByMethod["resolveCompletion"]
}

function decodeJsonFieldArgs(
  value: unknown,
  field: "action",
): SemanticWorkerRequestArgsByMethod["resolveCodeAction"] {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, [field])) throw invalidRequest()
  return Object.freeze({ [field]: decodeJsonObject(args[field]) }) as unknown as (
    SemanticWorkerRequestArgsByMethod["resolveCodeAction"]
  )
}

function decodeReferencesArgs(value: unknown): SemanticWorkerReferencesArgs {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, ["position", "includeDeclaration"])) {
    throw invalidRequest()
  }
  const position = decodePosition(args.position)
  if (typeof args.includeDeclaration !== "boolean") throw invalidRequest()
  return Object.freeze({ position, includeDeclaration: args.includeDeclaration })
}

function decodeRenameArgs(value: unknown): SemanticWorkerRequestArgsByMethod["rename"] {
  const args = ownDataRecord(value)
  if (
    !args
    || !hasExactKeys(args, ["position", "newName"])
    || typeof args.newName !== "string"
  ) throw invalidRequest()
  return Object.freeze({ position: decodePosition(args.position), newName: args.newName })
}

function decodeRangeArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["inlayHints"] {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, ["range"])) throw invalidRequest()
  return Object.freeze({ range: decodeRange(args.range) })
}

function decodeRange(value: unknown): SemanticWorkerRange {
  const range = ownDataRecord(value)
  if (!range || !hasExactKeys(range, ["start", "end"])) throw invalidRequest()
  return Object.freeze({
    start: decodePosition(range.start),
    end: decodePosition(range.end),
  })
}

function decodeFoldingRangeArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["foldingRanges"] {
  const args = ownDataRecord(value)
  if (
    !args
    || !hasOnlyKeys(args, ["lineFoldingOnly", "rangeLimit"])
    || (Object.hasOwn(args, "lineFoldingOnly") && typeof args.lineFoldingOnly !== "boolean")
    || (Object.hasOwn(args, "rangeLimit") && !isNonNegativeSafeInteger(args.rangeLimit))
  ) throw invalidRequest()
  return Object.freeze({
    ...(Object.hasOwn(args, "lineFoldingOnly")
      ? { lineFoldingOnly: args.lineFoldingOnly as boolean }
      : {}),
    ...(Object.hasOwn(args, "rangeLimit") ? { rangeLimit: args.rangeLimit as number } : {}),
  })
}

function decodeFormattingArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["formatDocument"] {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, ["options"])) throw invalidRequest()
  const options = ownDataRecord(args.options)
  const optionalBooleans = [
    "trimTrailingWhitespace",
    "insertFinalNewline",
    "trimFinalNewlines",
  ] as const
  if (
    !options
    || !hasRequiredAndOnlyKeys(options, ["tabSize", "insertSpaces"], optionalBooleans)
    || !isPositiveSafeInteger(options.tabSize)
    || typeof options.insertSpaces !== "boolean"
    || optionalBooleans.some(key => Object.hasOwn(options, key) && typeof options[key] !== "boolean")
  ) throw invalidRequest()
  return Object.freeze({
    options: Object.freeze({
      tabSize: options.tabSize,
      insertSpaces: options.insertSpaces,
      ...Object.fromEntries(optionalBooleans.flatMap(key => (
        Object.hasOwn(options, key) ? [[key, options[key]]] : []
      ))),
    }),
  }) as SemanticWorkerRequestArgsByMethod["formatDocument"]
}

function decodeEmptyArgs(value: unknown): Readonly<Record<string, never>> {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, [])) throw invalidRequest()
  return Object.freeze({})
}

function decodeSignatureHelpArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["signatureHelp"] {
  const args = ownDataRecord(value)
  if (!args || !hasExactKeys(args, ["position", "triggerReason"])) throw invalidRequest()
  const trigger = ownDataRecord(args.triggerReason)
  if (!trigger || typeof trigger.kind !== "string") throw invalidRequest()
  let triggerReason: SemanticWorkerRequestArgsByMethod["signatureHelp"]["triggerReason"]
  if (trigger.kind === "invoked" && hasExactKeys(trigger, ["kind"])) {
    triggerReason = Object.freeze({ kind: "invoked" })
  } else if (
    trigger.kind === "characterTyped"
    && hasExactKeys(trigger, ["kind", "triggerCharacter"])
    && isTriggerCharacter(trigger.triggerCharacter, false)
  ) {
    triggerReason = Object.freeze({
      kind: "characterTyped",
      triggerCharacter: trigger.triggerCharacter,
    })
  } else if (
    trigger.kind === "retrigger"
    && hasOnlyKeys(trigger, ["kind", "triggerCharacter"])
    && Object.hasOwn(trigger, "kind")
    && (!Object.hasOwn(trigger, "triggerCharacter")
      || isTriggerCharacter(trigger.triggerCharacter, true))
  ) {
    triggerReason = Object.freeze({
      kind: "retrigger",
      ...(Object.hasOwn(trigger, "triggerCharacter")
        ? { triggerCharacter: trigger.triggerCharacter as "(" | "," | "<" | ")" }
        : {}),
    })
  } else {
    throw invalidRequest()
  }
  return Object.freeze({ position: decodePosition(args.position), triggerReason })
}

function isTriggerCharacter(value: unknown, closing: false): value is "(" | "," | "<"
function isTriggerCharacter(value: unknown, closing: true): value is "(" | "," | "<" | ")"
function isTriggerCharacter(value: unknown, closing: boolean): boolean {
  return value === "(" || value === "," || value === "<" || (closing && value === ")")
}

function decodePosition(value: unknown): SemanticWorkerPosition {
  const position = ownDataRecord(value)
  if (
    !position
    || !hasExactKeys(position, ["line", "character"])
    || !isNonNegativeSafeInteger(position.line)
    || !isNonNegativeSafeInteger(position.character)
  ) throw invalidRequest()
  return Object.freeze({ line: position.line, character: position.character })
}

function decodeJsonObject(value: unknown): SemanticWorkerJsonObject {
  const budget = { nodes: 0 }
  const decoded = decodeJsonValue(value, 0, budget)
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw invalidRequest()
  }
  return decoded as SemanticWorkerJsonObject
}

function decodeJsonValue(
  value: unknown,
  depth: number,
  budget: { nodes: number },
  onInvalid: () => SemanticWorkerProtocolError = invalidRequest,
): SemanticWorkerJsonValue {
  if (
    depth > MAX_SEMANTIC_WORKER_VALUE_DEPTH
    || ++budget.nodes > MAX_SEMANTIC_WORKER_VALUE_NODES
  ) throw onInvalid()
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw onInvalid()
    return value
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw onInvalid()
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== value.length + 1
      || keys.some((key, index) => index < value.length
        ? key !== String(index)
        : key !== "length")
    ) throw onInvalid()
    const result: SemanticWorkerJsonValue[] = []
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor?.enumerable || !("value" in descriptor)) throw onInvalid()
      result.push(decodeJsonValue(descriptor.value, depth + 1, budget, onInvalid))
    }
    return Object.freeze(result)
  }
  const record = ownDataRecord(value)
  if (!record) throw onInvalid()
  const result: Record<string, SemanticWorkerJsonValue> = {}
  for (const [key, nested] of Object.entries(record)) {
    Object.defineProperty(result, key, {
      value: decodeJsonValue(nested, depth + 1, budget, onInvalid),
      enumerable: true,
      configurable: false,
      writable: false,
    })
  }
  return Object.freeze(result)
}

function cancellationView(cell: unknown): Int32Array<SharedArrayBuffer> {
  if (!(cell instanceof SharedArrayBuffer) || cell.byteLength !== Int32Array.BYTES_PER_ELEMENT) {
    throw new SemanticWorkerProtocolError("Invalid semantic worker cancellation cell")
  }
  return new Int32Array(cell)
}

function isCancellationState(value: number): value is SemanticWorkerCancellationState {
  return value === SemanticWorkerCancelState.active
    || value === SemanticWorkerCancelState.clientCancelled
    || value === SemanticWorkerCancelState.contentModified
    || value === SemanticWorkerCancelState.supervisorDisposing
}

function ownDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return undefined
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined
    copy[key] = descriptor.value
  }
  return copy
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key))
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key))
}

function hasRequiredAndOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  return required.every(key => Object.hasOwn(value, key))
    && hasOnlyKeys(value, [...required, ...optional])
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isCanonicalDocumentUri(value: unknown): value is string {
  if (
    typeof value !== "string"
    || Buffer.byteLength(value) > MAX_SEMANTIC_WORKER_URI_BYTES
  ) return false
  try {
    const uri = new URL(value)
    return uri.protocol === "file:"
      && uri.username === ""
      && uri.password === ""
      && uri.search === ""
      && uri.hash === ""
      && uri.pathname.length > 0
      && uri.href === value
  } catch {
    return false
  }
}

function isUriWithinRoot(uriValue: string, rootValue: string): boolean {
  const uri = new URL(uriValue)
  const root = new URL(rootValue)
  const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`
  return uri.host === root.host
    && (uri.pathname === root.pathname || uri.pathname.startsWith(rootPath))
}

function assertMessageByteLimit(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_SEMANTIC_WORKER_MESSAGE_BYTES) {
    throw new SemanticWorkerProtocolError("Semantic worker message exceeds byte limit")
  }
}
