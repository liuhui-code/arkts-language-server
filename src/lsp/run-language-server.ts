import { pathToFileURL } from "node:url"

import {
  CompletionItemKind,
  createConnection,
  ErrorCodes,
  type InitializeParams,
  PositionEncodingKind,
  ProposedFeatures,
  ResponseError,
  SymbolKind,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js"
import { TextDocument } from "vscode-languageserver-textdocument"

import type { DocumentSnapshot } from "../contracts/document.js"
import type { SemanticCompletion, SemanticEnginePort } from "../contracts/semantic-engine.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type { WorkspaceSymbolServicePort } from "../contracts/workspace-symbol-service.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { LegacySemanticEngine } from "../semantic/legacy-semantic-engine.js"
import { createStructuredLogger } from "../observability/logger.js"
import { createDocumentDiagnostics } from "./document-diagnostics.js"
import { RequestFreshness } from "./request-freshness.js"
import { registerSemanticCapabilities } from "./register-semantic-capabilities.js"
import { requestCancelled, SemanticRequestRunner } from "./semantic-request-runner.js"

export interface LanguageServerServices {
  projects: ProjectResolverPort
  semantic: SemanticEnginePort
  workspaceSymbols?: WorkspaceSymbolServicePort
}

export function runLanguageServer(services?: LanguageServerServices): void {
  const logger = createStructuredLogger()
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)
  const projects = services?.projects
    ?? new SingleRootProjectResolver(pathToFileURL(process.cwd()).href)
  const semantic = services?.semantic ?? new LegacySemanticEngine(projects)
  const workspaceSymbols = services?.workspaceSymbols
  const freshness = new RequestFreshness()
  let shuttingDown = false
  let disposed = false

  const disposeOnce = (reason: "shutdown" | "exit") => {
    if (disposed) return
    disposed = true
    semantic.dispose()
    workspaceSymbols?.dispose()
    logger.info("server.stopped", { reason })
  }

  const assertRunning = () => {
    if (shuttingDown) {
      throw new ResponseError(ErrorCodes.InvalidRequest, "Language server is shutting down")
    }
  }
  const requests = new SemanticRequestRunner({
    documents,
    freshness,
    logger,
    assertRunning,
    snapshot: (document) => snapshot(document, projects),
  })
  const semanticCapabilities = registerSemanticCapabilities({
    connection,
    semantic,
    requests,
  })
  const diagnostics = createDocumentDiagnostics({
    connection,
    documents,
    semantic,
    snapshot: (document) => snapshot(document, projects),
  })
  logger.info("server.started", { transport: "stdio" })

  connection.onInitialize((params: InitializeParams) => {
    const rootUris = initialRootUris(params)
    projects.configure(rootUris)
    workspaceSymbols?.start(rootUris.map((rootUri) => ({ id: rootUri, rootUri })))
    semanticCapabilities.configure(params.capabilities)
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
        ...(workspaceSymbols ? { workspaceSymbolProvider: true } : {}),
        ...semanticCapabilities.capabilities,
      },
    }
  })

  documents.onDidOpen(({ document }) => {
    const opened = snapshot(document, projects)
    semantic.sync(opened)
    workspaceSymbols?.sync(opened)
    diagnostics.update(document)
  })
  documents.onDidChangeContent(({ document }) => {
    freshness.cancelDocument(document.uri)
    const changed = snapshot(document, projects)
    semantic.sync(changed)
    workspaceSymbols?.sync(changed)
    diagnostics.update(document)
  })
  documents.onDidClose(({ document }) => {
    freshness.cancelDocument(document.uri)
    semantic.close(document.uri)
    workspaceSymbols?.closeDocument(document.uri)
    diagnostics.close(document.uri)
  })

  connection.onCompletion(async (params, token) => {
    const result = await requests.run({
      method: "textDocument/completion",
      documentUri: params.textDocument.uri,
      token,
      fallback: [] as SemanticCompletion[],
      execute: (document, signal) => semantic.complete({
        document,
        position: params.position,
        signal,
      }),
    })
    return result.map(toLspCompletionItem)
  })

  connection.onDefinition(async (params, token) => {
    return requests.run({
      method: "textDocument/definition",
      documentUri: params.textDocument.uri,
      token,
      fallback: [],
      execute: (document, signal) => semantic.define({
        document,
        position: params.position,
        signal,
      }),
    })
  })

  connection.onWorkspaceSymbol(async (params, token) => {
    const startedAt = performance.now()
    let outcome = "error"
    const request = freshness.start("workspace/symbol", token)
    try {
      assertRunning()
      if (!workspaceSymbols) {
        outcome = "unavailable"
        return []
      }
      const result = await workspaceSymbols.searchSymbols(params.query, 100, request.signal)
      if (request.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (!request.isCurrent()) {
        outcome = "superseded"
        return []
      }
      outcome = "ok"
      return result.items.map((item) => ({
        name: item.name,
        kind: workspaceSymbolKind(item.kind),
        location: { uri: item.uri, range: item.range },
        containerName: item.containerName,
      }))
    } catch (error) {
      if (request.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (request.signal.aborted) {
        outcome = "superseded"
        return []
      }
      throw error
    } finally {
      request.finish()
      logger.info("request.completed", {
        method: "workspace/symbol",
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
      })
    }
  })

  connection.onShutdown(() => {
    shuttingDown = true
    freshness.cancelAll()
    diagnostics.dispose()
    disposeOnce("shutdown")
  })
  connection.onExit(() => {
    freshness.cancelAll()
    diagnostics.dispose()
    disposeOnce("exit")
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

function workspaceSymbolKind(kind: string): SymbolKind {
  switch (kind) {
    case "class": return SymbolKind.Class
    case "method": return SymbolKind.Method
    case "function": return SymbolKind.Function
    case "struct": return SymbolKind.Struct
    default: return SymbolKind.Variable
  }
}
