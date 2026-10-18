import type * as Contract from "../contracts/semantic-engine.js"
import { workerAbortState } from "./semantic-worker-recycle.js"
import { SemanticWorkerCancelState, SemanticWorkerSupervisorError } from "./semantic-worker-supervisor.js"
import type { SemanticWorkerMethod, SemanticWorkerRequestArgsByMethod } from "./worker-protocol.js"
import type { WorkerProjectPreparation } from "./worker-project-preparation.js"

/** Route typed document calls through the same initialization join and source authority. */
export async function workerDocumentRequest<Value, Method extends SemanticWorkerMethod>(method: Method,
  query: Contract.SemanticDocumentQuery, args: SemanticWorkerRequestArgsByMethod[Method],
  ports: { readonly sync: (document: Contract.SemanticDocumentQuery["document"]) => void
    readonly preparation: WorkerProjectPreparation }): Promise<Contract.VersionedSemanticResult<Value>> {
  if (query.signal?.aborted) throw new SemanticWorkerSupervisorError(
    workerAbortState(query.signal) === SemanticWorkerCancelState.contentModified ? "content-modified" : "client-cancelled")
  if (!query.document.source) ports.sync(query.document)
  const value = await ports.preparation.request(method, query.document.source?.rootUri ?? query.document.workspaceId,
    query.document.uri, query.document.version, args, query.signal,
    query.document.source ? { text: query.document.text } : undefined)
  return { documentVersion: query.document.version, value: value as unknown as Value }
}
