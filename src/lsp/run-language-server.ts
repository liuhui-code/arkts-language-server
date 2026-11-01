import { pathToFileURL } from "node:url"

import {
  CodeActionKind,
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
  SemanticEnginePort,
  SemanticResolvedCodeAction,
} from "../contracts/semantic-engine.js"
import type { ProjectResolverPort } from "../contracts/project-resolver.js"
import type {
  WorkspaceSymbolServicePort,
} from "../contracts/workspace-symbol-service.js"
import { ARKUI_STRING_RESOURCE_GLOB, ARKUI_CONFIGURED_STRING_RESOURCE_GLOB } from "../core/arkui/resource-path.js"
import { SingleRootProjectResolver } from "../project/single-root-project-resolver.js"
import { createStructuredLogger, processMemoryFields, type StructuredLogger } from "../observability/logger.js"
import { createProductionSemanticEngine } from "../semantic/backends/production-semantic-engine.js"
import { createDocumentDiagnostics } from "./document-diagnostics.js"
import {
  CodeActionResolutionStore,
  type CodeActionResolutionData,
} from "./code-action-resolution-store.js"
import { CallHierarchySourceAuthority } from "./call-hierarchy-source-authority.js"
import { registerCompletionHandlers } from "./register-completion.js"
import { registerNavigationCapabilities } from "./register-navigation.js"
import { toLspDiagnostic } from "./diagnostic-mapper.js"
import { RequestFreshness } from "./request-freshness.js"
import { registerBenchmarkControls } from "./register-benchmark-controls.js"
import { registerSemanticReadiness } from "./register-semantic-readiness.js"
import { prepareInitialSemantics } from "./initial-semantic-preparation.js"
import { startWorkspaceIndex } from "./workspace-index-initialization.js"
import {
  negotiatedSymbolKind,
  registerSemanticCapabilities,
} from "./register-semantic-capabilities.js"
import { requestCancelled, SemanticRequestRunner } from "./semantic-request-runner.js"
import { WorkspaceFileChangeCoordinator } from "./workspace-file-change-coordinator.js"

export interface LanguageServerServices {
  logger?: StructuredLogger
  projects: ProjectResolverPort
  semantic: SemanticEnginePort
  workspaceSymbols?: WorkspaceSymbolServicePort
}

export function runLanguageServer(services?: LanguageServerServices): void {
  const logger = services?.logger ?? createStructuredLogger()
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)
  const projects = services?.projects
    ?? new SingleRootProjectResolver(pathToFileURL(process.cwd()).href)
  const semantic = services?.semantic ?? createProductionSemanticEngine(projects, logger)
  const workspaceSymbols = services?.workspaceSymbols
  const freshness = new RequestFreshness()
  const codeActionResolutions = new CodeActionResolutionStore()
  let shuttingDown = false
  let disposed = false
  let disposal: Promise<void> | undefined
  let workspaceRoots: { id: string; rootUri: string }[] = []
  let workspaceFileChanges = new WorkspaceFileChangeCoordinator({ rootUris: [] })
  let supportsWatchedFileRegistration = false
  let workspaceSymbolKindValueSet: readonly SymbolKind[] | undefined
  let workspaceIndexAbort: AbortController | undefined
  const initialPreparation = new AbortController()

  const disposeOnce = (reason: "shutdown" | "exit") => {
    if (disposed) return disposal
    disposed = true
    workspaceIndexAbort?.abort(new Error("Language server stopped"))
    initialPreparation.abort(new Error("Language server stopped"))
    completionHandlers.clear()
    codeActionResolutions.clear()
    disposal = Promise.resolve(semantic.dispose()).then(() => workspaceSymbols?.dispose()).then(() => {
      logger.info("server.stopped", { reason })
    })
    return disposal
  }

  const assertRunning = () => {
    if (shuttingDown) {
      throw new ResponseError(ErrorCodes.InvalidRequest, "Language server is shutting down")
    }
  }
  const callHierarchySources = new CallHierarchySourceAuthority({
    documents,
    snapshot: (document) => snapshot(document, projects),
    workspaceRoots: () => workspaceRoots,
  })
  const requests = new SemanticRequestRunner({
    documents,
    freshness,
    logger,
    callHierarchySources,
    assertRunning,
    snapshot: (document) => snapshot(document, projects),
  })
  const completionHandlers = registerCompletionHandlers({ connection, documents, semantic, requests, assertRunning })
  const diagnostics = createDocumentDiagnostics({
    connection,
    documents,
    semantic,
    snapshot: (document) => snapshot(document, projects),
  })
  const semanticCapabilities = registerSemanticCapabilities({
    connection,
    semantic,
    requests,
    suspendDiagnostics: () => diagnostics.suspend(),
  })
  registerBenchmarkControls({ connection, semantic,
    suspendDiagnostics: () => diagnostics.suspend(),
    workspaceRootCount: () => workspaceRoots.length })
  registerSemanticReadiness({ connection, semantic, assertRunning,
    workspaceRootUris: () => workspaceRoots.map(root => root.rootUri) })
  logger.info("server.started", { transport: "stdio" })

  connection.onInitialize((params: InitializeParams) => {
    const rootUris = initialRootUris(params)
    projects.configure(rootUris)
    semantic.configureProject?.(params.initializationOptions?.project)
    semantic.configureSdk?.(params.initializationOptions?.sdk)
    workspaceRoots = rootUris.map((rootUri) => ({
      id: projects.projectFor(rootUri).id,
      rootUri,
    }))
    workspaceFileChanges = new WorkspaceFileChangeCoordinator({
      rootUris, isResourceFile: semantic.isResourceFile?.bind(semantic),
    })
    supportsWatchedFileRegistration = params.capabilities.workspace
      ?.didChangeWatchedFiles?.dynamicRegistration === true
    workspaceSymbolKindValueSet = params.capabilities.workspace?.symbol
      ?.symbolKind?.valueSet
    completionHandlers.configure(params.capabilities)
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
    void prepareInitialSemantics(connection, semantic, workspaceRoots, logger, initialPreparation.signal)
    if (supportsWatchedFileRegistration) {
      void connection.client.register(DidChangeWatchedFilesNotification.type, {
        watchers: [
          { globPattern: "**/*.ets" },
          { globPattern: "**/*.ts" },
          { globPattern: "**/oh-package.json5" },
          { globPattern: "**/oh-package-lock.json5" },
          { globPattern: "**/build-profile.json5" },
          { globPattern: "**/local.properties" },
          { globPattern: ARKUI_STRING_RESOURCE_GLOB },
          { globPattern: ARKUI_CONFIGURED_STRING_RESOURCE_GLOB },
        ],
      }).catch(() => {
        logger.error("workspace.watch.registration.failed", { outcome: "disabled" })
      })
    }
    if (workspaceSymbols && !shuttingDown) {
      workspaceIndexAbort = await startWorkspaceIndex(connection, workspaceSymbols, workspaceRoots, logger, () => shuttingDown)
    }
  })

  documents.onDidOpen(({ document }) => {
    const opened = snapshot(document, projects)
    freshness.cancelWorkspace(opened.workspaceId)
    semantic.sync(opened)
    workspaceSymbols?.sync(opened)
    diagnostics.update(document)
  })
  connection.onDidChangeConfiguration(({ settings }) => {
    const configured = settings?.arkts
    if (!configured) return
    const projectChanged = Object.prototype.hasOwnProperty.call(configured, "project")
    const sdkChanged = Object.prototype.hasOwnProperty.call(configured, "sdk")
    if (!projectChanged && !sdkChanged) return
    for (const workspace of workspaceRoots) freshness.cancelWorkspace(workspace.id)
    if (projectChanged) semantic.configureProject?.(configured.project)
    if (sdkChanged) semantic.configureSdk?.(configured.sdk)
    semantic.workspaceFilesChanged?.(workspaceRoots.map(({ rootUri }) => ({
      rootUri, rootDirty: true, changes: [],
    })))
    workspaceSymbols?.workspaceFilesChanged(workspaceRoots.map(({ id }) => id))
    for (const document of documents.all()) diagnostics.update(document)
    if (projectChanged) {
      logger.info("project.selection.changed", { workspaceCount: workspaceRoots.length })
    }
    if (sdkChanged) {
      logger.info("sdk.configuration.changed", { workspaceCount: workspaceRoots.length })
    }
  })
  connection.onDidChangeWatchedFiles(({ changes }) => {
    workspaceFileChanges.accept(changes)
    const batches = workspaceFileChanges.drain()
    if (batches.length > 0) {
      for (const batch of batches) {
        freshness.cancelWorkspace(projects.projectFor(batch.rootUri).id)
      }
      semantic.workspaceFilesChanged?.(batches)
      workspaceSymbols?.workspaceFilesChanged([...new Set(batches.map((batch) => projects.projectFor(batch.rootUri).id))])
      const resourceWorkspaceIds = new Set(
        batches
          .filter((batch) => batch.resourceChanged)
          .map((batch) => projects.projectFor(batch.rootUri).id),
      )
      const dirtyWorkspaceIds = new Set(
        batches.filter((batch) => batch.rootDirty).map((batch) => projects.projectFor(batch.rootUri).id),
      )
      if (resourceWorkspaceIds.size > 0 || dirtyWorkspaceIds.size > 0) {
        let scheduledDocuments = 0
        for (const document of documents.all()) {
          const workspaceId = projects.projectFor(document.uri).id
          if (
            dirtyWorkspaceIds.has(workspaceId)
            || (document.getText().includes("$r") && resourceWorkspaceIds.has(workspaceId))
          ) {
            scheduledDocuments += 1
            diagnostics.update(document)
          }
        }
        logger.info(dirtyWorkspaceIds.size > 0
          ? "diagnostics.project.refresh.scheduled" : "diagnostics.resource.refresh.scheduled", {
          workspaceCount: new Set([...resourceWorkspaceIds, ...dirtyWorkspaceIds]).size,
          documentCount: scheduledDocuments,
        })
      }
    }
  })
  documents.onDidChangeContent(({ document }) => {
    const changed = snapshot(document, projects)
    freshness.cancelDocument(document.uri)
    freshness.cancelWorkspace(changed.workspaceId)
    codeActionResolutions.forgetDocument(document.uri)
    semantic.sync(changed)
    workspaceSymbols?.sync(changed)
    diagnostics.update(document)
  })
  documents.onDidClose(({ document }) => {
    freshness.cancelDocument(document.uri)
    freshness.cancelWorkspace(projects.projectFor(document.uri).id)
    codeActionResolutions.forgetDocument(document.uri)
    semantic.close(document.uri)
    workspaceSymbols?.closeDocument(document.uri)
    diagnostics.close(document.uri)
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

  registerNavigationCapabilities(connection, semantic, requests)

  connection.onWorkspaceSymbol(async (params, token) => {
    const startedAt = performance.now()
    let outcome = "error"
    const request = freshness.startConcurrent(
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
        kind: negotiatedSymbolKind(item.kind, workspaceSymbolKindValueSet),
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
        ...processMemoryFields(),
      })
    }
  })

  connection.onShutdown(() => {
    shuttingDown = true
    freshness.cancelAll()
    diagnostics.dispose()
    return disposeOnce("shutdown")
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

function invalidCodeActionResolution(status: "stale" | "unknown"): ResponseError<void> {
  return new ResponseError(
    status === "stale" ? LSPErrorCodes.ContentModified : ErrorCodes.InvalidParams,
    status === "stale" ? "Code action is stale" : "Code action is unknown",
  )
}

function includesQuickFix(only: readonly string[] | undefined): boolean {
  if (!only || only.length === 0) return true
  return only.some((kind) => (
    kind === "" || kind === CodeActionKind.QuickFix || CodeActionKind.QuickFix.startsWith(`${kind}.`)
  ))
}
