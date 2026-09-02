import {
  MarkupKind,
  type Connection,
  type ServerCapabilities,
  type TextDocuments,
} from "vscode-languageserver/node.js"

/*
 * Keep the protocol conversion in this adapter; semantic contracts remain
 * editor-neutral and the extracted core has no vscode-languageserver import.
 */
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticEnginePort, SemanticHover } from "../contracts/semantic-engine.js"

interface SemanticCapabilityDependencies {
  connection: Connection
  documents: TextDocuments<TextDocument>
  semantic: SemanticEnginePort
  snapshot(document: TextDocument): DocumentSnapshot
}

export function registerSemanticCapabilities({
  connection,
  documents,
  semantic,
  snapshot,
}: SemanticCapabilityDependencies): ServerCapabilities {
  connection.onSignatureHelp(async (params) => {
    const document = documents.get(params.textDocument.uri)
    if (!document || !document.uri.startsWith("file:")) return null
    const result = await semantic.signatureHelp({
      document: snapshot(document),
      position: params.position,
    })
    return result.value
  })

  connection.onHover(async (params) => {
    const document = documents.get(params.textDocument.uri)
    if (!document || !document.uri.startsWith("file:")) return null
    const result = await semantic.hover({
      document: snapshot(document),
      position: params.position,
    })
    return result.value ? toLspHover(result.value) : null
  })

  return {
    hoverProvider: true,
    signatureHelpProvider: {
      triggerCharacters: ["(", ","],
    },
  }
}

function toLspHover(hover: SemanticHover) {
  const sections = [`\`\`\`arkts\n${hover.signature}\n\`\`\``]
  if (hover.documentation) sections.push(hover.documentation)
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: sections.join("\n\n"),
    },
    range: hover.range,
  }
}
