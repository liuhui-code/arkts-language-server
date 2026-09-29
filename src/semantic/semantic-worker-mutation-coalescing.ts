import { canonicalMutationInput } from "./semantic-worker-command-codec.js"
import type { RootSemanticWorkerMutationInput } from "./semantic-worker-supervisor.js"

type DocumentMutation = Exclude<RootSemanticWorkerMutationInput, { kind: "workspaceFilesChanged" }>

/** Full-text updates may coalesce, but close always ends a document lifetime. */
export function findCoalescingMutation<Record extends {
  readonly input: RootSemanticWorkerMutationInput
  readonly documentKey: string | undefined
}>(pending: readonly Record[], input: RootSemanticWorkerMutationInput,
  documentKey: string | undefined): Record | undefined {
  const tail = pending.at(-1)
  if (input.kind === "workspaceFilesChanged") {
    return tail?.input.kind === "workspaceFilesChanged" ? tail : undefined
  }
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const record = pending[index]
    if (!record || record.input.kind === "workspaceFilesChanged") return undefined
    if (record.documentKey === documentKey) {
      if (record.input.kind === "close" || input.kind === "close") return undefined
      return record
    }
  }
  return undefined
}

export function mergeDocumentMutations(epoch: number,
  previous: DocumentMutation, next: DocumentMutation): RootSemanticWorkerMutationInput {
  if (previous.kind !== "open" || next.kind !== "change") return next
  return canonicalMutationInput(epoch, {
    kind: "open",
    uri: next.uri,
    documentVersion: next.documentVersion,
    text: next.text,
  })
}
