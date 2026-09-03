import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"

import {
  CodeActionKind,
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  DidChangeWatchedFilesNotification,
  ErrorCodes,
  type InitializeParams,
  LSPErrorCodes,
  PositionEncodingKind,
  ProposedFeatures,
  ResponseError,
  SymbolKind,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node.js"
import { TextDocument } from "vscode-languageserver-textdocument"

import { ARKTS_LANGUAGE_SERVER_IDENTITY } from "../build-identity.js"
import type { DocumentSnapshot } from "../contracts/document.js"
import type {
  SemanticCodeAction,
  SemanticCompletion,
  SemanticEnginePort,
  SemanticResolvedCodeAction,
} from "../contracts/semantic-engine.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type {
  WorkspaceIndexProgress,
  WorkspaceSymbolServicePort,
} from "../contracts/workspace-symbol-service.js"
import { ARKUI_STRING_RESOURCE_GLOB } from "../core/arkui/resource-path.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { createStructuredLogger } from "../observability/logger.js"
import { LegacySemanticEngine } from "../semantic/legacy-semantic-engine.js"
import { createDocumentDiagnostics } from "./document-diagnostics.js"
import {
  CodeActionResolutionStore,
  type CodeActionResolutionData,
} from "./code-action-resolution-store.js"
import { toLspDiagnostic } from "./diagnostic-mapper.js"
import { RequestFreshness } from "./request-freshness.js"
import { registerSemanticCapabilities } from "./register-semantic-capabilities.js"
import { requestCancelled, SemanticRequestRunner } from "./semantic-request-runner.js"
import { WorkspaceFileChangeCoordinator } from "./workspace-file-change-coordinator.js"

const MAX_COMPLETION_RESOLUTIONS = 512

interface CompletionResolutionRecord {
  documentUri: string
  documentVersion: number
  position: { line: number; character: number }
  completion: SemanticCompletion
}

interface CompletionResolutionData {
  arktsCompletionId: string
}

class CompletionResolutionStore {
  private readonly entries = new Map<string, CompletionResolutionRecord>()

  remember(record: CompletionResolutionRecord): CompletionResolutionData {
    const id = randomUUID()
    this.entries.set(id, record)
    while (this.entries.size > MAX_COMPLETION_RESOLUTIONS) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return { arktsCompletionId: id }
  }

  find(data: unknown): CompletionResolutionRecord | undefined {
    if (
      data === null
      || typeof data !== "object"
      || Array.isArray(data)
      || Object.keys(data).length !== 1
      || typeof (data as { arktsCompletionId?: unknown }).arktsCompletionId !== "string"
    ) return undefined
    return this.entries.get((data as CompletionResolutionData).arktsCompletionId)
  }

  forgetDocument(documentUri: string): void {
    for (const [id, record] of this.entries) {
      if (record.documentUri === documentUri) this.entries.delete(id)
    }
  }

  clear(): void {
    this.entries.clear()
  }
}

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
  const completionResolutions = new CompletionResolutionStore()
  const codeActionResolutions = new CodeActionResolutionStore()
  let shuttingDown = false
  let disposed = false
  let workspaceRoots: { id: string; rootUri: string }[] = []
  let workspaceFileChanges = new WorkspaceFileChangeCoordinator({ rootUris: [] })
  let supportsWatchedFileRegistration = false
  let workspaceIndexAbort: AbortController | undefined

  const disposeOnce = (reason: "shutdown" | "exit") => {
    if (disposed) return
    disposed = true
    workspaceIndexAbort?.abort(new Error("Language server stopped"))
    completionResolutions.clear()
    codeActionResolutions.clear()
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
    workspaceRoots = rootUris.map((rootUri) => ({ id: rootUri, rootUri }))
    workspaceFileChanges = new WorkspaceFileChangeCoordinator({ rootUris })
    supportsWatchedFileRegistration = params.capabilities.workspace
      ?.didChangeWatchedFiles?.dynamicRegistration === true
    semanticCapabilities.configure(params.capabilities)
    logger.info("lsp.initialized", {
      workspaceCount: initialRootUris(params).length,
      positionEncoding: "utf-16",
    })
    return {
      serverInfo: {
        ...ARKTS_LANGUAGE_SERVER_IDENTITY,
      },
      capabilities: {
        positionEncoding: PositionEncodingKind.UTF16,
        textDocumentSync: {
          openClose: true,
          change: TextDocumentSyncKind.Incremental,
        },
        completionProvider: { triggerCharacters: ["."], resolveProvider: true },
        definitionProvider: true,
        ...(workspaceSymbols ? { workspaceSymbolProvider: true } : {}),
        ...semanticCapabilities.capabilities,
      },
    }
  })

  connection.onInitialized(async () => {
    if (shuttingDown) return
    if (supportsWatchedFileRegistration) {
      void connection.client.register(DidChangeWatchedFilesNotification.type, {
        watchers: [
          { globPattern: "**/*.ets" },
          { globPattern: "**/*.ts" },
          { globPattern: ARKUI_STRING_RESOURCE_GLOB },
        ],
      }).catch(() => {
        logger.error("workspace.watch.registration.failed", { outcome: "disabled" })
      })
    }
    if (!workspaceSymbols || shuttingDown) return
    const progress = await connection.window.createWorkDoneProgress()
    if (shuttingDown) return
    workspaceIndexAbort = new AbortController()
    const cancellation = progress.token.onCancellationRequested(() => {
      workspaceIndexAbort?.abort(new Error("Workspace indexing cancelled by client"))
    })
    let finished = false
    let lastPercentage = 0
    progress.begin("ArkTS workspace index", undefined, "Discovering project files", true)
    const report = (status: WorkspaceIndexProgress) => {
      if (finished) return
      if (status.phase === "discovering") {
        if (status.discoveredFiles > 0) {
          progress.report(discoveryMessage(status))
        }
        return
      }
      if (status.phase === "indexing") {
        const percentage = indexPercentage(status)
        const message = indexingMessage(status)
        if (percentage === undefined) {
          progress.report(message)
        } else {
          lastPercentage = Math.max(lastPercentage, percentage)
          progress.report(lastPercentage, message)
        }
        return
      }
      if (status.phase === "ready") {
        progress.report(100, readyMessage(status))
      } else if (status.phase === "degraded") {
        progress.report(degradedMessage(status))
      } else {
        progress.report(cancelledMessage(status))
      }
      logger.info("index.catalog.terminal", {
        phase: status.phase,
        workspaceCount: workspaceRoots.length,
        discoveredFiles: status.discoveredFiles,
        indexedFiles: status.indexedFiles,
        skippedEntries: status.skippedEntries,
        totalFiles: status.totalFiles,
      })
      finished = true
      cancellation.dispose()
      progress.done()
    }
    try {
      workspaceSymbols.start(workspaceRoots, report, workspaceIndexAbort.signal)
    } catch {
      logger.error("index.start.failed", { outcome: "degraded" })
      report({
        phase: "degraded",
        discoveredFiles: 0,
        indexedFiles: 0,
        skippedEntries: 0,
      })
    }
  })

  documents.onDidOpen(({ document }) => {
    const opened = snapshot(document, projects)
    freshness.cancelWorkspace(opened.workspaceId)
    semantic.sync(opened)
    workspaceSymbols?.sync(opened)
    diagnostics.update(document)
  })
  connection.onDidChangeWatchedFiles(({ changes }) => {
    workspaceFileChanges.accept(changes)
    const batches = workspaceFileChanges.drain()
    if (batches.length > 0) {
      for (const batch of batches) {
        freshness.cancelWorkspace(projects.projectFor(batch.rootUri).id)
      }
      semantic.workspaceFilesChanged?.(batches)
    }
  })
  documents.onDidChangeContent(({ document }) => {
    const changed = snapshot(document, projects)
    freshness.cancelDocument(document.uri)
    freshness.cancelWorkspace(changed.workspaceId)
    completionResolutions.forgetDocument(document.uri)
    codeActionResolutions.forgetDocument(document.uri)
    semantic.sync(changed)
    workspaceSymbols?.sync(changed)
    diagnostics.update(document)
  })
  documents.onDidClose(({ document }) => {
    freshness.cancelDocument(document.uri)
    freshness.cancelWorkspace(projects.projectFor(document.uri).id)
    completionResolutions.forgetDocument(document.uri)
    codeActionResolutions.forgetDocument(document.uri)
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
    const document = documents.get(params.textDocument.uri)
    if (!document) return []
    return result.map((completion) => toLspCompletionItem(
      completion,
      completionResolutions.remember({
        documentUri: document.uri,
        documentVersion: document.version,
        position: { ...params.position },
        completion,
      }),
    ))
  })

  connection.onCompletionResolve(async (clientItem, token) => {
    assertRunning()
    const record = completionResolutions.find(clientItem.data)
    const currentDocument = record ? documents.get(record.documentUri) : undefined
    if (!record || !currentDocument || currentDocument.version !== record.documentVersion) {
      throw invalidCompletionResolution()
    }
    const resolved = await requests.run<SemanticCompletion | null>({
      method: "completionItem/resolve",
      documentUri: record.documentUri,
      token,
      fallback: null,
      execute: (document, signal) => semantic.resolveCompletion({
        document,
        position: record.position,
        completion: record.completion,
        signal,
      }),
    })
    if (!resolved) throw invalidCompletionResolution()
    return toLspResolvedCompletionItem(resolved, clientItem.data as CompletionResolutionData, record)
  })

  connection.onCodeAction(async (params, token) => {
    if (!includesQuickFix(params.context.only)) return []
    const actions = await requests.run({
      method: "textDocument/codeAction",
      documentUri: params.textDocument.uri,
      token,
      fallback: [] as SemanticCodeAction[],
      execute: (document, signal) => semantic.codeActions({
        document,
        range: params.range,
        signal,
      }),
    })
    const document = documents.get(params.textDocument.uri)
    if (!document) return []
    return actions.map((action) => {
      const diagnostic = toLspDiagnostic(action.diagnostic)
      const data = codeActionResolutions.remember({
        documentUri: document.uri,
        documentVersion: document.version,
        action: {
          title: action.title,
          kind: "quickfix",
          diagnostic: {
            range: action.diagnostic.range,
            severity: diagnostic.severity,
            code: action.diagnostic.code,
            source: action.diagnostic.source,
            message: action.diagnostic.message,
          },
        },
        fingerprint: action.fingerprint,
      })
      return {
        title: action.title,
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        data,
      }
    })
  })

  connection.onCodeActionResolve(async (clientAction, token) => {
    assertRunning()
    const lookup = codeActionResolutions.lookup(clientAction.data)
    if (lookup.status !== "active") throw invalidCodeActionResolution(lookup.status)
    const { record } = lookup
    const currentDocument = documents.get(record.documentUri)
    if (!currentDocument || currentDocument.version !== record.documentVersion) {
      codeActionResolutions.forgetDocument(record.documentUri)
      throw invalidCodeActionResolution("stale")
    }
    const resolved = await requests.run<SemanticResolvedCodeAction | null>({
      method: "codeAction/resolve",
      documentUri: record.documentUri,
      token,
      fallback: null,
      execute: (document, signal) => semantic.resolveCodeAction({
        document,
        action: {
          title: record.action.title,
          kind: record.action.kind,
          diagnostic: {
            range: record.action.diagnostic.range,
            severity: record.action.diagnostic.severity === DiagnosticSeverity.Error
              ? "error"
              : "warning",
            code: record.action.diagnostic.code,
            message: record.action.diagnostic.message,
            source: "arkts",
          },
          fingerprint: record.fingerprint,
        },
        signal,
      }),
    })
    if (
      !resolved
      || resolved.edits.length === 0
      || resolved.edits.some((edit) => (
        edit.uri !== record.documentUri || edit.expectedVersion !== record.documentVersion
      ))
    ) throw invalidCodeActionResolution("stale")
    const resolutionData = clientAction.data as CodeActionResolutionData
    const diagnostic = {
      ...record.action.diagnostic,
      severity: record.action.diagnostic.severity === DiagnosticSeverity.Error
        ? DiagnosticSeverity.Error
        : DiagnosticSeverity.Warning,
    }
    return {
      title: record.action.title,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      data: { arktsCodeActionId: resolutionData.arktsCodeActionId },
      edit: {
        documentChanges: [{
          textDocument: {
            uri: record.documentUri,
            version: record.documentVersion,
          },
          edits: resolved.edits.map((edit) => ({
            range: edit.range,
            newText: edit.newText,
          })),
        }],
      },
    }
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
    const request = freshness.start(
      "workspace/symbol",
      token,
      { kind: "independent" },
    )
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

function toLspCompletionItem(
  item: SemanticCompletion,
  data: CompletionResolutionData,
) {
  return {
    label: item.label,
    detail: item.detail,
    kind: completionKind(item.kind),
    insertText: item.insertText,
    filterText: item.filterText,
    sortText: item.sortText,
    textEdit: item.replacementRange
      ? {
          range: item.replacementRange,
          newText: item.insertText ?? item.label,
        }
      : undefined,
    data,
  }
}

function toLspResolvedCompletionItem(
  item: SemanticCompletion,
  data: CompletionResolutionData,
  record: CompletionResolutionRecord,
) {
  const additionalTextEdits = item.additionalTextEdits?.map((edit) => {
    if (
      edit.uri !== record.documentUri
      || edit.expectedVersion !== record.documentVersion
    ) throw invalidCompletionResolution()
    return { range: edit.range, newText: edit.newText }
  })
  return {
    ...toLspCompletionItem(item, data),
    documentation: item.documentation,
    additionalTextEdits,
  }
}

function invalidCompletionResolution(): ResponseError<void> {
  return new ResponseError(
    ErrorCodes.InvalidParams,
    "Completion item is unknown or stale",
  )
}

function invalidCodeActionResolution(status: "stale" | "unknown"): ResponseError<void> {
  return new ResponseError(
    status === "stale" ? LSPErrorCodes.ContentModified : ErrorCodes.InvalidParams,
    status === "stale" ? "Code action is stale" : "Code action is unknown",
  )
}

function completionKind(kind: SemanticCompletion["kind"]): CompletionItemKind {
  switch (kind) {
    case "method": return CompletionItemKind.Method
    case "field": return CompletionItemKind.Field
    case "function": return CompletionItemKind.Function
    case "class": return CompletionItemKind.Class
    case "interface": return CompletionItemKind.Interface
    case "keyword": return CompletionItemKind.Keyword
    case "variable": return CompletionItemKind.Variable
    default: return CompletionItemKind.Property
  }
}

function includesQuickFix(only: readonly string[] | undefined): boolean {
  if (!only || only.length === 0) return true
  return only.some((kind) => (
    kind === "" || kind === CodeActionKind.QuickFix || CodeActionKind.QuickFix.startsWith(`${kind}.`)
  ))
}

function workspaceSymbolKind(kind: string): SymbolKind {
  switch (kind) {
    case "class": return SymbolKind.Class
    case "interface": return SymbolKind.Interface
    case "enum": return SymbolKind.Enum
    case "enumMember": return SymbolKind.EnumMember
    case "method": return SymbolKind.Method
    case "function": return SymbolKind.Function
    case "property": return SymbolKind.Property
    case "constructor": return SymbolKind.Constructor
    case "module": return SymbolKind.Module
    case "type": return SymbolKind.TypeParameter
    case "variable": return SymbolKind.Variable
    case "struct": return SymbolKind.Struct
    default: return SymbolKind.Variable
  }
}

function indexPercentage(status: WorkspaceIndexProgress): number | undefined {
  if (!status.totalFiles || status.indexedFiles <= 0) return undefined
  return Math.min(99, Math.max(1, Math.floor(status.indexedFiles * 100 / status.totalFiles)))
}

function discoveryMessage(status: WorkspaceIndexProgress): string {
  return `Discovered ${status.discoveredFiles} files; skipped ${status.skippedEntries} entries`
}

function indexingMessage(status: WorkspaceIndexProgress): string {
  const total = status.totalFiles === undefined ? "?" : String(status.totalFiles)
  return `Indexing ${status.indexedFiles}/${total} files; skipped ${status.skippedEntries} entries`
}

function readyMessage(status: WorkspaceIndexProgress): string {
  const total = status.totalFiles ?? status.discoveredFiles
  return total === 0
    ? `No ArkTS files found; skipped ${status.skippedEntries} entries`
    : `Indexed ${status.indexedFiles}/${total} files; skipped ${status.skippedEntries} entries`
}

function degradedMessage(status: WorkspaceIndexProgress): string {
  return `Indexing degraded after ${status.indexedFiles} files; skipped ${status.skippedEntries} entries`
}

function cancelledMessage(status: WorkspaceIndexProgress): string {
  return `Indexing cancelled after ${status.indexedFiles} files; skipped ${status.skippedEntries} entries`
}
