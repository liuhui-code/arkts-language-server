import {
  MAX_SEMANTIC_WORKER_FILE_CHANGES,
  MAX_SEMANTIC_WORKER_TEXT_BYTES,
  SEMANTIC_WORKER_PROTOCOL_VERSION,
  decodeSemanticWorkerMutation,
  isCanonicalSemanticWorkerFileUri,
} from "./worker-protocol.js"
import { hasExactInputKeys, ownPlainInputRecord } from "./semantic-worker-command-codec.js"
import type { RootSemanticWorkerMutationInput } from "./semantic-worker-command-input.js"
import { SemanticWorkerSupervisorError } from "./semantic-worker-supervisor-errors.js"
import { workerUriWithinRoot } from "./semantic-worker-uri.js"

export function mutationTextBytes(input: RootSemanticWorkerMutationInput): number {
  return input.kind === "open" || input.kind === "change"
    ? Buffer.byteLength(input.text)
    : 0
}

export function mutationExceedsTransportBounds(input: RootSemanticWorkerMutationInput): boolean {
  if (
    (input.kind === "open" || input.kind === "change")
    && typeof input.text === "string"
    && Buffer.byteLength(input.text) > MAX_SEMANTIC_WORKER_TEXT_BYTES
  ) return true
  return workspaceMutationExceedsFileChangeBound(input)
}

export function workspaceMutationExceedsFileChangeBound(
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

export function assertOverboundWorkspaceMutationStructure(
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
      || !isSemanticWorkerUriWithinRoot(change.uri, rootUri)
      || (change.kind !== "created"
        && change.kind !== "changed"
        && change.kind !== "deleted")
    ) throw new Error("Invalid semantic worker workspace change")
  }
}

export function assertMutationTargetsRoot(
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
    if (target.kind === "workspaceFilesChanged" || !isSemanticWorkerUriWithinRoot(target.uri, rootUri)) {
      throw new SemanticWorkerSupervisorError("invalid-request")
    }
  } catch (error) {
    if (error instanceof SemanticWorkerSupervisorError) throw error
    throw new SemanticWorkerSupervisorError("invalid-request", { cause: error })
  }
}

export function assertCanonicalRootUri(rootUri: string): void {
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

export function isSemanticWorkerUriWithinRoot(uriValue: string, rootValue: string): boolean {
  if (
    !isCanonicalSemanticWorkerFileUri(uriValue)
    || !isCanonicalSemanticWorkerFileUri(rootValue)
  ) return false
  return workerUriWithinRoot(uriValue, rootValue)
}
