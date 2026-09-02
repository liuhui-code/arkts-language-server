import {
  CompletionItemKind,
  createConnection,
  type InitializeParams,
  PositionEncodingKind,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js"
import { TextDocument } from "vscode-languageserver-textdocument"
import { fileURLToPath, pathToFileURL } from "node:url"

import type { SemanticCompletionItem, SemanticDocumentPosition } from "./core/protocol.js"
import { TypeScriptLanguageServiceEngine } from "./core/types/typescript-language-service.js"
import { SemanticDocumentStore } from "./core/workspace/document-store.js"

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)
const documentStore = new SemanticDocumentStore()
let workspaceRoot = process.cwd()
let typeEngine = new TypeScriptLanguageServiceEngine(workspaceRoot)

connection.onInitialize((params: InitializeParams) => {
  const initializedRoot = params.workspaceFolders?.[0]?.uri ?? params.rootUri
  if (initializedRoot?.startsWith("file:")) {
    workspaceRoot = fileURLToPath(initializedRoot)
    typeEngine.dispose()
    typeEngine = new TypeScriptLanguageServiceEngine(workspaceRoot)
  }
  return {
    serverInfo: {
      name: "arkts-language-server",
      version: "0.0.1-spike",
    },
    capabilities: {
      positionEncoding: PositionEncodingKind.UTF16,
      textDocumentSync: TextDocumentSyncKind.Full,
      completionProvider: { triggerCharacters: ["."] },
      definitionProvider: true,
    },
  }
})

documents.onDidOpen(({ document }) => syncDocument(document))
documents.onDidChangeContent(({ document }) => syncDocument(document))

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document || !params.textDocument.uri.startsWith("file:")) return []
  const position: SemanticDocumentPosition = {
    path: fileURLToPath(params.textDocument.uri),
    line: params.position.line + 1,
    column: params.position.character + 1,
    documentVersion: document.version,
    workspaceRoot,
  }
  typeEngine.prepare(documentStore.prepare(position))
  return typeEngine.complete(position).map(toLspCompletionItem)
})

connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document || !params.textDocument.uri.startsWith("file:")) return []
  const position: SemanticDocumentPosition = {
    path: fileURLToPath(params.textDocument.uri),
    line: params.position.line + 1,
    column: params.position.character + 1,
    documentVersion: document.version,
    workspaceRoot,
  }
  typeEngine.prepare(documentStore.prepare(position))
  return typeEngine.define(position).map((target) => {
    const start = { line: target.line - 1, character: target.column - 1 }
    return {
      uri: pathToFileURL(target.path).href,
      range: { start, end: start },
    }
  })
})

function syncDocument(document: TextDocument): void {
  if (!document.uri.startsWith("file:")) return
  documentStore.sync({
    path: fileURLToPath(document.uri),
    content: document.getText(),
    documentVersion: document.version,
    workspaceRoot,
  })
}

function toLspCompletionItem(item: SemanticCompletionItem) {
  return {
    label: item.label,
    detail: item.detail,
    kind: completionKind(item.kind),
    insertText: item.insertText,
    filterText: item.filterText,
    sortText: item.sortText,
  }
}

function completionKind(kind: string): CompletionItemKind {
  switch (kind) {
    case "method": return CompletionItemKind.Method
    case "function": return CompletionItemKind.Function
    case "class": return CompletionItemKind.Class
    case "interface": return CompletionItemKind.Interface
    case "keyword": return CompletionItemKind.Keyword
    case "variable": return CompletionItemKind.Variable
    default: return CompletionItemKind.Property
  }
}

documents.listen(connection)
connection.listen()
