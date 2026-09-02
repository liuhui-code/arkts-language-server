import { pathToFileURL } from "node:url"

import {
  CompletionItemKind,
  createConnection,
  ErrorCodes,
  type InitializeParams,
  LSPErrorCodes,
  PositionEncodingKind,
  ProposedFeatures,
  ResponseError,
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
import { createDocumentDiagnostics } from "./document-diagnostics.js"
import { RequestFreshness } from "./request-freshness.js"
import { registerSemanticCapabilities } from "./register-semantic-capabilities.js"

export interface LanguageServerServices {
  projects: ProjectResolverPort
  semantic: SemanticEnginePort
}

export function runLanguageServer(services?: LanguageServerServices): void {
  const logger = createStructuredLogger()
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)
  const projects = services?.projects
    ?? new SingleRootProjectResolver(pathToFileURL(process.cwd()).href)
  const semantic = services?.semantic ?? new LegacySemanticEngine(projects)
  const freshness = new RequestFreshness()
  let shuttingDown = false
  let disposed = false

  const disposeOnce = (reason: "shutdown" | "exit") => {
    if (disposed) return
    disposed = true
    semantic.dispose()
    logger.info("server.stopped", { reason })
  }

  const assertRunning = () => {
    if (shuttingDown) {
      throw new ResponseError(ErrorCodes.InvalidRequest, "Language server is shutting down")
    }
  }
  const semanticCapabilities = registerSemanticCapabilities({
    connection,
    documents,
    semantic,
    snapshot: (document) => snapshot(document, projects),
  })
  const diagnostics = createDocumentDiagnostics({
    connection,
    documents,
    semantic,
    snapshot: (document) => snapshot(document, projects),
  })
  logger.info("server.started", { transport: "stdio" })

  connection.onInitialize((params: InitializeParams) => {
    projects.configure(initialRootUris(params))
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
        ...semanticCapabilities.capabilities,
      },
    }
  })

  documents.onDidOpen(({ document }) => {
    semantic.sync(snapshot(document, projects))
    diagnostics.update(document)
  })
  documents.onDidChangeContent(({ document }) => {
    freshness.cancelDocument(document.uri)
    semantic.sync(snapshot(document, projects))
    diagnostics.update(document)
  })
  documents.onDidClose(({ document }) => {
    freshness.cancelDocument(document.uri)
    semantic.close(document.uri)
    diagnostics.close(document.uri)
  })

  connection.onCompletion(async (params, token) => {
    const startedAt = performance.now()
    let outcome = "error"
    let request: ReturnType<RequestFreshness["start"]> | undefined
    try {
      assertRunning()
      const document = documents.get(params.textDocument.uri)
      if (!document || !document.uri.startsWith("file:")) {
        outcome = "document-unavailable"
        return []
      }
      request = freshness.start(`completion:${document.uri}`, token)
      const requestedDocument = snapshot(document, projects)
      const result = await semantic.complete({
        document: requestedDocument,
        position: params.position,
        signal: request.signal,
      })
      if (request.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      const currentDocument = documents.get(document.uri)
      if (
        !request.isCurrent()
        || currentDocument?.version !== requestedDocument.version
        || result.documentVersion !== requestedDocument.version
      ) {
        outcome = "stale"
        return []
      }
      outcome = "ok"
      return result.value.map(toLspCompletionItem)
    } catch (error) {
      if (request?.clientCancelled()) {
        outcome = "cancelled"
        throw requestCancelled()
      }
      if (request?.signal.aborted) {
        outcome = "superseded"
        return []
      }
      throw error
    } finally {
      request?.finish()
      logger.info("request.completed", {
        method: "textDocument/completion",
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        outcome,
      })
    }
  })

  connection.onDefinition(async (params) => {
    assertRunning()
    const document = documents.get(params.textDocument.uri)
    if (!document || !document.uri.startsWith("file:")) return []
    const result = await semantic.define({
      document: snapshot(document, projects),
      position: params.position,
    })
    return result.value
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

function requestCancelled(): ResponseError<void> {
  return new ResponseError(LSPErrorCodes.RequestCancelled, "Request cancelled by client")
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
