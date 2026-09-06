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
import type { StructuredLogger } from "../observability/logger.js"
import type { CallHierarchySourceAuthority } from "./call-hierarchy-source-authority.js"
import { RequestFreshness, type FreshRequest } from "./request-freshness.js"

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
  constructor(private readonly dependencies: SemanticRequestRunnerDependencies) {}

  async run<T>(request: SemanticRequest<T>): Promise<T> {
    const startedAt = performance.now()
    let outcome = "error"
    let freshRequest: FreshRequest | undefined
    try {
      this.dependencies.assertRunning()
      const document = this.dependencies.documents.get(request.documentUri)
      if (!document || !document.uri.startsWith("file:")) {
        outcome = "document-unavailable"
        return request.fallback
      }

      const requestedDocument = this.dependencies.snapshot(document)
      freshRequest = this.dependencies.freshness.start(
        `${request.method}:${document.uri}`,
        request.token,
        request.scope === "workspace"
          ? { kind: "workspace", workspaceId: requestedDocument.workspaceId }
          : { kind: "document", documentUri: document.uri },
      )
      const result = await request.execute(requestedDocument, freshRequest.signal)
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
      throw error
    } finally {
      freshRequest?.finish()
      this.dependencies.logger.info("request.completed", {
        method: request.method,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
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
      if (resolution.source.kind !== "open") {
        outcome = "source-unavailable"
        return request.incomplete("source-unavailable")
      }
      const result = await request.execute(resolution.source.document, freshRequest.signal)
      if (freshRequest.clientCancelled()) throw requestCancelled()
      if (!freshRequest.isCurrent() || result.documentVersion !== resolution.source.document.version) {
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
      throw error
    } finally {
      freshRequest?.finish()
      this.dependencies.logger.info("request.completed", {
        method: request.method,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
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
      throw error
    } finally {
      freshRequest?.finish()
      this.dependencies.logger.info("request.completed", {
        method: request.method,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
      })
    }
  }
}

export function requestCancelled(): ResponseError<void> {
  return new ResponseError(LSPErrorCodes.RequestCancelled, "Request cancelled by client")
}
