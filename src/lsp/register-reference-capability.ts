import {
  LSPErrorCodes,
  ResponseError,
  type Connection,
} from "vscode-languageserver/node.js"

import type {
  SemanticEnginePort,
  SemanticReferencesOutcome,
} from "../contracts/semantic-engine.js"
import { referenceRequestCoalesceKey, type SemanticRequestRunner } from "./semantic-request-runner.js"

export function registerReferenceCapability(
  connection: Connection,
  semantic: SemanticEnginePort,
  requests: SemanticRequestRunner,
  suspendDiagnostics: () => Promise<() => void>,
): void {
  connection.onReferences(async (params, token) => {
    const outcome = await requests.run<SemanticReferencesOutcome | { status: "stale" }>({
      method: "textDocument/references",
      documentUri: params.textDocument.uri,
      token,
      fallback: { status: "stale" },
      scope: "workspace",
      coalesceKey: referenceRequestCoalesceKey(params.position, params.context.includeDeclaration),
      execute: async (document, signal) => {
        const query = {
          document,
          position: params.position,
          includeDeclaration: params.context.includeDeclaration,
          signal,
        }
        const resumeDiagnostics = await requests.waitForReferenceDiagnostics(document, suspendDiagnostics)
        try {
          if (signal.aborted) throw new Error("References changed before semantic dispatch")
          // Cache certification now performs Worker input checks too. It belongs
          // to the same foreground/diagnostic boundary as an uncached search.
          const cached = await semantic.cachedReferences?.(query)
          return cached ?? await semantic.references(query)
        } finally {
          resumeDiagnostics()
        }
      },
    }).catch(error => {
      if (error instanceof Error && "code" in error
        && (error.code === "worker-unavailable" || error.code === "restart-required")) {
        throw new ResponseError(LSPErrorCodes.RequestFailed, "References are unavailable while semantic recovery is blocked",
          { reason: error.code })
      }
      if (error instanceof Error && "code" in error && error.code === "workspace-incomplete") {
        throw new ResponseError(LSPErrorCodes.RequestFailed, "References require a complete workspace snapshot")
      }
      throw error
    })
    if (outcome.status === "stale") {
      throw new ResponseError(LSPErrorCodes.ContentModified, "References request is stale")
    }
    if (outcome.status === "incomplete") {
      throw new ResponseError(
        LSPErrorCodes.RequestFailed,
        outcome.reason === "resource-budget-exceeded"
          ? "References exceed the current semantic memory budget"
          : "References require a complete workspace snapshot",
      )
    }
    return outcome.references
  })
}
