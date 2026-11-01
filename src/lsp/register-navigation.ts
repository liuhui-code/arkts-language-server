import type { CancellationToken, Connection, TextDocumentPositionParams } from "vscode-languageserver/node.js"
import type { SemanticDefinition, SemanticEnginePort } from "../contracts/semantic-engine.js"
import type { SemanticRequestRunner } from "./semantic-request-runner.js"

/** Equivalent reads share work; a cursor move never revokes another caller's request. */
export function registerNavigationCapabilities(connection: Connection, semantic: SemanticEnginePort,
  requests: SemanticRequestRunner): void {
  const run = (method: "define" | "typeDefinitions", params: TextDocumentPositionParams, token: CancellationToken) =>
    requests.run<SemanticDefinition[]>({
      method: method === "define" ? "textDocument/definition" : "textDocument/typeDefinition",
      documentUri: params.textDocument.uri,
      token,
      scope: "workspace",
      coalesceKey: JSON.stringify([params.position.line, params.position.character]),
      fallback: [],
      execute: (document, signal) => semantic[method]({ document, position: params.position, signal }),
    })
  connection.onDefinition((params, token) => run("define", params, token))
  connection.onTypeDefinition((params, token) => run("typeDefinitions", params, token))
}
