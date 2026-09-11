import fs from "node:fs"
import path from "node:path"

import type {
  SemanticCallHierarchyItemInfo,
  SemanticCallHierarchyIncomingQueryResult,
  SemanticCallHierarchyOutgoingQueryResult,
  SemanticCallHierarchyPrepareQueryResult,
  SemanticCompletionItem,
  SemanticCompletionItemList,
  SemanticDefinitionCandidate,
  SemanticDiagnostic,
  SemanticDocumentHighlight,
  SemanticDocumentPosition,
  SemanticDocumentSymbolInfo,
  SemanticHoverInfo,
  SemanticInlayHint,
  SemanticSignatureHelp,
  SemanticTextRange,
  SemanticUsageResult,
  SemanticNumericDiagnostic,
} from "../protocol.js"
import { ArkUIResourceLanguageProvider } from "../arkui/resource-language-provider.js"
import { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { HarmonyProjectModel } from "../../project/harmony-project-model.js"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { arbitrateCompletionLists } from "./completion-arbitrator.js"
import { TypeScriptLanguageServiceEngine, type TypeScriptLanguageServiceEngineOptions } from "./typescript-language-service.js"
import {
  SemanticCoordinator,
  type SemanticManagedContext,
  type SemanticMemoryLevel,
} from "../../semantic/coordinator/semantic-coordinator.js"
import { ReferenceSearchExecutor } from "../../semantic/references/reference-search-executor.js"
import type { ReferenceSearchRuntimeConfig } from "../../semantic/references/reference-runtime.js"
import {
  resolveReferenceAnchorInWorker,
  verifyReferenceBatchInWorker,
} from "../../semantic/references/reference-batch-worker.js"

export type SemanticTypeStatus = "ready" | "partial" | "unsupported"

export interface SemanticTypeEngineState {
  status: SemanticTypeStatus
  engine: string
  version: string
  generation: number
}

export interface SemanticCodeFixCandidate {
  title: string
  kind: "quickfix"
  diagnostic: SemanticNumericDiagnostic
  fingerprint: string
}

export interface SemanticResolvedCodeFix extends SemanticCodeFixCandidate {
  edits: Array<{
    path: string
    range: SemanticTextRange
    newText: string
    expectedVersion: number
  }>
}

export type SemanticGlobalQueryFailureReason =
  | "project-membership-incomplete"
  | "source-outside-workspace"
  | "source-unavailable"
  | "source-unmappable"

export type SemanticReferenceQueryResult =
  | { status: "complete"; references: SemanticDefinitionCandidate[] }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export type SemanticPrepareRenameQueryResult =
  | { status: "ready"; range: SemanticTextRange; placeholder: string }
  | { status: "unavailable" }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export type SemanticRenameQueryResult =
  | {
      status: "complete"
      edits: Array<{
        path: string
        range: SemanticTextRange
        newText: string
        expectedVersion: number | null
      }>
    }
  | { status: "invalid-name" }
  | { status: "unavailable" }
  | { status: "incomplete"; reason: SemanticGlobalQueryFailureReason }

export type SemanticSignatureHelpTriggerReason =
  | { kind: "invoked" }
  | { kind: "characterTyped"; triggerCharacter: "(" | "," | "<" }
  | { kind: "retrigger"; triggerCharacter?: "(" | "," | "<" | ")" }

export interface SemanticTypeQueryContext {
  state: SemanticTypeEngineState
  complete(position: SemanticDocumentPosition): SemanticCompletionItemList
  resolveCompletion(position: SemanticDocumentPosition, item: SemanticCompletionItem): SemanticCompletionItem
  define(position: SemanticDocumentPosition): SemanticDefinitionCandidate[]
  typeDefinitions(position: SemanticDocumentPosition): SemanticDefinitionCandidate[]
  implementations(position: SemanticDocumentPosition): SemanticDefinitionCandidate[]
  references(
    position: SemanticDocumentPosition,
    includeDeclaration: boolean,
  ): SemanticReferenceQueryResult
  prepareRename(position: SemanticDocumentPosition): SemanticPrepareRenameQueryResult
  rename(position: SemanticDocumentPosition, newName: string): SemanticRenameQueryResult
  usages(position: SemanticDocumentPosition): SemanticUsageResult[]
  diagnostics(position: SemanticDocumentPosition): SemanticDiagnostic[]
  codeActions(
    position: SemanticDocumentPosition,
    range: SemanticTextRange,
  ): SemanticCodeFixCandidate[]
  resolveCodeAction(
    position: SemanticDocumentPosition,
    range: SemanticTextRange,
    fingerprint: string,
  ): SemanticResolvedCodeFix | null
  documentHighlights(position: SemanticDocumentPosition): SemanticDocumentHighlight[]
  inlayHints(
    position: SemanticDocumentPosition,
    range: SemanticTextRange,
  ): SemanticInlayHint[]
  prepareCallHierarchy(position: SemanticDocumentPosition): SemanticCallHierarchyPrepareQueryResult
  outgoingCalls(
    position: SemanticDocumentPosition,
    item: SemanticCallHierarchyItemInfo,
  ): SemanticCallHierarchyOutgoingQueryResult
  incomingCalls(
    position: SemanticDocumentPosition,
    item: SemanticCallHierarchyItemInfo,
  ): SemanticCallHierarchyIncomingQueryResult
  documentSymbols(position: SemanticDocumentPosition): SemanticDocumentSymbolInfo[]
  hover(position: SemanticDocumentPosition): SemanticHoverInfo | null
  signatureHelp(
    position: SemanticDocumentPosition,
    triggerReason: SemanticSignatureHelpTriggerReason,
  ): SemanticSignatureHelp | null
}

interface WorkspaceEngineEntry extends SemanticManagedContext {
  engine: TypeScriptLanguageServiceEngine
  arkui: ArkUIResourceLanguageProvider
  project: HarmonyProjectModel
  resourceScope: string
  ownerId: string
  resetEpoch: number
  appliedContentRevision: number
  lastAccess: number
  projectFiles: number
  openDocuments: number
}

export class SemanticTypeEngineRegistry {
  private readonly coordinator: SemanticCoordinator<WorkspaceEngineEntry>
  private readonly referenceSearch: ReferenceSearchExecutor | undefined
  private accessClock = 0
  private sdkConfiguration: unknown
  private projectConfiguration: unknown

  private get workspaces(): { get(rootPath: string): WorkspaceEngineEntry | undefined } {
    return { get: rootPath => this.coordinator.peek(rootPath) }
  }

  async referenceAnchor(
    workspace: SemanticWorkspaceView,
    position: SemanticDocumentPosition,
  ): Promise<readonly SemanticDefinitionCandidate[]> {
    const isolatedWorkspace = this.withProjectFileIdentities(workspace)
    if (!isolatedWorkspace) return []
    const rootPaths = new Set([path.resolve(workspace.state.path)])
    for (const document of workspace.documents) {
      if (document.overlay) rootPaths.add(path.resolve(document.path))
    }
    const admitted = new Set(rootPaths)
    const started = performance.now()
    const verification = await resolveReferenceAnchorInWorker({
      ...isolatedWorkspace,
      semanticRootPaths: [...rootPaths],
      documents: isolatedWorkspace.documents.filter(document => (
        document.overlay || admitted.has(path.resolve(document.path))
      )),
    }, position, {
      projectConfiguration: this.projectConfiguration,
      sdkConfiguration: this.sdkConfiguration,
      isCancellationRequested: this.options.hostCancellationToken
        ? () => this.options.hostCancellationToken?.isCancellationRequested() === true
        : undefined,
    })
    this.options.onReferenceTrace?.("references.anchor.complete", {
      verifierIsolation: "transient-worker",
      definitions: verification.definitions.length,
      preparedProgramSourceFiles: verification.prepared.stats.programSourceFiles,
      preparedProgramProjectFiles: verification.prepared.stats.programProjectFiles,
      preparedSdkSourceFiles: verification.prepared.stats.sdkSourceFiles,
      preparedProjectTextCodeUnits: verification.prepared.stats.projectTextCodeUnits,
      preparedSdkTextCodeUnits: verification.prepared.stats.sdkTextCodeUnits,
      preparedOtherSourceFiles: verification.prepared.stats.otherSourceFiles,
      preparedOtherTextCodeUnits: verification.prepared.stats.otherTextCodeUnits,
      preparedRss: verification.prepared.memory.rss,
      preparedHeapUsed: verification.prepared.memory.heapUsed,
      queryRssDelta: verification.memory.rss - verification.prepared.memory.rss,
      queryHeapUsedDelta: verification.memory.heapUsed - verification.prepared.memory.heapUsed,
      ...verification.stats,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      rss: verification.memory.rss,
      heapUsed: verification.memory.heapUsed,
    })
    return verification.definitions
  }

  constructor(
    private readonly packageResolver = new LocalPackageResolver(),
    private readonly onSdkSelected?: TypeScriptLanguageServiceEngineOptions["onSdkSelected"],
    private readonly projectFileAccess?: ProjectFileAccessPort,
    private readonly options: {
      maxResidentContexts?: number
      hostCancellationToken?: TypeScriptLanguageServiceEngineOptions["hostCancellationToken"]
      references?: ReferenceSearchRuntimeConfig
      onReferenceTrace?: (
        event: string,
        fields: Readonly<Record<string, string | number | boolean | null | undefined>>,
      ) => void
    } = {},
  ) {
    this.coordinator = new SemanticCoordinator({
      maxResidentContexts: options.maxResidentContexts ?? 2,
      createContext: rootPath => this.createContext(rootPath),
    })
    if (options.references?.strategy === "batched"
      || options.references?.strategy === "indexed-batched") {
      this.referenceSearch = new ReferenceSearchExecutor({
        batchRootLimit: options.references.batchRootLimit,
        verifyBatch: (workspace, position, includeDeclaration) => (
          verifyReferenceBatchInWorker(workspace, position, includeDeclaration, {
            projectConfiguration: this.projectConfiguration,
            sdkConfiguration: this.sdkConfiguration,
            isCancellationRequested: options.hostCancellationToken
              ? () => options.hostCancellationToken?.isCancellationRequested() === true
              : undefined,
          })
        ),
        disposeResidentContext: rootPath => { this.coordinator.remove(rootPath) },
        checkpoint: options.hostCancellationToken
          ? () => {
              if (options.hostCancellationToken?.isCancellationRequested()) {
                throw new Error("Semantic request cancelled")
              }
            }
          : undefined,
        trace: options.references.trace ? options.onReferenceTrace : undefined,
      })
    }
  }

  configureSdk(selection: unknown): void {
    this.sdkConfiguration = selection
    this.dispose()
  }

  configureProject(selection: unknown): void {
    this.projectConfiguration = selection
  }

  prepare(workspace: SemanticWorkspaceView): SemanticTypeQueryContext {
    const rootPath = path.resolve(workspace.rootPath)
    const ownerId = workspace.canonicalRootId ?? rootPath
    const resetEpoch = workspace.typeEngineResetEpoch ?? 0
    const contentRevision = workspace.contentRevision ?? 0
    const previous = this.coordinator.peek(rootPath)
    if (
      workspace.resetTypeEngine
      || previous?.ownerId !== ownerId
      || previous?.resetEpoch !== resetEpoch
      || (previous !== undefined && previous.appliedContentRevision !== contentRevision)
    ) {
      this.coordinator.remove(rootPath)
    }
    const lease = this.coordinator.acquire(rootPath)
    const entry = lease.context
    const newEntry = previous !== entry
    let state: SemanticTypeEngineState
    try {
      state = entry.engine.prepare(workspace)
    } catch (error) {
      lease.release()
      if (newEntry) this.coordinator.remove(rootPath)
      throw error
    }
    entry.ownerId = ownerId
    entry.resetEpoch = resetEpoch
    entry.appliedContentRevision = contentRevision
    entry.lastAccess = ++this.accessClock
    entry.projectFiles = workspace.projectMembership?.paths.length ?? workspace.documents.length
    entry.openDocuments = workspace.documents.filter(document => document.overlay).length
    const activeEntry = entry
    const scope = activeEntry.project.scopeFor(workspace.state.path)
    const resourceScope = JSON.stringify([scope.moduleRoot ?? rootPath, scope.resourceRoots])
    if (resourceScope !== activeEntry.resourceScope) {
      activeEntry.arkui.dispose()
      activeEntry.arkui = new ArkUIResourceLanguageProvider(scope.moduleRoot ?? rootPath, {
        ...(scope.status === "unconfigured" ? {} : { resourceRoots: scope.resourceRoots }),
      })
      activeEntry.resourceScope = resourceScope
    }
    const sourceContent = workspace.documents.find((document) => (
      document.path === workspace.state.path
    ))?.content
    lease.release()
    const withLease = <Result>(run: (current: WorkspaceEngineEntry) => Result): Result => {
      const queryLease = this.coordinator.acquire(rootPath)
      try {
        return run(queryLease.context)
      } finally {
        queryLease.release()
      }
    }
    return {
      state,
      complete: (position) => withLease((current) => {
        const arkui = sourceContent && scope.status !== "unavailable"
          ? current.arkui.complete(position, sourceContent)
          : { items: [], isIncomplete: scope.status === "unavailable" }
        const typescript = current.engine.complete(position)
        return arbitrateCompletionLists(arkui, typescript)
      }),
      resolveCompletion: (position, item) => item.data?.provider === "arkui-resource"
        ? item
        : withLease(current => current.engine.resolveCompletion(position, item)),
      define: (position) => withLease(current => mergeDefinitions(
        sourceContent && scope.status !== "unavailable"
          ? current.arkui.define(position, sourceContent)
          : [],
        current.engine.define(position),
      )),
      typeDefinitions: (position) => withLease(current => current.engine.typeDefinitions(position)),
      implementations: (position) => withLease(current => current.engine.implementations(position)),
      references: (position, includeDeclaration) => (
        withLease(current => current.engine.references(position, includeDeclaration))
      ),
      prepareRename: (position) => withLease(current => current.engine.prepareRename(position)),
      usages: (position) => withLease(current => current.engine.usages(position)),
      diagnostics: (position) => withLease(current => mergeDiagnostics(
        current.engine.diagnostics(position),
        scope.status === "unavailable"
          ? [{
              source: "language", severity: "error", code: "arkts.project.configuration",
              path: position.path,
              range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
              message: `Project configuration is unavailable: ${scope.reason ?? "unknown"}. Check build-profile.json5 and the product/target selection.`,
            }]
          : sourceContent ? current.arkui.diagnostics(position, sourceContent) : [],
      )),
      codeActions: (position, range) => withLease(current => current.engine.codeActions(position, range)),
      resolveCodeAction: (position, range, fingerprint) => (
        withLease(current => current.engine.resolveCodeAction(position, range, fingerprint))
      ),
      documentHighlights: (position) => withLease(current => current.engine.documentHighlights(position)),
      inlayHints: (position, range) => withLease(current => current.engine.inlayHints(position, range)),
      prepareCallHierarchy: (position) => withLease(current => current.engine.prepareCallHierarchy(position)),
      outgoingCalls: (position, item) => withLease(current => current.engine.outgoingCalls(position, item)),
      incomingCalls: (position, item) => withLease(current => current.engine.incomingCalls(position, item)),
      documentSymbols: (position) => withLease(current => current.engine.documentSymbols(position)),
      hover: (position) => withLease(current => current.engine.hover(position)),
      rename: (position, newName) => withLease(current => current.engine.rename(position, newName)),
      signatureHelp: (position, triggerReason) => (
        withLease(current => current.engine.signatureHelp(position, triggerReason))
      ),
    }
  }

  references(
    workspace: SemanticWorkspaceView,
    position: SemanticDocumentPosition,
    includeDeclaration: boolean,
    candidatePaths?: readonly string[],
  ): Promise<SemanticReferenceQueryResult> {
    if (this.referenceSearch) {
      const isolatedWorkspace = this.withProjectFileIdentities(workspace)
      if (!isolatedWorkspace) {
        return Promise.resolve({ status: "incomplete", reason: "source-unavailable" })
      }
      return this.referenceSearch.execute(
        isolatedWorkspace,
        position,
        includeDeclaration,
        candidatePaths,
        candidatePaths
          ? this.packageResolver.projectFor(workspace.rootPath).semanticGraph()
          : undefined,
      )
    }
    return Promise.resolve(this.prepare(workspace).references(position, includeDeclaration))
  }

  workspaceCount(): number {
    return this.coordinator.stats().residentContextCount
  }

  runtimeStats() {
    return this.coordinator.stats()
  }

  applyMemoryPressure(level: SemanticMemoryLevel): void {
    this.coordinator.applyMemoryPressure(level)
  }

  invalidateArkUIResources(rootPath: string): void {
    const lexicalRoot = path.resolve(rootPath)
    const ownerId = canonicalTypeEngineOwner(rootPath)
    this.coordinator.forEachContext((entry, entryRoot) => {
      if (entryRoot === lexicalRoot || entry.ownerId === ownerId) entry.arkui.invalidate()
    })
  }

  dispose(): void {
    this.coordinator.dispose()
  }

  private createContext(rootPath: string): WorkspaceEngineEntry {
    const engine = this.createTypeScriptEngine(rootPath)
    return {
      engine,
      arkui: new ArkUIResourceLanguageProvider(rootPath),
      project: this.packageResolver.projectFor(rootPath),
      resourceScope: "",
      ownerId: rootPath,
      resetEpoch: -1,
      appliedContentRevision: -1,
      lastAccess: 0,
      projectFiles: 0,
      openDocuments: 0,
      trim() {
        this.engine.trim()
      },
      dispose() {
        this.engine.dispose()
        this.arkui.dispose()
      },
      stats() {
        return { projectFiles: this.projectFiles, openDocuments: this.openDocuments }
      },
    }
  }

  private createTypeScriptEngine(rootPath: string): TypeScriptLanguageServiceEngine {
    return new TypeScriptLanguageServiceEngine(rootPath, {
      packageResolver: this.packageResolver,
      onSdkSelected: this.onSdkSelected,
      projectFileAccess: this.projectFileAccess,
      sdkConfiguration: this.sdkConfiguration,
      hostCancellationToken: this.options.hostCancellationToken,
    })
  }

  private withProjectFileIdentities(
    workspace: SemanticWorkspaceView,
  ): SemanticWorkspaceView | undefined {
    const membership = workspace.projectMembership
    if (!this.projectFileAccess || !membership || membership.status !== "complete") return workspace
    const overlays = new Set(workspace.documents.filter(document => document.overlay).map(document => (
      path.resolve(document.path)
    )))
    const projectFileIdentities: Array<readonly [string, string]> = []
    for (const memberPath of membership.paths) {
      const filePath = path.resolve(memberPath)
      const token = this.projectFileAccess.tokenFor(
        workspace.canonicalRootId,
        membership.revision,
        filePath,
      )
      if (token === undefined) {
        if (overlays.has(filePath)) continue
        return undefined
      }
      projectFileIdentities.push([filePath, token])
    }
    return { ...workspace, projectFileIdentities }
  }
}

function canonicalTypeEngineOwner(rootPath: string): string {
  const resolved = path.resolve(rootPath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function mergeDefinitions(
  arkui: SemanticDefinitionCandidate[],
  typescript: SemanticDefinitionCandidate[],
): SemanticDefinitionCandidate[] {
  const result: SemanticDefinitionCandidate[] = []
  const seen = new Set<string>()
  for (const definition of [...arkui, ...typescript]) {
    const key = [
      definition.path,
      definition.range.startLine,
      definition.range.startColumn,
      definition.range.endLine,
      definition.range.endColumn,
    ].join(":")
    if (seen.has(key)) continue
    seen.add(key)
    result.push(definition)
  }
  return result
}

function mergeDiagnostics(
  typescript: SemanticDiagnostic[],
  arkui: SemanticDiagnostic[],
): SemanticDiagnostic[] {
  if (arkui.length === 0) return typescript
  if (typescript.length === 0) return arkui
  const result: SemanticDiagnostic[] = []
  const seen = new Set<string>()
  for (const diagnostic of [...typescript, ...arkui]) {
    const key = JSON.stringify([
      diagnostic.path,
      diagnostic.range.startLine,
      diagnostic.range.startColumn,
      diagnostic.range.endLine,
      diagnostic.range.endColumn,
      diagnostic.code,
      diagnostic.severity,
      diagnostic.message,
    ])
    if (seen.has(key)) continue
    seen.add(key)
    result.push(diagnostic)
  }
  return result.sort((left, right) => (
    ordinalCompare(left.path, right.path)
    || left.range.startLine - right.range.startLine
    || left.range.startColumn - right.range.startColumn
    || left.range.endLine - right.range.endLine
    || left.range.endColumn - right.range.endColumn
    || ordinalCompare(String(left.code), String(right.code))
    || ordinalCompare(left.message, right.message)
  ))
}

function ordinalCompare(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
