import type { SemanticWorkerWorkspaceFilesChangedMutation, SemanticWorkerWorkspaceFileChange } from "./worker-protocol.js"

/** Workspace invalidation wire validation shares envelope primitives, not mutable protocol state. */
export interface WorkspaceMutationCodec {
  SEMANTIC_WORKER_PROTOCOL_VERSION: 2
  MAX_SEMANTIC_WORKER_FILE_CHANGES: number
  MAX_SEMANTIC_WORKER_MESSAGE_BYTES: number
  hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean
  isPositiveSafeInteger(value: unknown): value is number
  isCanonicalSemanticWorkerFileUri(value: unknown): value is string
  isUriWithinRoot(uri: string, root: string): boolean
  invalidMutation(): Error
  messageTooLarge(): Error
  ownDataRecord(value: unknown, required: readonly string[]): Record<string, unknown> | undefined
  assertMessageEnvelope(fields: readonly (readonly [string, number])[]): void
  numberWireBytes(value: number): number
  booleanWireBytes(value: boolean): number
  messageStringWireBytes(value: string): number
  jsonObjectWireBytes(fields: readonly (readonly [string, number])[], remaining: number, fail: () => Error): number
}

export function decodeWorkspaceFilesChangedMutation(
  input: Record<string, unknown>, codec: WorkspaceMutationCodec,
): SemanticWorkerWorkspaceFilesChangedMutation {
  const { SEMANTIC_WORKER_PROTOCOL_VERSION, hasExactKeys, isPositiveSafeInteger,
    isCanonicalSemanticWorkerFileUri, invalidMutation, assertMessageEnvelope,
    numberWireBytes, booleanWireBytes, messageStringWireBytes } = codec
  if (
    !hasExactKeys(input, [
      "protocol",
      "epoch",
      "revision",
      "kind",
      "rootUri",
      "rootDirty",
      ...(Object.hasOwn(input, "configurationChanged") ? ["configurationChanged"] : []),
      "resourceDirty",
      "resourceChanged",
      "changes",
    ])
    || input.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION
    || !isPositiveSafeInteger(input.epoch)
    || !isPositiveSafeInteger(input.revision)
    || !isCanonicalSemanticWorkerFileUri(input.rootUri)
    || typeof input.rootDirty !== "boolean"
    || (Object.hasOwn(input, "configurationChanged") && typeof input.configurationChanged !== "boolean")
    || (input.configurationChanged === true && !input.rootDirty)
    || typeof input.resourceDirty !== "boolean"
    || typeof input.resourceChanged !== "boolean"
    || (input.resourceDirty === true && input.resourceChanged !== true)
  ) throw invalidMutation()
  const decodedChanges = decodeWorkspaceFileChanges(input.changes, input.rootUri, codec)
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
    ...(Object.hasOwn(input, "configurationChanged") ? { configurationChanged: input.configurationChanged as boolean } : {}),
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
    ...(mutation.configurationChanged !== undefined ? [["configurationChanged", booleanWireBytes(mutation.configurationChanged)] as [string, number]] : []),
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
  rootUri: string, codec: WorkspaceMutationCodec,
): DecodedWorkspaceFileChanges {
  const { MAX_SEMANTIC_WORKER_FILE_CHANGES, MAX_SEMANTIC_WORKER_MESSAGE_BYTES,
    invalidMutation, ownDataRecord, hasExactKeys, isCanonicalSemanticWorkerFileUri,
    isUriWithinRoot, jsonObjectWireBytes, messageStringWireBytes, messageTooLarge } = codec
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

