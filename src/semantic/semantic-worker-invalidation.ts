import type { DocumentSnapshot } from "../contracts/document.js"
import type { RootSemanticWorkerEndpoint, RootSemanticWorkerMutationInput } from "./semantic-worker-supervisor.js"
import { SemanticWorkerCancelState, type SemanticWorkerRequest } from "./worker-protocol.js"
import { cancelWithoutThrowing } from "./semantic-worker-supervisor-errors.js"

/** Disk notifications do not replace an open overlay's authoritative semantic bytes. */
export function canFinishOverlaySynchronization(input: RootSemanticWorkerMutationInput,
  documents: ReadonlyMap<string, DocumentSnapshot>): boolean {
  return input.kind === "workspaceFilesChanged" && !input.rootDirty && !input.resourceDirty && !input.resourceChanged
    && input.changes.length > 0 && input.changes.every(change => change.kind === "changed"
      && /\.(?:ets|ts)$/.test(change.uri) && documents.get(change.uri)?.workspaceId === input.rootUri)
}

/** Revoke publication immediately; allow only the admitted existing commit to drain. */
export function invalidateActiveWorkerRequests(records: readonly ({
  readonly wire?: SemanticWorkerRequest; readonly cancelCell: SharedArrayBuffer
} | undefined)[], endpoint: RootSemanticWorkerEndpoint, mutation: RootSemanticWorkerMutationInput): void {
  for (const record of records) {
    if (!record) continue
    if (record.wire) endpoint.invalidate?.(record.wire, mutation)
    cancelWithoutThrowing(record.cancelCell, SemanticWorkerCancelState.contentModified)
  }
}
