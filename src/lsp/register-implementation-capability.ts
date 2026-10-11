import { LSPErrorCodes, ResponseError, type Connection } from "vscode-languageserver/node.js"

import type { SemanticEnginePort } from "../contracts/semantic-engine.js"
import type { SemanticRequestRunner } from "./semantic-request-runner.js"

/** Incomplete scope is a protocol error, never a successful implementation subset. */
export function registerImplementationCapability(
  connection: Connection,
  semantic: SemanticEnginePort,
  requests: SemanticRequestRunner,
): void {
  connection.onImplementation(async (params, token) => {
    try {
      return await requests.run({
        method: "textDocument/implementation",
        documentUri: params.textDocument.uri,
        token,
        fallback: [],
        scope: "workspace",
        execute: (document, signal) => semantic.implementations({
          document,
          position: params.position,
          signal,
        }),
      })
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "workspace-incomplete") {
        throw new ResponseError(LSPErrorCodes.RequestFailed, "Implementations require a complete workspace snapshot")
      }
      throw error
    }
  })
}
