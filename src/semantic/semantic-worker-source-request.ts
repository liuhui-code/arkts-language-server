import { createHash } from "node:crypto"

import type { DocumentSnapshot } from "../contracts/document.js"
import type * as Contract from "../contracts/semantic-engine.js"
import type { SemanticWorkerDiskSource } from "./semantic-worker-disk-source.js"
import type { SemanticWorkerJsonValue, SemanticWorkerMethod, SemanticWorkerRequestArgsByMethod } from "./worker-protocol.js"

export interface WorkerSourceTransport {
  sync(document: DocumentSnapshot): void
  request<Method extends SemanticWorkerMethod>(method: Method, rootUri: string, uri: string,
    version: number | null, args: SemanticWorkerRequestArgsByMethod[Method], signal?: AbortSignal,
    diskSource?: SemanticWorkerDiskSource): Promise<SemanticWorkerJsonValue>
}

/** Disk follow-ups carry request-owned source bytes, never synthetic open/close mutations. */
export async function workerCallHierarchyRequest<Value>(method: "outgoingCalls" | "incomingCalls",
  query: Contract.SemanticCallHierarchyItemQuery, transport: WorkerSourceTransport): Promise<Value> {
  const rootUri = query.source.workspaceRootUri
  const document = query.source.kind === "open" ? query.source.document : {
    uri: query.source.uri, version: 0, text: query.source.text, workspaceId: query.source.workspaceId,
  }
  if (query.source.kind === "open") transport.sync(document)
  const { sourceFingerprint: itemFingerprint, ...item } = query.item
  const sourceFingerprint = itemFingerprint ?? createHash("sha256").update(document.text).digest("hex")
  const value = await transport.request(method, rootUri, document.uri, null, { item, sourceFingerprint }, query.signal,
    query.source.kind === "disk" ? { text: document.text } : undefined)
  return value as unknown as Value
}
