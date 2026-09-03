import {
  MarkupKind,
  SymbolKind,
  type ClientCapabilities,
  type Connection,
  type DocumentSymbol,
  type ServerCapabilities,
  type SymbolInformation,
} from "vscode-languageserver/node.js"

/*
 * Keep the protocol conversion in this adapter; semantic contracts remain
 * editor-neutral and the extracted core has no vscode-languageserver import.
 */
import type {
  SemanticDocumentSymbol,
  SemanticEnginePort,
  SemanticHover,
  SemanticSignatureHelp,
} from "../contracts/semantic-engine.js"
import type { SemanticRequestRunner } from "./semantic-request-runner.js"

interface SemanticCapabilityDependencies {
  connection: Connection
  semantic: SemanticEnginePort
  requests: SemanticRequestRunner
}

interface SemanticCapabilityRegistration {
  capabilities: ServerCapabilities
  configure(clientCapabilities: ClientCapabilities): void
}

export function registerSemanticCapabilities({
  connection,
  semantic,
  requests,
}: SemanticCapabilityDependencies): SemanticCapabilityRegistration {
  let hierarchicalDocumentSymbols = false
  let documentStructKind: SymbolKind = SymbolKind.Class

  connection.onSignatureHelp(async (params, token) => {
    return requests.run({
      method: "textDocument/signatureHelp",
      documentUri: params.textDocument.uri,
      token,
      fallback: null as SemanticSignatureHelp | null,
      execute: (document, signal) => semantic.signatureHelp({
        document,
        position: params.position,
        signal,
      }),
    })
  })

  connection.onHover(async (params, token) => {
    const result = await requests.run({
      method: "textDocument/hover",
      documentUri: params.textDocument.uri,
      token,
      fallback: null as SemanticHover | null,
      execute: (document, signal) => semantic.hover({
        document,
        position: params.position,
        signal,
      }),
    })
    return result ? toLspHover(result) : null
  })

  connection.onDocumentSymbol(async (params, token) => {
    const result = await requests.run({
      method: "textDocument/documentSymbol",
      documentUri: params.textDocument.uri,
      token,
      fallback: [] as SemanticDocumentSymbol[],
      execute: (document, signal) => semantic.documentSymbols({ document, signal }),
    })
    return hierarchicalDocumentSymbols
      ? result.map((symbol) => toLspDocumentSymbol(symbol, documentStructKind))
      : result.flatMap((symbol) =>
        toLspSymbolInformation(symbol, params.textDocument.uri, documentStructKind))
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
      documentStructKind = clientCapabilities.textDocument?.documentSymbol
        ?.symbolKind?.valueSet?.includes(SymbolKind.Struct)
        ? SymbolKind.Struct
        : SymbolKind.Class
    },
  }
}

function toLspDocumentSymbol(
  symbol: SemanticDocumentSymbol,
  documentStructKind: SymbolKind,
): DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: symbolKind(symbol.kind, documentStructKind),
    range: symbol.range,
    selectionRange: symbol.selectionRange,
    children: symbol.children?.map((child) =>
      toLspDocumentSymbol(child, documentStructKind)),
  }
}

function toLspSymbolInformation(
  symbol: SemanticDocumentSymbol,
  uri: string,
  documentStructKind: SymbolKind,
  containerName?: string,
): SymbolInformation[] {
  const current: SymbolInformation = {
    name: symbol.name,
    kind: symbolKind(symbol.kind, documentStructKind),
    location: { uri, range: symbol.range },
    containerName,
  }
  return [
    current,
    ...(symbol.children ?? []).flatMap((child) =>
      toLspSymbolInformation(child, uri, documentStructKind, symbol.name)),
  ]
}

function symbolKind(
  kind: SemanticDocumentSymbol["kind"],
  documentStructKind: SymbolKind,
): SymbolKind {
  switch (kind) {
    case "struct": return documentStructKind
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
