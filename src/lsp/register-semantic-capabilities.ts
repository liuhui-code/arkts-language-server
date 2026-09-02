import {
  MarkupKind,
  SymbolKind,
  type ClientCapabilities,
  type Connection,
  type DocumentSymbol,
  type ServerCapabilities,
  type SymbolInformation,
  type TextDocuments,
} from "vscode-languageserver/node.js"

/*
 * Keep the protocol conversion in this adapter; semantic contracts remain
 * editor-neutral and the extracted core has no vscode-languageserver import.
 */
import type { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type {
  SemanticDocumentSymbol,
  SemanticEnginePort,
  SemanticHover,
} from "../contracts/semantic-engine.js"

interface SemanticCapabilityDependencies {
  connection: Connection
  documents: TextDocuments<TextDocument>
  semantic: SemanticEnginePort
  snapshot(document: TextDocument): DocumentSnapshot
}

interface SemanticCapabilityRegistration {
  capabilities: ServerCapabilities
  configure(clientCapabilities: ClientCapabilities): void
}

export function registerSemanticCapabilities({
  connection,
  documents,
  semantic,
  snapshot,
}: SemanticCapabilityDependencies): SemanticCapabilityRegistration {
  let hierarchicalDocumentSymbols = false

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

  connection.onDocumentSymbol(async (params) => {
    const document = documents.get(params.textDocument.uri)
    if (!document || !document.uri.startsWith("file:")) return []
    const result = await semantic.documentSymbols({ document: snapshot(document) })
    return hierarchicalDocumentSymbols
      ? result.value.map(toLspDocumentSymbol)
      : result.value.flatMap((symbol) => toLspSymbolInformation(symbol, document.uri))
  })

  return {
    capabilities: {
      documentSymbolProvider: true,
      hoverProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
      },
    },
    configure(clientCapabilities) {
      hierarchicalDocumentSymbols = clientCapabilities.textDocument
        ?.documentSymbol?.hierarchicalDocumentSymbolSupport === true
    },
  }
}

function toLspDocumentSymbol(symbol: SemanticDocumentSymbol): DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbolKind(symbol.kind),
    range: symbol.range,
    selectionRange: symbol.selectionRange,
    children: symbol.children?.map(toLspDocumentSymbol),
  }
}

function toLspSymbolInformation(
  symbol: SemanticDocumentSymbol,
  uri: string,
  containerName?: string,
): SymbolInformation[] {
  const current: SymbolInformation = {
    name: symbol.name,
    kind: symbolKind(symbol.kind),
    location: { uri, range: symbol.range },
    containerName,
  }
  return [
    current,
    ...(symbol.children ?? []).flatMap((child) =>
      toLspSymbolInformation(child, uri, symbol.name)),
  ]
}

function symbolKind(kind: SemanticDocumentSymbol["kind"]): SymbolKind {
  switch (kind) {
    case "struct": return SymbolKind.Struct
    case "class": return SymbolKind.Class
    case "interface": return SymbolKind.Interface
    case "enum": return SymbolKind.Enum
    case "enumMember": return SymbolKind.EnumMember
    case "function": return SymbolKind.Function
    case "method": return SymbolKind.Method
    case "property": return SymbolKind.Property
    case "constructor": return SymbolKind.Constructor
    case "module": return SymbolKind.Module
    case "type": return SymbolKind.TypeParameter
    case "variable": return SymbolKind.Variable
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
