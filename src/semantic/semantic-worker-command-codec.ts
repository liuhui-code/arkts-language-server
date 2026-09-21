import {
  SEMANTIC_WORKER_PROTOCOL_VERSION,
  decodeSemanticWorkerMutation,
  decodeSemanticWorkerRequest,
  type SemanticWorkerMutation,
  type SemanticWorkerRequest,
} from "./worker-protocol.js"
import type {
  RootSemanticWorkerMutationInput,
  RootSemanticWorkerRequestInput,
} from "./semantic-worker-supervisor.js"

export function canonicalMutationInput(
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

export function canonicalRequestInput(
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

export function wireMutation(
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

export function wireRequest(
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

export function readPlainMutationInput(value: unknown): RootSemanticWorkerMutationInput {
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

export function readPlainRequestInput(value: unknown): RootSemanticWorkerRequestInput {
  const input = ownPlainInputRecord(value)
  if (!input || !hasExactInputKeys(input, [
    "method",
    "uri",
    "expectedDocumentVersion",
    "args",
  ])) throw new Error("Invalid semantic worker request input")
  return input as unknown as RootSemanticWorkerRequestInput
}

export function ownPlainInputRecord(value: unknown): Record<string, unknown> | undefined {
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

export function hasExactInputKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every(key => Object.hasOwn(value, key))
}
