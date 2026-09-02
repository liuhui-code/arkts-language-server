import { pathToFileURL } from "node:url"

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

import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticCompletion, SemanticEnginePort } from "../contracts/semantic-engine.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { LegacySemanticEngine } from "../semantic/legacy-semantic-engine.js"
import { createStructuredLogger } from "../observability/logger.js"

export function runLanguageServer(): void {
  const logger = createStructuredLogger()
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)
  const projects = new SingleRootProjectResolver(pathToFileURL(process.cwd()).href)
  const semantic = new LegacySemanticEngine(projects)
  logger.info("server.started", { transport: "stdio" })

  connection.onInitialize((params: InitializeParams) => {
    projects.configure(initialRootUris(params))
    logger.info("lsp.initialized", {
      workspaceCount: initialRootUris(params).length,
      positionEncoding: "utf-16",
    })
    return {
      serverInfo: {
        name: "arkts-language-server",
        version: "0.0.1-spike",
      },
      capabilities: {
        positionEncoding: PositionEncodingKind.UTF16,
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Incremental,
        },
        completionProvider: { triggerCharacters: ["."] },
        definitionProvider: true,
      },
    }
  })

  documents.onDidOpen(({ document }) => semantic.sync(snapshot(document, projects)))
  documents.onDidChangeContent(({ document }) => semantic.sync(snapshot(document, projects)))
  documents.onDidClose(({ document }) => semantic.close(document.uri))

  connection.onCompletion(async (params) => {
    const startedAt = performance.now()
    const document = documents.get(params.textDocument.uri)
    let outcome = "document-unavailable"
    try {
      if (!document || !document.uri.startsWith("file:")) return []
      outcome = "error"
      const result = await semantic.complete({
        document: snapshot(document, projects),
        position: params.position,
      })
      outcome = "ok"
      return result.value.map(toLspCompletionItem)
    } finally {
      logger.info("request.completed", {
        method: "textDocument/completion",
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
      })
    }
  })

  connection.onDefinition(async (params) => {
    const document = documents.get(params.textDocument.uri)
    if (!document || !document.uri.startsWith("file:")) return []
    const result = await semantic.define({
      document: snapshot(document, projects),
      position: params.position,
    })
    return result.value
  })

  connection.onShutdown(() => {
    semantic.dispose()
    logger.info("server.stopped", { reason: "shutdown" })
  })

  documents.listen(connection)
  connection.listen()
}

function initialRootUris(params: InitializeParams): string[] {
  const workspaceRoots = params.workspaceFolders?.map((folder) => folder.uri) ?? []
  return workspaceRoots.length > 0
    ? workspaceRoots
    : params.rootUri
      ? [params.rootUri]
      : []
}

function snapshot(document: TextDocument, projects: ProjectResolverPort): DocumentSnapshot {
  return {
    uri: document.uri,
    version: document.version,
    text: document.getText(),
    workspaceId: projects.projectFor(document.uri).id,
  }
}

function toLspCompletionItem(item: SemanticCompletion) {
  return {
    label: item.label,
    detail: item.detail,
    kind: completionKind(item.kind),
    insertText: item.insertText,
    filterText: item.filterText,
    sortText: item.sortText,
  }
}

function completionKind(kind: SemanticCompletion["kind"]): CompletionItemKind {
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
