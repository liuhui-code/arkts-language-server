import { fileURLToPath, pathToFileURL } from "node:url"

export const SEMANTIC_WORKER_PROTOCOL_VERSION = 2 as const
export const MAX_SEMANTIC_WORKER_TEXT_BYTES = 4 * 1024 * 1024
export const MAX_SEMANTIC_WORKER_ARGS_BYTES = 256 * 1024
export const MAX_SEMANTIC_WORKER_MESSAGE_BYTES = 8 * 1024 * 1024
export const MAX_SEMANTIC_WORKER_FILE_CHANGES = 1_024
export const MAX_SEMANTIC_WORKER_URI_BYTES = 16 * 1024
export const MAX_SEMANTIC_WORKER_VALUE_DEPTH = 32
export const MAX_SEMANTIC_WORKER_VALUE_NODES = 65_536
export const MAX_SEMANTIC_WORKER_CALL_HIERARCHY_PREPARE_ITEMS = 16
export const MAX_SEMANTIC_WORKER_CALL_HIERARCHY_EDGES = 256
export const MAX_SEMANTIC_WORKER_CALL_HIERARCHY_RANGES_PER_EDGE = 64
export const MAX_SEMANTIC_WORKER_CALL_HIERARCHY_TOTAL_RANGES = 2_048
export const MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES = 4_096

const sharedArrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  SharedArrayBuffer.prototype,
  "byteLength",
)?.get
const sharedArrayBufferMaxByteLengthGetter = Object.getOwnPropertyDescriptor(
  SharedArrayBuffer.prototype,
  "maxByteLength",
)?.get

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
  "prepareCallHierarchy",
  "outgoingCalls",
  "incomingCalls",
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

export const SEMANTIC_WORKER_CALL_HIERARCHY_ITEM_KINDS = Object.freeze([
  "file",
  "module",
  "struct",
  "class",
  "interface",
  "function",
  "method",
  "property",
  "constructor",
  "variable",
  "constant",
] as const)

export type SemanticWorkerCallHierarchyItemKind =
  typeof SEMANTIC_WORKER_CALL_HIERARCHY_ITEM_KINDS[number]

export interface SemanticWorkerCallHierarchyInputItem {
  readonly uri: string
  readonly name: string
  readonly kind: SemanticWorkerCallHierarchyItemKind
  readonly detail?: string
  readonly range: SemanticWorkerRange
  readonly selectionRange: SemanticWorkerRange
}

export interface SemanticWorkerCallHierarchyResultItem
  extends SemanticWorkerCallHierarchyInputItem {
  readonly sourceFingerprint: string
}

export type SemanticWorkerCallHierarchyPrepareResult =
  | {
      readonly status: "complete"
      readonly items: readonly SemanticWorkerCallHierarchyResultItem[]
    }
  | {
      readonly status: "incomplete"
      readonly reason: SemanticWorkerCallHierarchyFailureReason
    }

export interface SemanticWorkerCallHierarchyOutgoingCall {
  readonly to: SemanticWorkerCallHierarchyResultItem
  readonly fromRanges: readonly SemanticWorkerRange[]
}

export type SemanticWorkerCallHierarchyOutgoingResult =
  | {
      readonly status: "complete"
      readonly calls: readonly SemanticWorkerCallHierarchyOutgoingCall[]
    }
  | { readonly status: "stale-item" }
  | {
      readonly status: "incomplete"
      readonly reason: SemanticWorkerCallHierarchyFailureReason
    }

export interface SemanticWorkerCallHierarchyIncomingCall {
  readonly from: SemanticWorkerCallHierarchyResultItem
  readonly fromRanges: readonly SemanticWorkerRange[]
}

export type SemanticWorkerCallHierarchyIncomingResult =
  | {
      readonly status: "complete"
      readonly calls: readonly SemanticWorkerCallHierarchyIncomingCall[]
    }
  | { readonly status: "stale-item" }
  | {
      readonly status: "incomplete"
      readonly reason: SemanticWorkerCallHierarchyFailureReason
    }

export const SEMANTIC_WORKER_CALL_HIERARCHY_FAILURE_REASONS = Object.freeze([
  "project-membership-incomplete",
  "source-outside-workspace",
  "source-unavailable",
  "source-unmappable",
  "result-limit-exceeded",
] as const)

export type SemanticWorkerCallHierarchyFailureReason =
  typeof SEMANTIC_WORKER_CALL_HIERARCHY_FAILURE_REASONS[number]

export interface SemanticWorkerCallHierarchyFollowupArgs {
  readonly item: SemanticWorkerCallHierarchyInputItem
  readonly sourceFingerprint: string
}

export interface SemanticWorkerPositionArgs {
  readonly position: SemanticWorkerPosition
}

export interface SemanticWorkerCompletionDiscoveryCandidate {
  readonly exportedName: string
  readonly kind: string
  readonly uri: string
  readonly ordinal: number
  readonly declarationIdentity?: string
  readonly importSpecifier?: string
  readonly moduleId?: string
  readonly targetScope?: string
}

export interface SemanticWorkerCompletionDiscovery {
  readonly incomplete: boolean
  readonly candidates: readonly SemanticWorkerCompletionDiscoveryCandidate[]
}

export interface SemanticWorkerReferencesArgs {
  readonly position: SemanticWorkerPosition
  readonly includeDeclaration: boolean
  readonly candidateUris?: readonly string[]
}

export interface SemanticWorkerRequestArgsByMethod {
  readonly complete: SemanticWorkerPositionArgs & {
    readonly snippets?: boolean
    readonly discovery?: SemanticWorkerCompletionDiscovery
  }
  readonly resolveCompletion: SemanticWorkerPositionArgs & {
    readonly completion: SemanticWorkerJsonObject
    readonly snippets?: boolean
  }
  readonly define: SemanticWorkerPositionArgs & { readonly isolate?: boolean }
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
  readonly prepareCallHierarchy: SemanticWorkerPositionArgs
  readonly outgoingCalls: SemanticWorkerCallHierarchyFollowupArgs
  readonly incomingCalls: SemanticWorkerCallHierarchyFollowupArgs
}

type SemanticWorkerFollowupMethod = "outgoingCalls" | "incomingCalls"

export type SemanticWorkerExpectedDocumentVersion<Method extends SemanticWorkerMethod> =
  Method extends SemanticWorkerFollowupMethod ? number | null : number

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
  readonly expectedDocumentVersion: SemanticWorkerExpectedDocumentVersion<Method>
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

interface DecodedSemanticWorkerSuccessResponse {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly id: number
  readonly appliedRevision: number
  readonly documentVersion: number | null
  readonly ok: true
  readonly value: SemanticWorkerJsonValue
}

interface DecodedSemanticWorkerErrorResponse {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly id: number
  readonly appliedRevision: number
  readonly documentVersion: number | null
  readonly ok: false
  readonly error: SemanticWorkerError
}

type DecodedSemanticWorkerResponse =
  | DecodedSemanticWorkerSuccessResponse
  | DecodedSemanticWorkerErrorResponse

export type SemanticWorkerResultByMethod<Method extends SemanticWorkerMethod> =
  Method extends "prepareCallHierarchy"
    ? SemanticWorkerCallHierarchyPrepareResult
    : Method extends "outgoingCalls"
      ? SemanticWorkerCallHierarchyOutgoingResult
      : Method extends "incomingCalls"
        ? SemanticWorkerCallHierarchyIncomingResult
        : SemanticWorkerJsonValue

export interface SemanticWorkerMethodSuccessResponse<Method extends SemanticWorkerMethod> {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly id: number
  readonly appliedRevision: number
  readonly documentVersion: SemanticWorkerExpectedDocumentVersion<Method>
  readonly ok: true
  readonly value: SemanticWorkerResultByMethod<Method>
}

export interface SemanticWorkerMethodErrorResponse<Method extends SemanticWorkerMethod> {
  readonly protocol: typeof SEMANTIC_WORKER_PROTOCOL_VERSION
  readonly epoch: number
  readonly id: number
  readonly appliedRevision: number
  readonly documentVersion: SemanticWorkerExpectedDocumentVersion<Method>
  readonly ok: false
  readonly error: SemanticWorkerError
}

export type SemanticWorkerMethodResponse<Method extends SemanticWorkerMethod> =
  | SemanticWorkerMethodSuccessResponse<Method>
  | SemanticWorkerMethodErrorResponse<Method>

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
  const state = Number(Atomics.load(view, 0))
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
  const input = ownDataRecord(value, [
    "protocol",
    "epoch",
    "revision",
    "kind",
  ], [
    "uri",
    "documentVersion",
    "text",
    "rootUri",
    "rootDirty",
    "resourceDirty",
    "resourceChanged",
    "changes",
  ])
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
    || !isCanonicalSemanticWorkerFileUri(input.uri)
    || !isNonNegativeSafeInteger(input.documentVersion)
    || (kind !== "close" && typeof input.text !== "string")
  ) throw invalidMutation()
  const textMetrics = kind === "close"
    ? undefined
    : stringByteMetrics(
        input.text as string,
        MAX_SEMANTIC_WORKER_TEXT_BYTES,
        MAX_SEMANTIC_WORKER_MESSAGE_BYTES,
        documentTextTooLarge,
        messageTooLarge,
      )
  const mutation: SemanticWorkerDocumentMutation = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch as number,
    revision: input.revision as number,
    kind,
    uri: input.uri as string,
    documentVersion: input.documentVersion as number,
    ...(kind === "close" ? {} : { text: input.text as string }),
  }
  assertMessageEnvelope([
    ["protocol", numberWireBytes(SEMANTIC_WORKER_PROTOCOL_VERSION)],
    ["epoch", numberWireBytes(mutation.epoch)],
    ["revision", numberWireBytes(mutation.revision)],
    ["kind", messageStringWireBytes(mutation.kind)],
    ["uri", messageStringWireBytes(mutation.uri)],
    ["documentVersion", numberWireBytes(mutation.documentVersion)],
    ...(textMetrics ? [["text", textMetrics.wireBytes] as const] : []),
  ])
  return Object.freeze(mutation)
}

export function decodeSemanticWorkerMutationAck(value: unknown): SemanticWorkerMutationAck {
  const input = ownDataRecord(value, ["protocol", "epoch", "appliedRevision"])
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
  const input = ownDataRecord(value, [
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
    || !isCanonicalSemanticWorkerFileUri(input.uri)
    || !isExpectedDocumentVersion(input.method, input.expectedDocumentVersion)
  ) throw invalidRequest()
  const strictCallHierarchyArgs = input.method === "prepareCallHierarchy"
    ? decodePositionArgs(input.args)
    : input.method === "outgoingCalls" || input.method === "incomingCalls"
      ? decodeCallHierarchyFollowupArgs(input.args)
      : undefined
  const canonicalArgs = canonicalizeJson(
    input.args,
    MAX_SEMANTIC_WORKER_ARGS_BYTES,
    invalidRequest,
    requestArgsTooLarge,
  )
  if (
    canonicalArgs.value === null
    || typeof canonicalArgs.value !== "object"
    || Array.isArray(canonicalArgs.value)
  ) throw invalidRequest()
  const args = strictCallHierarchyArgs ?? decodeRequestArgs(input.method, canonicalArgs.value)
  if (
    (input.method === "outgoingCalls" || input.method === "incomingCalls")
    && (args as SemanticWorkerCallHierarchyFollowupArgs).item.uri !== input.uri
  ) throw invalidRequest()
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
  assertMessageEnvelope([
    ["protocol", numberWireBytes(SEMANTIC_WORKER_PROTOCOL_VERSION)],
    ["epoch", numberWireBytes(request.epoch)],
    ["id", numberWireBytes(request.id)],
    ["requiredRevision", numberWireBytes(request.requiredRevision)],
    ["method", messageStringWireBytes(request.method)],
    ["uri", messageStringWireBytes(request.uri)],
    ["expectedDocumentVersion", nullableNumberWireBytes(request.expectedDocumentVersion)],
    ["args", canonicalArgs.wireBytes],
    ["cancelCell", Int32Array.BYTES_PER_ELEMENT],
  ])
  return Object.freeze(request) as SemanticWorkerRequest
}

export function decodeSemanticWorkerResponse(value: unknown): SemanticWorkerResponse {
  return decodeSemanticWorkerResponseEnvelope(value, false) as SemanticWorkerResponse
}

function decodeSemanticWorkerResponseEnvelope(
  value: unknown,
  allowNullDocumentVersion: boolean,
): DecodedSemanticWorkerResponse {
  const input = ownDataRecord(value, [
    "protocol",
    "epoch",
    "id",
    "appliedRevision",
    "documentVersion",
    "ok",
  ], [
    "value",
    "error",
  ])
  if (
    !input
    || input.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION
    || !isPositiveSafeInteger(input.epoch)
    || !isPositiveSafeInteger(input.id)
    || !isNonNegativeSafeInteger(input.appliedRevision)
    || (!isNonNegativeSafeInteger(input.documentVersion)
      && !(allowNullDocumentVersion && input.documentVersion === null))
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
    const canonicalValue = canonicalizeJson(
      input.value,
      MAX_SEMANTIC_WORKER_MESSAGE_BYTES,
      invalidResponse,
      messageTooLarge,
    )
    const response: DecodedSemanticWorkerSuccessResponse = {
      protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
      epoch: input.epoch,
      id: input.id,
      appliedRevision: input.appliedRevision,
      documentVersion: input.documentVersion,
      ok: true,
      value: canonicalValue.value,
    }
    assertMessageEnvelope([
      ["protocol", numberWireBytes(SEMANTIC_WORKER_PROTOCOL_VERSION)],
      ["epoch", numberWireBytes(response.epoch)],
      ["id", numberWireBytes(response.id)],
      ["appliedRevision", numberWireBytes(response.appliedRevision)],
      ["documentVersion", nullableNumberWireBytes(response.documentVersion)],
      ["ok", booleanWireBytes(true)],
      ["value", canonicalValue.wireBytes],
    ])
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
  const response: DecodedSemanticWorkerErrorResponse = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch,
    id: input.id,
    appliedRevision: input.appliedRevision,
    documentVersion: input.documentVersion,
    ok: false,
    error: decodeSemanticWorkerError(input.error),
  }
  const errorBytes = jsonObjectWireBytes([
    ["code", messageStringWireBytes(response.error.code)],
    ["message", messageStringWireBytes(response.error.message)],
  ], MAX_SEMANTIC_WORKER_MESSAGE_BYTES, messageTooLarge)
  assertMessageEnvelope([
    ["protocol", numberWireBytes(SEMANTIC_WORKER_PROTOCOL_VERSION)],
    ["epoch", numberWireBytes(response.epoch)],
    ["id", numberWireBytes(response.id)],
    ["appliedRevision", numberWireBytes(response.appliedRevision)],
    ["documentVersion", nullableNumberWireBytes(response.documentVersion)],
    ["ok", booleanWireBytes(false)],
    ["error", errorBytes],
  ])
  return Object.freeze(response)
}

export function decodeSemanticWorkerResponseForMethod<Method extends SemanticWorkerMethod>(
  method: Method,
  value: unknown,
): SemanticWorkerMethodResponse<Method> {
  if (!isSemanticWorkerMethod(method)) throw invalidResponse()
  const callHierarchyValue = isCallHierarchyMethod(method)
    ? decodeRawCallHierarchyResponseValue(method, value)
    : undefined
  const response = decodeSemanticWorkerResponseEnvelope(
    value,
    method === "outgoingCalls" || method === "incomingCalls",
  )
  if (!response.ok) {
    return response as SemanticWorkerMethodResponse<Method>
  }
  return Object.freeze({
    ...response,
    value: callHierarchyValue ?? response.value,
  }) as SemanticWorkerMethodResponse<Method>
}

function decodeRawCallHierarchyResponseValue(
  method: "prepareCallHierarchy" | "outgoingCalls" | "incomingCalls",
  value: unknown,
): SemanticWorkerCallHierarchyPrepareResult
  | SemanticWorkerCallHierarchyOutgoingResult
  | SemanticWorkerCallHierarchyIncomingResult
  | undefined {
  const response = ownDataRecord(value, [
    "protocol",
    "epoch",
    "id",
    "appliedRevision",
    "documentVersion",
    "ok",
  ], [
    "value",
    "error",
  ])
  if (!response || typeof response.ok !== "boolean") throw invalidResponse()
  if (!response.ok) return undefined
  if (!hasExactKeys(response, [
    "protocol",
    "epoch",
    "id",
    "appliedRevision",
    "documentVersion",
    "ok",
    "value",
  ])) throw invalidResponse()
  switch (method) {
    case "prepareCallHierarchy": return decodeCallHierarchyPrepareResult(response.value)
    case "outgoingCalls": return decodeCallHierarchyOutgoingResult(response.value)
    case "incomingCalls": return decodeCallHierarchyIncomingResult(response.value)
  }
}

function decodeCallHierarchyPrepareResult(
  value: unknown,
): SemanticWorkerCallHierarchyPrepareResult {
  const outcome = ownDataRecord(value, ["status"], ["items", "reason"])
  if (!outcome) throw invalidResponse()
  if (outcome.status === "complete" && hasExactKeys(outcome, ["status", "items"])) {
    return Object.freeze({
      status: "complete",
      items: decodeCallHierarchyResultItems(
        outcome.items,
        MAX_SEMANTIC_WORKER_CALL_HIERARCHY_PREPARE_ITEMS,
      ),
    })
  }
  if (
    outcome.status === "incomplete"
    && hasExactKeys(outcome, ["status", "reason"])
    && isCallHierarchyFailureReason(outcome.reason)
  ) {
    return Object.freeze({ status: "incomplete", reason: outcome.reason })
  }
  throw invalidResponse()
}

function decodeCallHierarchyOutgoingResult(
  value: unknown,
): SemanticWorkerCallHierarchyOutgoingResult {
  const outcome = ownDataRecord(value, ["status"], ["calls", "reason"])
  if (!outcome) throw invalidResponse()
  if (outcome.status === "complete" && hasExactKeys(outcome, ["status", "calls"])) {
    return Object.freeze({
      status: "complete",
      calls: decodeCallHierarchyOutgoingCalls(outcome.calls),
    })
  }
  if (outcome.status === "stale-item" && hasExactKeys(outcome, ["status"])) {
    return Object.freeze({ status: "stale-item" })
  }
  if (
    outcome.status === "incomplete"
    && hasExactKeys(outcome, ["status", "reason"])
    && isCallHierarchyFailureReason(outcome.reason)
  ) {
    return Object.freeze({ status: "incomplete", reason: outcome.reason })
  }
  throw invalidResponse()
}

function decodeCallHierarchyOutgoingCalls(
  value: unknown,
): readonly SemanticWorkerCallHierarchyOutgoingCall[] {
  const rawCalls = readBoundedDenseArray(
    value,
    MAX_SEMANTIC_WORKER_CALL_HIERARCHY_EDGES,
    invalidResponse,
  )
  const calls: SemanticWorkerCallHierarchyOutgoingCall[] = []
  let totalRanges = 0
  for (const rawCall of rawCalls) {
    const call = ownDataRecord(rawCall, ["to", "fromRanges"])
    if (!call || !hasExactKeys(call, ["to", "fromRanges"])) throw invalidResponse()
    const fromRanges = decodeCallHierarchyRanges(
      call.fromRanges,
      MAX_SEMANTIC_WORKER_CALL_HIERARCHY_RANGES_PER_EDGE,
    )
    totalRanges += fromRanges.length
    if (totalRanges > MAX_SEMANTIC_WORKER_CALL_HIERARCHY_TOTAL_RANGES) {
      throw invalidResponse()
    }
    calls.push(Object.freeze({
      to: decodeCallHierarchyResultItem(call.to),
      fromRanges,
    }))
  }
  return Object.freeze(calls)
}

function decodeCallHierarchyIncomingResult(
  value: unknown,
): SemanticWorkerCallHierarchyIncomingResult {
  const outcome = ownDataRecord(value, ["status"], ["calls", "reason"])
  if (!outcome) throw invalidResponse()
  if (outcome.status === "complete" && hasExactKeys(outcome, ["status", "calls"])) {
    return Object.freeze({
      status: "complete",
      calls: decodeCallHierarchyIncomingCalls(outcome.calls),
    })
  }
  if (outcome.status === "stale-item" && hasExactKeys(outcome, ["status"])) {
    return Object.freeze({ status: "stale-item" })
  }
  if (
    outcome.status === "incomplete"
    && hasExactKeys(outcome, ["status", "reason"])
    && isCallHierarchyFailureReason(outcome.reason)
  ) {
    return Object.freeze({ status: "incomplete", reason: outcome.reason })
  }
  throw invalidResponse()
}

function decodeCallHierarchyIncomingCalls(
  value: unknown,
): readonly SemanticWorkerCallHierarchyIncomingCall[] {
  const rawCalls = readBoundedDenseArray(
    value,
    MAX_SEMANTIC_WORKER_CALL_HIERARCHY_EDGES,
    invalidResponse,
  )
  const calls: SemanticWorkerCallHierarchyIncomingCall[] = []
  let totalRanges = 0
  for (const rawCall of rawCalls) {
    const call = ownDataRecord(rawCall, ["from", "fromRanges"])
    if (!call || !hasExactKeys(call, ["from", "fromRanges"])) throw invalidResponse()
    const fromRanges = decodeCallHierarchyRanges(
      call.fromRanges,
      MAX_SEMANTIC_WORKER_CALL_HIERARCHY_RANGES_PER_EDGE,
    )
    totalRanges += fromRanges.length
    if (totalRanges > MAX_SEMANTIC_WORKER_CALL_HIERARCHY_TOTAL_RANGES) {
      throw invalidResponse()
    }
    calls.push(Object.freeze({
      from: decodeCallHierarchyResultItem(call.from),
      fromRanges,
    }))
  }
  return Object.freeze(calls)
}

function decodeCallHierarchyRanges(
  value: unknown,
  maxRanges: number,
): readonly SemanticWorkerRange[] {
  const rawRanges = readBoundedDenseArray(value, maxRanges, invalidResponse)
  const ranges: SemanticWorkerRange[] = []
  for (const range of rawRanges) ranges.push(decodeResponseRange(range))
  return Object.freeze(ranges)
}

function decodeCallHierarchyResultItems(
  value: unknown,
  maxItems: number,
): readonly SemanticWorkerCallHierarchyResultItem[] {
  const rawItems = readBoundedDenseArray(value, maxItems, invalidResponse)
  const items: SemanticWorkerCallHierarchyResultItem[] = []
  for (const item of rawItems) items.push(decodeCallHierarchyResultItem(item))
  return Object.freeze(items)
}

function decodeCallHierarchyResultItem(value: unknown): SemanticWorkerCallHierarchyResultItem {
  const item = ownDataRecord(value, [
    "uri",
    "name",
    "kind",
    "sourceFingerprint",
    "range",
    "selectionRange",
  ], ["detail"])
  if (
    !item
    || !hasRequiredAndOnlyKeys(
      item,
      ["uri", "name", "kind", "sourceFingerprint", "range", "selectionRange"],
      ["detail"],
    )
    || !isCanonicalSemanticWorkerFileUri(item.uri)
    || typeof item.name !== "string"
    || item.name.length === 0
    || !isCallHierarchyItemKind(item.kind)
    || !isSourceFingerprint(item.sourceFingerprint)
    || (Object.hasOwn(item, "detail") && typeof item.detail !== "string")
  ) throw invalidResponse()
  const range = decodeResponseRange(item.range)
  const selectionRange = decodeResponseRange(item.selectionRange)
  if (!containsRange(range, selectionRange)) throw invalidResponse()
  return Object.freeze({
    uri: item.uri,
    name: item.name,
    kind: item.kind,
    sourceFingerprint: item.sourceFingerprint,
    ...(Object.hasOwn(item, "detail") ? { detail: item.detail as string } : {}),
    range,
    selectionRange,
  })
}

function decodeResponseRange(value: unknown): SemanticWorkerRange {
  const range = ownDataRecord(value, ["start", "end"])
  if (!range || !hasExactKeys(range, ["start", "end"])) throw invalidResponse()
  const decoded = Object.freeze({
    start: decodeResponsePosition(range.start),
    end: decodeResponsePosition(range.end),
  })
  if (comparePositions(decoded.start, decoded.end) > 0) throw invalidResponse()
  return decoded
}

function decodeResponsePosition(value: unknown): SemanticWorkerPosition {
  const position = ownDataRecord(value, ["line", "character"])
  if (
    !position
    || !hasExactKeys(position, ["line", "character"])
    || !isNonNegativeSafeInteger(position.line)
    || !isNonNegativeSafeInteger(position.character)
  ) throw invalidResponse()
  return Object.freeze({ line: position.line, character: position.character })
}

function invalidMutation(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Invalid semantic worker mutation")
}

function documentTextTooLarge(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Semantic worker document text exceeds byte limit")
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
    || !isCanonicalSemanticWorkerFileUri(input.rootUri)
    || typeof input.rootDirty !== "boolean"
    || typeof input.resourceDirty !== "boolean"
    || typeof input.resourceChanged !== "boolean"
    || (input.resourceDirty === true && input.resourceChanged !== true)
  ) throw invalidMutation()
  const decodedChanges = decodeWorkspaceFileChanges(input.changes, input.rootUri)
  if (!input.rootDirty && !input.resourceChanged && decodedChanges.value.length === 0) {
    throw invalidMutation()
  }
  const mutation: SemanticWorkerWorkspaceFilesChangedMutation = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: input.epoch,
    revision: input.revision,
    kind: "workspaceFilesChanged",
    rootUri: input.rootUri,
    rootDirty: input.rootDirty,
    resourceDirty: input.resourceDirty,
    resourceChanged: input.resourceChanged,
    changes: decodedChanges.value,
  }
  assertMessageEnvelope([
    ["protocol", numberWireBytes(SEMANTIC_WORKER_PROTOCOL_VERSION)],
    ["epoch", numberWireBytes(mutation.epoch)],
    ["revision", numberWireBytes(mutation.revision)],
    ["kind", messageStringWireBytes(mutation.kind)],
    ["rootUri", messageStringWireBytes(mutation.rootUri)],
    ["rootDirty", booleanWireBytes(mutation.rootDirty)],
    ["resourceDirty", booleanWireBytes(mutation.resourceDirty)],
    ["resourceChanged", booleanWireBytes(mutation.resourceChanged)],
    ["changes", decodedChanges.wireBytes],
  ])
  return Object.freeze(mutation)
}

interface DecodedWorkspaceFileChanges {
  readonly value: readonly SemanticWorkerWorkspaceFileChange[]
  readonly wireBytes: number
}

function decodeWorkspaceFileChanges(
  value: unknown,
  rootUri: string,
): DecodedWorkspaceFileChanges {
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
  let wireBytes = 2 + Math.max(0, value.length - 1)
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor?.enumerable || !("value" in descriptor)) throw invalidMutation()
    const change = ownDataRecord(descriptor.value, ["uri", "kind"])
    if (
      !change
      || !hasExactKeys(change, ["uri", "kind"])
      || !isCanonicalSemanticWorkerFileUri(change.uri)
      || !isUriWithinRoot(change.uri, rootUri)
      || (change.kind !== "created" && change.kind !== "changed" && change.kind !== "deleted")
    ) throw invalidMutation()
    const decoded = Object.freeze({ uri: change.uri, kind: change.kind })
    changes.push(decoded)
    wireBytes += jsonObjectWireBytes([
      ["uri", messageStringWireBytes(decoded.uri)],
      ["kind", messageStringWireBytes(decoded.kind)],
    ], MAX_SEMANTIC_WORKER_MESSAGE_BYTES - wireBytes, messageTooLarge)
    if (wireBytes > MAX_SEMANTIC_WORKER_MESSAGE_BYTES) throw messageTooLarge()
  }
  return Object.freeze({ value: Object.freeze(changes), wireBytes })
}

function invalidRequest(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Invalid semantic worker request")
}

function requestArgsTooLarge(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Semantic worker request args exceed byte limit")
}

function invalidResponse(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Invalid semantic worker response")
}

function messageTooLarge(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Semantic worker message exceeds byte limit")
}

function isSemanticWorkerErrorCode(value: unknown): value is SemanticWorkerErrorCode {
  return typeof value === "string"
    && (SEMANTIC_WORKER_ERROR_CODES as readonly string[]).includes(value)
}

function decodeSemanticWorkerError(value: unknown): SemanticWorkerError {
  const error = ownDataRecord(value, ["code", "message"])
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

function isCallHierarchyMethod(
  method: SemanticWorkerMethod,
): method is "prepareCallHierarchy" | "outgoingCalls" | "incomingCalls" {
  return method === "prepareCallHierarchy"
    || method === "outgoingCalls"
    || method === "incomingCalls"
}

function decodeRequestArgs(
  method: SemanticWorkerMethod,
  value: unknown,
): SemanticWorkerRequestArgsByMethod[SemanticWorkerMethod] {
  switch (method) {
    case "complete":
      return decodeCompletionArgs(value)
    case "typeDefinitions":
    case "implementations":
    case "prepareRename":
    case "documentHighlights":
    case "hover":
    case "prepareCallHierarchy":
      return decodePositionArgs(value)
    case "define":
      return decodeDefinitionArgs(value)
    case "resolveCompletion":
      return decodeResolveCompletionArgs(value)
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
    case "outgoingCalls":
    case "incomingCalls":
      return decodeCallHierarchyFollowupArgs(value)
  }
}

function decodeCallHierarchyFollowupArgs(
  value: unknown,
): SemanticWorkerCallHierarchyFollowupArgs {
  const args = ownDataRecord(value, ["item", "sourceFingerprint"])
  if (
    !args
    || !hasExactKeys(args, ["item", "sourceFingerprint"])
    || !isSourceFingerprint(args.sourceFingerprint)
  ) throw invalidRequest()
  return Object.freeze({
    item: decodeCallHierarchyInputItem(args.item),
    sourceFingerprint: args.sourceFingerprint,
  })
}

function decodeCallHierarchyInputItem(value: unknown): SemanticWorkerCallHierarchyInputItem {
  const item = ownDataRecord(value, [
    "uri",
    "name",
    "kind",
    "range",
    "selectionRange",
  ], ["detail"])
  if (
    !item
    || !hasRequiredAndOnlyKeys(
      item,
      ["uri", "name", "kind", "range", "selectionRange"],
      ["detail"],
    )
    || !isCanonicalSemanticWorkerFileUri(item.uri)
    || typeof item.name !== "string"
    || item.name.length === 0
    || !isCallHierarchyItemKind(item.kind)
    || (Object.hasOwn(item, "detail") && typeof item.detail !== "string")
  ) throw invalidRequest()
  const range = decodeOrderedRange(item.range)
  const selectionRange = decodeOrderedRange(item.selectionRange)
  if (!containsRange(range, selectionRange)) throw invalidRequest()
  return Object.freeze({
    uri: item.uri,
    name: item.name,
    kind: item.kind,
    ...(Object.hasOwn(item, "detail") ? { detail: item.detail as string } : {}),
    range,
    selectionRange,
  })
}

function decodePositionArgs(value: unknown): SemanticWorkerPositionArgs {
  const args = ownDataRecord(value, ["position"])
  if (!args || !hasExactKeys(args, ["position"])) throw invalidRequest()
  return Object.freeze({ position: decodePosition(args.position) })
}

function decodeCompletionArgs(value: unknown): SemanticWorkerRequestArgsByMethod["complete"] {
  const args = ownDataRecord(value, ["position"], ["snippets", "discovery"])
  if (
    !args
    || !hasRequiredAndOnlyKeys(args, ["position"], ["snippets", "discovery"])
    || (Object.hasOwn(args, "snippets") && typeof args.snippets !== "boolean")
  ) throw invalidRequest()
  return Object.freeze({
    position: decodePosition(args.position),
    ...(Object.hasOwn(args, "snippets") ? { snippets: args.snippets as boolean } : {}),
    ...(Object.hasOwn(args, "discovery")
      ? { discovery: decodeCompletionDiscovery(args.discovery) }
      : {}),
  })
}

function decodeCompletionDiscovery(value: unknown): SemanticWorkerCompletionDiscovery {
  const discovery = ownDataRecord(value, ["incomplete", "candidates"])
  if (
    !discovery
    || !hasExactKeys(discovery, ["incomplete", "candidates"])
    || typeof discovery.incomplete !== "boolean"
    || !Array.isArray(discovery.candidates)
    || Object.getPrototypeOf(discovery.candidates) !== Array.prototype
    || discovery.candidates.length > 256
  ) throw invalidRequest()
  const candidates = discovery.candidates.map((value) => {
    const candidate = ownDataRecord(
      value,
      ["exportedName", "kind", "uri", "ordinal"],
      ["declarationIdentity", "importSpecifier", "moduleId", "targetScope"],
    )
    const optionalStrings = [
      "declarationIdentity",
      "importSpecifier",
      "moduleId",
      "targetScope",
    ] as const
    if (
      !candidate
      || !hasRequiredAndOnlyKeys(
        candidate,
        ["exportedName", "kind", "uri", "ordinal"],
        optionalStrings,
      )
      || typeof candidate.exportedName !== "string"
      || candidate.exportedName.length === 0
      || typeof candidate.kind !== "string"
      || !isCanonicalSemanticWorkerFileUri(candidate.uri)
      || !isNonNegativeSafeInteger(candidate.ordinal)
      || optionalStrings.some((key) => (
        Object.hasOwn(candidate, key) && typeof candidate[key] !== "string"
      ))
    ) throw invalidRequest()
    return Object.freeze({
      exportedName: candidate.exportedName,
      kind: candidate.kind,
      uri: candidate.uri,
      ordinal: candidate.ordinal,
      ...Object.fromEntries(optionalStrings.flatMap((key) => (
        Object.hasOwn(candidate, key) ? [[key, candidate[key]]] : []
      ))),
    }) as SemanticWorkerCompletionDiscoveryCandidate
  })
  return Object.freeze({
    incomplete: discovery.incomplete,
    candidates: Object.freeze(candidates),
  })
}

function decodeResolveCompletionArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["resolveCompletion"] {
  const args = ownDataRecord(value, ["position", "completion"], ["snippets"])
  if (
    !args
    || !hasRequiredAndOnlyKeys(args, ["position", "completion"], ["snippets"])
    || (Object.hasOwn(args, "snippets") && typeof args.snippets !== "boolean")
  ) throw invalidRequest()
  return Object.freeze({
    position: decodePosition(args.position),
    completion: canonicalJsonObject(args.completion),
    ...(Object.hasOwn(args, "snippets") ? { snippets: args.snippets as boolean } : {}),
  })
}

function decodeJsonFieldArgs(
  value: unknown,
  field: "action",
): SemanticWorkerRequestArgsByMethod["resolveCodeAction"] {
  const args = ownDataRecord(value, [field])
  if (!args || !hasExactKeys(args, [field])) throw invalidRequest()
  return Object.freeze({ [field]: canonicalJsonObject(args[field]) }) as unknown as (
    SemanticWorkerRequestArgsByMethod["resolveCodeAction"]
  )
}

function decodeReferencesArgs(value: unknown): SemanticWorkerReferencesArgs {
  const args = ownDataRecord(value, ["position", "includeDeclaration"], ["candidateUris"])
  if (!args || !hasRequiredAndOnlyKeys(
    args,
    ["position", "includeDeclaration"],
    ["candidateUris"],
  )) {
    throw invalidRequest()
  }
  const position = decodePosition(args.position)
  if (typeof args.includeDeclaration !== "boolean") throw invalidRequest()
  let candidateUris: readonly string[] | undefined
  if (Object.hasOwn(args, "candidateUris")) {
    candidateUris = Object.freeze(readBoundedDenseArray(
      args.candidateUris,
      MAX_SEMANTIC_WORKER_REFERENCE_CANDIDATES,
      invalidRequest,
    ).map((uri) => {
      if (!isCanonicalSemanticWorkerFileUri(uri)) throw invalidRequest()
      return uri
    }))
  }
  return Object.freeze({
    position,
    includeDeclaration: args.includeDeclaration,
    ...(candidateUris ? { candidateUris } : {}),
  })
}

function decodeDefinitionArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["define"] {
  const args = ownDataRecord(value, ["position"], ["isolate"])
  if (!args || !hasRequiredAndOnlyKeys(args, ["position"], ["isolate"])
    || (Object.hasOwn(args, "isolate") && typeof args.isolate !== "boolean")) {
    throw invalidRequest()
  }
  return Object.freeze({
    position: decodePosition(args.position),
    ...(Object.hasOwn(args, "isolate") ? { isolate: args.isolate as boolean } : {}),
  })
}

function decodeRenameArgs(value: unknown): SemanticWorkerRequestArgsByMethod["rename"] {
  const args = ownDataRecord(value, ["position", "newName"])
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
  const args = ownDataRecord(value, ["range"])
  if (!args || !hasExactKeys(args, ["range"])) throw invalidRequest()
  return Object.freeze({ range: decodeRange(args.range) })
}

function decodeRange(value: unknown): SemanticWorkerRange {
  const range = ownDataRecord(value, ["start", "end"])
  if (!range || !hasExactKeys(range, ["start", "end"])) throw invalidRequest()
  return Object.freeze({
    start: decodePosition(range.start),
    end: decodePosition(range.end),
  })
}

function decodeOrderedRange(value: unknown): SemanticWorkerRange {
  const range = decodeRange(value)
  if (comparePositions(range.start, range.end) > 0) throw invalidRequest()
  return range
}

function containsRange(outer: SemanticWorkerRange, inner: SemanticWorkerRange): boolean {
  return comparePositions(outer.start, inner.start) <= 0
    && comparePositions(inner.end, outer.end) <= 0
}

function comparePositions(left: SemanticWorkerPosition, right: SemanticWorkerPosition): number {
  return left.line - right.line || left.character - right.character
}

function decodeFoldingRangeArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["foldingRanges"] {
  const args = ownDataRecord(value, [], ["lineFoldingOnly", "rangeLimit"])
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
  const args = ownDataRecord(value, ["options"])
  if (!args || !hasExactKeys(args, ["options"])) throw invalidRequest()
  const options = ownDataRecord(args.options, [
    "tabSize",
    "insertSpaces",
  ], [
    "trimTrailingWhitespace",
    "insertFinalNewline",
    "trimFinalNewlines",
  ])
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
  const args = ownDataRecord(value, [])
  if (!args || !hasExactKeys(args, [])) throw invalidRequest()
  return Object.freeze({})
}

function decodeSignatureHelpArgs(
  value: unknown,
): SemanticWorkerRequestArgsByMethod["signatureHelp"] {
  const args = ownDataRecord(value, ["position", "triggerReason"])
  if (!args || !hasExactKeys(args, ["position", "triggerReason"])) throw invalidRequest()
  const trigger = ownDataRecord(args.triggerReason, ["kind"], ["triggerCharacter"])
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
  const position = ownDataRecord(value, ["line", "character"])
  if (
    !position
    || !hasExactKeys(position, ["line", "character"])
    || !isNonNegativeSafeInteger(position.line)
    || !isNonNegativeSafeInteger(position.character)
  ) throw invalidRequest()
  return Object.freeze({ line: position.line, character: position.character })
}

interface CanonicalJsonResult {
  readonly value: SemanticWorkerJsonValue
  readonly wireBytes: number
  readonly nodes: number
}

interface CanonicalJsonState {
  readonly maxBytes: number
  readonly onInvalid: () => SemanticWorkerProtocolError
  readonly onByteLimit: () => SemanticWorkerProtocolError
  readonly seen: WeakSet<object>
  wireBytes: number
  nodes: number
}

type CanonicalJsonWork =
  | {
      readonly kind: "value"
      readonly input: unknown
      readonly depth: number
      readonly assign: (value: SemanticWorkerJsonValue) => void
    }
  | { readonly kind: "freeze"; readonly value: object }

function canonicalJsonObject(value: unknown): SemanticWorkerJsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalidRequest()
  }
  return value as SemanticWorkerJsonObject
}

function canonicalizeJson(
  input: unknown,
  maxBytes: number,
  onInvalid: () => SemanticWorkerProtocolError,
  onByteLimit: () => SemanticWorkerProtocolError,
): CanonicalJsonResult {
  const state: CanonicalJsonState = {
    maxBytes,
    onInvalid,
    onByteLimit,
    seen: new WeakSet(),
    wireBytes: 0,
    nodes: 0,
  }
  let result: SemanticWorkerJsonValue | undefined
  const work: CanonicalJsonWork[] = [{
    kind: "value",
    input,
    depth: 0,
    assign: value => { result = value },
  }]
  while (work.length > 0) {
    const current = work.pop() as CanonicalJsonWork
    if (current.kind === "freeze") {
      Object.freeze(current.value)
      continue
    }
    claimJsonNode(state, current.depth)
    const value = current.input
    if (value === null) {
      addWireBytes(state, 4)
      current.assign(null)
    } else if (typeof value === "string") {
      addWireBytes(state, jsonStringWireBytes(
        value,
        state.maxBytes - state.wireBytes,
        state.onByteLimit,
      ))
      current.assign(value)
    } else if (typeof value === "boolean") {
      addWireBytes(state, value ? 4 : 5)
      current.assign(value)
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) throw state.onInvalid()
      addWireBytes(state, String(Object.is(value, -0) ? 0 : value).length)
      current.assign(value)
    } else if (Array.isArray(value)) {
      canonicalizeJsonArray(value, current, state, work)
    } else if (typeof value === "object") {
      canonicalizeJsonRecord(value, current, state, work)
    } else {
      throw state.onInvalid()
    }
  }
  if (result === undefined) throw onInvalid()
  return Object.freeze({ value: result, wireBytes: state.wireBytes, nodes: state.nodes })
}

function canonicalizeJsonArray(
  input: unknown[],
  current: Extract<CanonicalJsonWork, { kind: "value" }>,
  state: CanonicalJsonState,
  work: CanonicalJsonWork[],
): void {
  if (Object.getPrototypeOf(input) !== Array.prototype || state.seen.has(input)) {
    throw state.onInvalid()
  }
  state.seen.add(input)
  if (input.length > MAX_SEMANTIC_WORKER_VALUE_NODES - state.nodes) {
    throw state.onInvalid()
  }
  const keys = Reflect.ownKeys(input)
  if (
    keys.length !== input.length + 1
    || keys.some((key, index) => index < input.length
      ? key !== String(index)
      : key !== "length")
  ) throw state.onInvalid()
  addWireBytes(state, 2 + Math.max(0, input.length - 1))
  const result: SemanticWorkerJsonValue[] = new Array(input.length)
  current.assign(result)
  work.push({ kind: "freeze", value: result })
  for (let index = input.length - 1; index >= 0; index -= 1) {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
    if (!descriptor?.enumerable || !("value" in descriptor) || descriptor.value === undefined) {
      throw state.onInvalid()
    }
    work.push({
      kind: "value",
      input: descriptor.value,
      depth: current.depth + 1,
      assign: value => { result[index] = value },
    })
  }
}

function canonicalizeJsonRecord(
  input: object,
  current: Extract<CanonicalJsonWork, { kind: "value" }>,
  state: CanonicalJsonState,
  work: CanonicalJsonWork[],
): void {
  const prototype = Object.getPrototypeOf(input)
  if (
    (prototype !== Object.prototype && prototype !== null)
    || state.seen.has(input)
  ) throw state.onInvalid()
  state.seen.add(input)
  const keys = Reflect.ownKeys(input)
  if (keys.length > MAX_SEMANTIC_WORKER_VALUE_NODES - state.nodes) {
    throw state.onInvalid()
  }
  const entries: Array<readonly [string, unknown]> = []
  for (const key of keys) {
    if (typeof key !== "string") throw state.onInvalid()
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    if (!descriptor?.enumerable || !("value" in descriptor)) throw state.onInvalid()
    if (descriptor.value === undefined) {
      claimJsonNode(state, current.depth + 1)
      continue
    }
    entries.push([key, descriptor.value])
  }
  addWireBytes(state, 2 + Math.max(0, entries.length - 1))
  const result: Record<string, SemanticWorkerJsonValue> = {}
  current.assign(result)
  work.push({ kind: "freeze", value: result })
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const [key, value] = entries[index]
    addWireBytes(state, jsonStringWireBytes(
      key,
      state.maxBytes - state.wireBytes - 1,
      state.onByteLimit,
    ) + 1)
    work.push({
      kind: "value",
      input: value,
      depth: current.depth + 1,
      assign: canonical => {
        Object.defineProperty(result, key, {
          value: canonical,
          enumerable: true,
          configurable: false,
          writable: false,
        })
      },
    })
  }
}

function claimJsonNode(state: CanonicalJsonState, depth: number): void {
  state.nodes += 1
  if (
    depth > MAX_SEMANTIC_WORKER_VALUE_DEPTH
    || state.nodes > MAX_SEMANTIC_WORKER_VALUE_NODES
  ) throw state.onInvalid()
}

function addWireBytes(state: CanonicalJsonState, bytes: number): void {
  state.wireBytes += bytes
  if (state.wireBytes > state.maxBytes) throw state.onByteLimit()
}

function jsonStringWireBytes(
  value: string,
  maxBytes: number,
  onByteLimit: () => SemanticWorkerProtocolError,
): number {
  return stringByteMetrics(
    value,
    Number.MAX_SAFE_INTEGER,
    maxBytes,
    onByteLimit,
    onByteLimit,
  ).wireBytes
}

function stringByteMetrics(
  value: string,
  maxRawBytes: number,
  maxWireBytes: number,
  onRawLimit: () => SemanticWorkerProtocolError,
  onWireLimit: () => SemanticWorkerProtocolError,
): { readonly rawBytes: number; readonly wireBytes: number } {
  let rawBytes = 0
  let wireBytes = 2
  if (wireBytes > maxWireBytes) throw onWireLimit()
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0x22 || code === 0x5c || code === 0x08 || code === 0x09
      || code === 0x0a || code === 0x0c || code === 0x0d) {
      rawBytes += 1
      wireBytes += 2
    } else if (code < 0x20) {
      rawBytes += 1
      wireBytes += 6
    } else if (code < 0x80) {
      rawBytes += 1
      wireBytes += 1
    } else if (code < 0x800) {
      rawBytes += 2
      wireBytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        rawBytes += 4
        wireBytes += 4
        index += 1
      } else {
        rawBytes += 3
        wireBytes += 6
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      rawBytes += 3
      wireBytes += 6
    } else {
      rawBytes += 3
      wireBytes += 3
    }
    if (rawBytes > maxRawBytes) throw onRawLimit()
    if (wireBytes > maxWireBytes) throw onWireLimit()
  }
  return Object.freeze({ rawBytes, wireBytes })
}

function cancellationView(cell: unknown): Int32Array {
  let byteLength: unknown
  let maxByteLength: unknown
  try {
    byteLength = sharedArrayBufferByteLengthGetter?.call(cell)
    maxByteLength = sharedArrayBufferMaxByteLengthGetter?.call(cell) ?? byteLength
  } catch {
    throw new SemanticWorkerProtocolError("Invalid semantic worker cancellation cell")
  }
  if (
    byteLength !== Int32Array.BYTES_PER_ELEMENT
    || maxByteLength !== Int32Array.BYTES_PER_ELEMENT
  ) {
    throw new SemanticWorkerProtocolError("Invalid semantic worker cancellation cell")
  }
  return new Int32Array(cell as SharedArrayBuffer, 0, 1)
}

function isCancellationState(value: number): value is SemanticWorkerCancellationState {
  return value === SemanticWorkerCancelState.active
    || value === SemanticWorkerCancelState.clientCancelled
    || value === SemanticWorkerCancelState.contentModified
    || value === SemanticWorkerCancelState.supervisorDisposing
}

function ownDataRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object") return undefined
  try {
    if (Array.isArray(value)) return undefined
  } catch {
    return undefined
  }
  let prototype: object | null
  try {
    prototype = Object.getPrototypeOf(value)
  } catch {
    return undefined
  }
  if (prototype !== Object.prototype && prototype !== null) return undefined
  let keys: readonly PropertyKey[]
  try {
    keys = Reflect.ownKeys(value)
  } catch {
    return undefined
  }
  const allowedKeys = [...requiredKeys, ...optionalKeys]
  const maxKeys = Math.min(allowedKeys.length, MAX_SEMANTIC_WORKER_VALUE_NODES)
  if (
    keys.length > maxKeys
    || requiredKeys.length > keys.length
    || keys.some(key => typeof key !== "string" || !allowedKeys.includes(key))
    || requiredKeys.some(key => !keys.includes(key))
  ) return undefined
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of keys as readonly string[]) {
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key)
    } catch {
      return undefined
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined
    copy[key] = descriptor.value
  }
  return copy
}

function readBoundedDenseArray(
  value: unknown,
  maxLength: number,
  onInvalid: () => SemanticWorkerProtocolError,
): readonly unknown[] {
  let prototype: object | null
  let lengthDescriptor: PropertyDescriptor | undefined
  try {
    if (!Array.isArray(value)) throw onInvalid()
    prototype = Object.getPrototypeOf(value)
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length")
  } catch {
    throw onInvalid()
  }
  if (
    prototype !== Array.prototype
    || !lengthDescriptor
    || !("value" in lengthDescriptor)
    || lengthDescriptor.enumerable
    || !isNonNegativeSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value > maxLength
  ) throw onInvalid()
  const length = lengthDescriptor.value
  let keys: readonly PropertyKey[]
  try {
    keys = Reflect.ownKeys(value as object)
  } catch {
    throw onInvalid()
  }
  if (
    keys.length !== length + 1
    || keys.some((key, index) => index < length
      ? key !== String(index)
      : key !== "length")
  ) throw onInvalid()
  const values: unknown[] = new Array(length)
  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    } catch {
      throw onInvalid()
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) throw onInvalid()
    values[index] = descriptor.value
  }
  return values
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

function isExpectedDocumentVersion(
  method: SemanticWorkerMethod,
  value: unknown,
): boolean {
  return isNonNegativeSafeInteger(value)
    || ((method === "outgoingCalls" || method === "incomingCalls") && value === null)
}

function isCallHierarchyItemKind(
  value: unknown,
): value is SemanticWorkerCallHierarchyItemKind {
  return typeof value === "string"
    && (SEMANTIC_WORKER_CALL_HIERARCHY_ITEM_KINDS as readonly string[]).includes(value)
}

function isCallHierarchyFailureReason(
  value: unknown,
): value is SemanticWorkerCallHierarchyFailureReason {
  return typeof value === "string"
    && (SEMANTIC_WORKER_CALL_HIERARCHY_FAILURE_REASONS as readonly string[]).includes(value)
}

function isSourceFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
}

export function isCanonicalSemanticWorkerFileUri(value: unknown): value is string {
  if (typeof value !== "string" || /%(?:2f|5c)/i.test(value)) return false
  try {
    stringByteMetrics(
      value,
      MAX_SEMANTIC_WORKER_URI_BYTES,
      MAX_SEMANTIC_WORKER_MESSAGE_BYTES,
      invalidUri,
      invalidUri,
    )
    const uri = new URL(value)
    const filePath = fileURLToPath(uri)
    return uri.protocol === "file:"
      && uri.host === ""
      && uri.username === ""
      && uri.password === ""
      && uri.search === ""
      && uri.hash === ""
      && uri.pathname.length > 0
      && !filePath.includes("\0")
      && uri.href === value
      && pathToFileURL(filePath).href === value
  } catch {
    return false
  }
}

function invalidUri(): SemanticWorkerProtocolError {
  return new SemanticWorkerProtocolError("Invalid semantic worker URI")
}

function isUriWithinRoot(uriValue: string, rootValue: string): boolean {
  const uri = new URL(uriValue)
  const root = new URL(rootValue)
  const rootPath = root.pathname.endsWith("/") ? root.pathname : `${root.pathname}/`
  return uri.host === root.host
    && (uri.pathname === root.pathname || uri.pathname.startsWith(rootPath))
}

type JsonWireField = readonly [name: string, valueBytes: number]

function assertMessageEnvelope(fields: readonly JsonWireField[]): void {
  jsonObjectWireBytes(fields, MAX_SEMANTIC_WORKER_MESSAGE_BYTES, messageTooLarge)
}

function jsonObjectWireBytes(
  fields: readonly JsonWireField[],
  maxBytes: number,
  onByteLimit: () => SemanticWorkerProtocolError,
): number {
  let bytes = 2 + Math.max(0, fields.length - 1)
  if (bytes > maxBytes) throw onByteLimit()
  for (const [name, valueBytes] of fields) {
    if (valueBytes < 0 || valueBytes > maxBytes - bytes - 1) throw onByteLimit()
    bytes += jsonStringWireBytes(name, maxBytes - bytes - 1 - valueBytes, onByteLimit)
      + 1
      + valueBytes
  }
  return bytes
}

function messageStringWireBytes(value: string): number {
  return jsonStringWireBytes(value, MAX_SEMANTIC_WORKER_MESSAGE_BYTES, messageTooLarge)
}

function numberWireBytes(value: number): number {
  return String(Object.is(value, -0) ? 0 : value).length
}

function nullableNumberWireBytes(value: unknown): number {
  return value === null ? 4 : numberWireBytes(value as number)
}

function booleanWireBytes(value: boolean): number {
  return value ? 4 : 5
}
