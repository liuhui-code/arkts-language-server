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
import { RequestFreshness } from "./request-freshness.js"
import { registerSemanticCapabilities } from "./register-semantic-capabilities.js"

export interface LanguageServerServices {
  projects: ProjectResolverPort
  semantic: SemanticEnginePort
}

export function runLanguageServer(services?: LanguageServerServices): void {
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)
  const projects = services?.projects
    ?? new SingleRootProjectResolver(pathToFileURL(process.cwd()).href)
  const semantic = services?.semantic ?? new LegacySemanticEngine(projects)
  const freshness = new RequestFreshness()
  let shuttingDown = false
  let disposed = false

  const disposeOnce = () => {
    if (disposed) return
    disposed = true
    semantic.dispose()
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

  connection.onInitialize((params: InitializeParams) => {
    projects.configure(initialRootUris(params))
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
        ...semanticCapabilities,
      },
    }
  })

  documents.onDidOpen(({ document }) => semantic.sync(snapshot(document, projects)))
  documents.onDidChangeContent(({ document }) => {
    freshness.cancelDocument(document.uri)
    semantic.sync(snapshot(document, projects))
  })
  documents.onDidClose(({ document }) => {
    freshness.cancelDocument(document.uri)
    semantic.close(document.uri)
  })

  connection.onCompletion(async (params, token) => {
    assertRunning()
    const document = documents.get(params.textDocument.uri)
    if (!document || !document.uri.startsWith("file:")) return []
    const request = freshness.start(`completion:${document.uri}`, token)
    const requestedDocument = snapshot(document, projects)
    try {
      const result = await semantic.complete({
        document: requestedDocument,
        position: params.position,
        signal: request.signal,
      })
      if (request.clientCancelled()) throw requestCancelled()
      const currentDocument = documents.get(document.uri)
      if (
        !request.isCurrent()
        || currentDocument?.version !== requestedDocument.version
        || result.documentVersion !== requestedDocument.version
      ) return []
      return result.value.map(toLspCompletionItem)
    } catch (error) {
      if (request.clientCancelled()) throw requestCancelled()
      if (request.signal.aborted) return []
      throw error
    } finally {
      request.finish()
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
    disposeOnce()
  })
  connection.onExit(() => {
    freshness.cancelAll()
    disposeOnce()
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
