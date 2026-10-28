import {
  LSPErrorCodes,
  ResponseError,
  type CancellationToken,
  type TextDocuments,
} from "vscode-languageserver/node.js"
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type {
  SemanticCallHierarchyFailureReason,
  SemanticCallHierarchyItem,
  SemanticCallHierarchySource,
  VersionedSemanticResult,
} from "../contracts/semantic-engine.js"
import { processMemoryFields, type StructuredLogger } from "../observability/logger.js"
import type { CallHierarchySourceAuthority } from "./call-hierarchy-source-authority.js"
import { InFlightRequestCoalescer } from "./in-flight-request-coalescer.js"
import { RequestFreshness, type FreshRequest } from "./request-freshness.js"
import { runDiskSourceRequest } from "./disk-source-request.js"

interface SemanticRequestRunnerDependencies {
  documents: TextDocuments<TextDocument>
  freshness: RequestFreshness
  logger: StructuredLogger
  callHierarchySources: CallHierarchySourceAuthority
  assertRunning(): void
  snapshot(document: TextDocument): DocumentSnapshot
}

interface SemanticRequest<T> {
  method: string
  documentUri: string
  token?: CancellationToken
  fallback: T
  scope?: "document" | "workspace"
  coalesceKey?: string
  execute(document: DocumentSnapshot, signal: AbortSignal): Promise<VersionedSemanticResult<T>>
}

interface CallHierarchyRequest<T> {
  method: string
  documentUri: string
  rootUri: string
  token?: CancellationToken
  fallback: T
  incomplete(reason: SemanticCallHierarchyFailureReason): T
  preflight?(result: T): void
  resultItems?(result: T): readonly SemanticCallHierarchyItem[]
  execute(source: SemanticCallHierarchySource, signal: AbortSignal): Promise<T>
}

interface CallHierarchyPrepareRequest<T> {
  method: string
  documentUri: string
  rootUri: string
  token?: CancellationToken
  fallback: T
  incomplete(reason: SemanticCallHierarchyFailureReason): T
  preflight?(result: T): void
  resultItems?(result: T): readonly SemanticCallHierarchyItem[]
  execute(document: DocumentSnapshot, signal: AbortSignal): Promise<VersionedSemanticResult<T>>
}

export class SemanticRequestRunner {
  readonly #coalescer = new InFlightRequestCoalescer()
  #nextDiagnosticWaitId = 1

  constructor(private readonly dependencies: SemanticRequestRunnerDependencies) {}

  /** Observes the original cache-miss wait inside the complete response interval. */
  waitForReferenceDiagnostics(document: DocumentSnapshot, suspend: () => Promise<() => void>): Promise<() => void> {
    if (process.env.ARKTS_SEMANTIC_QUEUE_TRACE !== "1") return suspend()
    const diagnosticWaitId = this.#nextDiagnosticWaitId++
    const startedAt = performance.now()
    const record = (event: string, fields: Readonly<Record<string, string | number>>) => {
      try {
        this.dependencies.logger.info(event, { diagnosticWaitId, uri: document.uri,
          workspaceId: document.workspaceId, documentVersion: document.version, ...fields })
      } catch { /* Missing observation must not change diagnostic ownership or request results. */ }
    }
    record("references.diagnostics.wait.started", { monotonicMs: startedAt })
    return (async () => {
      let outcome = "error"
      try {
        const resume = await suspend()
        outcome = "settled"
        return resume
      } finally {
        const monotonicMs = performance.now()
        record("references.diagnostics.wait.settled", { outcome, monotonicMs,
          diagnosticQuiescenceWaitMs: monotonicMs - startedAt })
      }
    })()
  }

  async run<T>(request: SemanticRequest<T>): Promise<T> {
    const startedAt = performance.now()
    let outcome = "error"
    let freshRequest: FreshRequest | undefined
    try {
      this.dependencies.assertRunning()
      const document = this.dependencies.documents.get(request.documentUri)
      if (!document || !document.uri.startsWith("file:")) {
        outcome = "disk-source"
        return await runDiskSourceRequest(request, this.dependencies.callHierarchySources, this.dependencies.freshness,
          this.#coalescer, () => this.dependencies.logger.info("references.coalesced", { method: request.method, sourceKind: "disk" }))
      }

      const requestedDocument = this.dependencies.snapshot(document)
      const lane = `${request.method}:${document.uri}`
      const operationKey = request.coalesceKey === undefined ? undefined : [
        lane,
        requestedDocument.workspaceId,
        requestedDocument.version,
        request.coalesceKey,
      ].join("\u0000")
      const joining = operationKey !== undefined && this.#coalescer.has(operationKey)
      freshRequest = joining
        ? this.dependencies.freshness.startConcurrent(
            lane,
            request.token,
            request.scope === "workspace"
              ? { kind: "workspace", workspaceId: requestedDocument.workspaceId }
              : { kind: "document", documentUri: document.uri },
          )
        : this.dependencies.freshness.start(
            lane,
            request.token,
            request.scope === "workspace"
              ? { kind: "workspace", workspaceId: requestedDocument.workspaceId }
              : { kind: "document", documentUri: document.uri },
          )
      if (joining) this.dependencies.logger.info("references.coalesced", {
        method: request.method,
        documentVersion: requestedDocument.version,
      })
      const result = operationKey === undefined
        ? await request.execute(requestedDocument, freshRequest.signal)
        : await this.#coalescer.run(
            operationKey,
            freshRequest.signal,
            signal => request.execute(requestedDocument, signal),
          )
      if (freshRequest.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }

      const currentDocument = this.dependencies.documents.get(document.uri)
      if (
        !freshRequest.isCurrent()
        || currentDocument?.version !== requestedDocument.version
        || result.documentVersion !== requestedDocument.version
      ) {
        outcome = "stale"
        return request.fallback
      }
      outcome = "ok"
      return result.value
    } catch (error) {
      if (freshRequest?.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (freshRequest?.signal.aborted) {
        outcome = "superseded"
        return request.fallback
      }
      if (error instanceof Error && "code" in error && error.code === "content-modified") {
        outcome = "stale"
        return request.fallback
      }
      // These adapters retain their existing capability-specific wording.
      if (request.method !== "textDocument/implementation" && request.method !== "textDocument/references" && error instanceof Error
        && "code" in error && error.code === "workspace-incomplete") {
        throw new ResponseError(LSPErrorCodes.RequestFailed, "Semantic query requires current workspace inputs")
      }
      throw error
    } finally {
      freshRequest?.finish()
      this.dependencies.logger.info("request.completed", {
        method: request.method,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
        ...processMemoryFields(),
      })
    }
  }

  callHierarchyRootUri(documentUri: string): string | undefined {
    return this.dependencies.callHierarchySources.rootUriFor(documentUri)
  }

  async runCallHierarchyPrepare<T>(request: CallHierarchyPrepareRequest<T>): Promise<T> {
    const startedAt = performance.now()
    let outcome = "error"
    let freshRequest: FreshRequest | undefined
    try {
      this.dependencies.assertRunning()
      const workspace = this.dependencies.callHierarchySources.workspace(request.rootUri)
      if (!workspace) {
        outcome = "source-outside-workspace"
        return request.incomplete("source-outside-workspace")
      }
      freshRequest = this.dependencies.freshness.start(
        `${request.method}:${request.documentUri}`,
        request.token,
        { kind: "workspace", workspaceId: workspace.id },
      )
      const resolution = await this.dependencies.callHierarchySources.resolve(
        request.documentUri,
        request.rootUri,
      )
      if (freshRequest.clientCancelled()) throw requestCancelled()
      if (!freshRequest.isCurrent()) {
        outcome = "stale"
        return request.fallback
      }
      if (resolution.status === "incomplete") {
        outcome = resolution.reason
        return request.incomplete(resolution.reason)
      }
      const document: DocumentSnapshot = resolution.source.kind === "open" ? resolution.source.document
        : Object.freeze({ uri: resolution.source.uri, version: 0, text: resolution.source.text,
          workspaceId: resolution.source.workspaceId,
          source: Object.freeze({ kind: "disk" as const, rootUri: request.rootUri }) })
      const result = await request.execute(document, freshRequest.signal)
      if (freshRequest.clientCancelled()) throw requestCancelled()
      if (!freshRequest.isCurrent() || result.documentVersion !== document.version) {
        outcome = "stale"
        return request.fallback
      }
      request.preflight?.(result.value)
      const resultFailure = request.resultItems
        ? await this.dependencies.callHierarchySources.validateResultItems(
            request.resultItems(result.value),
            request.rootUri,
          )
        : undefined
      if (freshRequest.clientCancelled()) throw requestCancelled()
      if (!freshRequest.isCurrent()) {
        outcome = "stale"
        return request.fallback
      }
      if (resultFailure) {
        outcome = resultFailure
        return request.incomplete(resultFailure)
      }
      if (!await this.dependencies.callHierarchySources.isCurrent(resolution)) {
        outcome = "stale"
        return request.fallback
      }
      outcome = "ok"
      return result.value
    } catch (error) {
      if (freshRequest?.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (freshRequest?.signal.aborted) {
        outcome = "superseded"
        return request.fallback
      }
      if (error instanceof Error && "code" in error && error.code === "workspace-incomplete") {
        throw new ResponseError(LSPErrorCodes.RequestFailed, "Semantic query requires current workspace inputs")
      }
      throw error
    } finally {
      freshRequest?.finish()
      this.dependencies.logger.info("request.completed", {
        method: request.method,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
        ...processMemoryFields(),
      })
    }
  }

  async runCallHierarchy<T>(request: CallHierarchyRequest<T>): Promise<T> {
    const startedAt = performance.now()
    let outcome = "error"
    let freshRequest: FreshRequest | undefined
    try {
      this.dependencies.assertRunning()
      const workspace = this.dependencies.callHierarchySources.workspace(request.rootUri)
      if (!workspace) {
        outcome = "source-outside-workspace"
        return request.incomplete("source-outside-workspace")
      }
      freshRequest = this.dependencies.freshness.start(
        `${request.method}:${request.documentUri}`,
        request.token,
        { kind: "workspace", workspaceId: workspace.id },
      )
      const resolution = await this.dependencies.callHierarchySources.resolve(
        request.documentUri,
        request.rootUri,
      )
      if (freshRequest.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (!freshRequest.isCurrent()) {
        outcome = "stale"
        return request.fallback
      }
      if (resolution.status === "incomplete") {
        outcome = resolution.reason
        return request.incomplete(resolution.reason)
      }
      const result = await request.execute(resolution.source, freshRequest.signal)
      if (freshRequest.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (!freshRequest.isCurrent()) {
        outcome = "stale"
        return request.fallback
      }
      request.preflight?.(result)
      const resultFailure = request.resultItems
        ? await this.dependencies.callHierarchySources.validateResultItems(
            request.resultItems(result),
            request.rootUri,
          )
        : undefined
      if (freshRequest.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (!freshRequest.isCurrent()) {
        outcome = "stale"
        return request.fallback
      }
      if (resultFailure) {
        outcome = resultFailure
        return request.incomplete(resultFailure)
      }
      const sourceCurrent = await this.dependencies.callHierarchySources.isCurrent(resolution)
      if (freshRequest.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (!freshRequest.isCurrent() || !sourceCurrent) {
        outcome = "stale"
        return request.fallback
      }
      outcome = "ok"
      return result
    } catch (error) {
      if (freshRequest?.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (freshRequest?.signal.aborted) {
        outcome = "superseded"
        return request.fallback
      }
      if (error instanceof Error && "code" in error && error.code === "workspace-incomplete") {
        throw new ResponseError(LSPErrorCodes.RequestFailed, "Semantic query requires current workspace inputs")
      }
      throw error
    } finally {
      freshRequest?.finish()
      this.dependencies.logger.info("request.completed", {
        method: request.method,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
        ...processMemoryFields(),
      })
    }
  }
}

export function requestCancelled(): ResponseError<void> {
  return new ResponseError(LSPErrorCodes.RequestCancelled, "Request cancelled by client")
}

export function referenceRequestCoalesceKey(
  position: { readonly line: number; readonly character: number },
  includeDeclaration: boolean,
): string {
  return `${position.line}:${position.character}:${includeDeclaration}`
}
