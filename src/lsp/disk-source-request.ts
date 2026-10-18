import { LSPErrorCodes, ResponseError, type CancellationToken } from "vscode-languageserver/node.js"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { VersionedSemanticResult } from "../contracts/semantic-engine.js"
import type { CallHierarchySourceAuthority } from "./call-hierarchy-source-authority.js"
import type { FreshRequest, RequestFreshness } from "./request-freshness.js"
import type { InFlightRequestCoalescer } from "./in-flight-request-coalescer.js"

interface DiskSourceRequest<T> {
  method: string
  documentUri: string
  token?: CancellationToken
  fallback: T
  coalesceKey?: string
  execute(document: DocumentSnapshot, signal: AbortSignal): Promise<VersionedSemanticResult<T>>
}

/** Resolve real disk ownership inside the request interval, without opening a document. */
export async function runDiskSourceRequest<T>(request: DiskSourceRequest<T>,
  sources: CallHierarchySourceAuthority, freshness: RequestFreshness,
  coalescer: InFlightRequestCoalescer, onJoin: () => void): Promise<T> {
  // Each further capability is admitted only after its own public transcript.
  if (request.method !== "textDocument/definition" && request.method !== "textDocument/typeDefinition"
    && request.method !== "textDocument/hover" && request.method !== "textDocument/signatureHelp"
    && request.method !== "textDocument/completion" && request.method !== "completionItem/resolve"
    && request.method !== "textDocument/implementation" && request.method !== "textDocument/references"
    && request.method !== "textDocument/prepareRename" && request.method !== "textDocument/rename") return request.fallback
  const rootUri = sources.rootUriFor(request.documentUri)
  const workspace = rootUri ? sources.workspace(rootUri) : undefined
  if (!rootUri || !workspace) return request.fallback
  const lane = `${request.method}:${request.documentUri}`
  const key = request.coalesceKey === undefined ? undefined
    : [lane, workspace.id, "disk", request.coalesceKey].join("\u0000")
  const joining = key !== undefined && coalescer.has(key)
  const scope = { kind: "workspace" as const, workspaceId: workspace.id }
  const fresh = joining ? freshness.startConcurrent(lane, request.token, scope) : freshness.start(lane, request.token, scope)
  const execute = (current: FreshRequest, signal: AbortSignal) => diskSourceValue(request, sources, rootUri, current, signal)
  try {
    if (joining) onJoin()
    const value = key === undefined ? await execute(fresh, fresh.signal)
      : await coalescer.run(key, fresh.signal, async signal => {
        // The operation is not owned by the first subscriber's client token.
        const shared = freshness.startConcurrent(`${lane}:disk-operation`, undefined, scope)
        try { return await execute(shared, signal) } finally { shared.finish() }
      })
    assertClientActive(fresh)
    return fresh.isCurrent() ? value : request.fallback
  } catch (error) {
    assertClientActive(fresh)
    if (fresh.signal.aborted) return request.fallback
    throw error
  } finally {
    fresh.finish()
  }
}

async function diskSourceValue<T>(request: DiskSourceRequest<T>, sources: CallHierarchySourceAuthority,
  rootUri: string, fresh: FreshRequest, signal: AbortSignal): Promise<T> {
  try {
    if (!fresh.isCurrent() || signal.aborted) return request.fallback
    const resolved = await sources.resolve(request.documentUri, rootUri)
    assertClientActive(fresh)
    if (!fresh.isCurrent() || signal.aborted || resolved.status !== "complete" || resolved.source.kind !== "disk") return request.fallback
    const document: DocumentSnapshot = Object.freeze({ uri: resolved.source.uri, version: 0,
      text: resolved.source.text, workspaceId: resolved.source.workspaceId,
      source: Object.freeze({ kind: "disk" as const, rootUri }) })
    const result = await request.execute(document, signal)
    assertClientActive(fresh)
    if (!fresh.isCurrent() || signal.aborted || result.documentVersion !== 0) return request.fallback
    const current = await sources.isCurrent(resolved)
    assertClientActive(fresh)
    return fresh.isCurrent() && !signal.aborted && current ? result.value : request.fallback
  } catch (error) {
    assertClientActive(fresh)
    if (fresh.signal.aborted || signal.aborted || (error instanceof Error && "code" in error && error.code === "content-modified")) {
      return request.fallback
    }
    throw error
  }
}

function assertClientActive(fresh: FreshRequest): void {
  if (fresh.clientCancelled()) throw new ResponseError(LSPErrorCodes.RequestCancelled, "Request cancelled by client")
}
