import {
  LSPErrorCodes,
  ResponseError,
  type CancellationToken,
  type TextDocuments,
} from "vscode-languageserver/node.js"
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { VersionedSemanticResult } from "../contracts/semantic-engine.js"
import type { StructuredLogger } from "../observability/logger.js"
import { RequestFreshness, type FreshRequest } from "./request-freshness.js"

interface SemanticRequestRunnerDependencies {
  documents: TextDocuments<TextDocument>
  freshness: RequestFreshness
  logger: StructuredLogger
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
}

export function requestCancelled(): ResponseError<void> {
  return new ResponseError(LSPErrorCodes.RequestCancelled, "Request cancelled by client")
}
