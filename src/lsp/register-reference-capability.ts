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
        const cached = semantic.cachedReferences?.(query)
        if (cached) return cached
        const resumeDiagnostics = await suspendDiagnostics()
        try {
          if (signal.aborted) throw new Error("References changed before semantic dispatch")
          return await semantic.references(query)
        } finally {
          resumeDiagnostics()
        }
      },
    })
    if (outcome.status === "stale") {
      throw new ResponseError(LSPErrorCodes.ContentModified, "References request is stale")
    }
    if (outcome.status === "incomplete") {
      throw new ResponseError(
        LSPErrorCodes.RequestFailed,
        "References require a complete workspace snapshot",
      )
    }
    return outcome.references
  })
}
