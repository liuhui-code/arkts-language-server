import path from "node:path"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../protocol.js"
import { ArkUIResourceLanguageProvider } from "../arkui/resource-language-provider.js"
import { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { HarmonyProjectModel } from "../../project/harmony-project-model.js"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { arbitrateCompletionLists } from "./completion-arbitrator.js"
import { mergeDefinitions, mergeDiagnostics } from "./type-result-merge.js"
import { withProjectFileIdentities } from "./type-project-file-identities.js"
import { canonicalTypeEngineOwner, typeContextResetReason } from "./type-context-reset.js"
import {
  TypeScriptLanguageServiceEngine,
  type TypeScriptLanguageServiceEngineOptions,
  type TypeScriptSdkAmbientProfile,
} from "./typescript-language-service.js"
import {
  SemanticCoordinator,
  type SemanticManagedContext,
  type SemanticMemoryLevel,
} from "../../semantic/coordinator/semantic-coordinator.js"
import { ReferenceSearchExecutor } from "../../semantic/references/reference-search-executor.js"
import type { ReferenceSearchRuntimeConfig } from "../../semantic/references/reference-runtime.js"
import { applyReferenceContextRetention, referenceCheckpoint } from "../../semantic/references/reference-context-retention.js"
import { verifyReferenceBatchInWorker } from "../../semantic/references/reference-batch-worker.js"
import { ReferenceAnchorMemo, resolveIsolatedReferenceAnchor } from "../../semantic/references/reference-anchor.js"
import { isConstructorModuleCurrent } from "../../semantic/references/reference-constructor-scope.js"

export type {
  SemanticTypeStatus,
  SemanticTypeEngineState,
  SemanticCodeFixCandidate,
  SemanticResolvedCodeFix,
  SemanticGlobalQueryFailureReason,
  SemanticReferenceQueryResult,
  SemanticPrepareRenameQueryResult,
  SemanticRenameQueryResult,
  SemanticSignatureHelpTriggerReason,
  SemanticCompletionTraceContext,
  SemanticTypeQueryContext,
} from "./type-engine-contract.js"
import type {
  SemanticTypeEngineState,
  SemanticReferenceQueryResult,
  SemanticTypeQueryContext,
} from "./type-engine-contract.js"

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
  anchorMemo: ReferenceAnchorMemo
}

export class SemanticTypeEngineRegistry {
  private readonly coordinator: SemanticCoordinator<WorkspaceEngineEntry>
  private readonly referenceSearch: ReferenceSearchExecutor | undefined
  private accessClock = 0
  private sdkConfiguration: unknown
  private projectConfiguration: unknown
  private memoryLevel: SemanticMemoryLevel = "level0"

  private get workspaces(): { get(rootPath: string): WorkspaceEngineEntry | undefined } {
    return { get: rootPath => this.coordinator.peek(rootPath) }
  }

  async referenceAnchor(
    workspace: SemanticWorkspaceView,
    position: SemanticDocumentPosition,
  ): Promise<readonly SemanticDefinitionCandidate[]> {
    const resident = this.withResidentReferenceContext(workspace, engine => (
      engine.residentDefinition(workspace, position)
    ))
    if (resident?.length === 1) {
      this.referenceTrace("references.anchor.complete", {
        verifierIsolation: "resident-program", definitions: 1,
        anchorWorkerStarts: 0, anchorProgramBuilds: 0,
      })
      return resident
    }
    const isolatedWorkspace = this.withProjectFileIdentities(workspace)
    if (!isolatedWorkspace) return []
    if (this.canReuseAnchor()) {
      const memo = this.coordinator.peek(path.resolve(workspace.rootPath))?.anchorMemo
      const definitions = memo?.lookup(workspace, position, this.options.onReferenceTrace)
      if (definitions) return definitions
    }
    return resolveIsolatedReferenceAnchor(isolatedWorkspace, position, {
      projectConfiguration: this.projectConfiguration,
      sdkConfiguration: this.sdkConfiguration,
      sdkAmbientProfile: this.options.references?.sdkAmbientProfile,
      trace: this.options.references?.trace,
      isCancellationRequested: this.options.hostCancellationToken
        ? () => this.options.hostCancellationToken?.isCancellationRequested() === true
        : undefined,
    }, this.options.onReferenceTrace)
  }
  constructor(
    private readonly packageResolver = new LocalPackageResolver(),
    private readonly onSdkSelected?: TypeScriptLanguageServiceEngineOptions["onSdkSelected"],
    private readonly projectFileAccess?: ProjectFileAccessPort,
    private readonly options: {
      maxResidentContexts?: number
      hostCancellationToken?: TypeScriptLanguageServiceEngineOptions["hostCancellationToken"]
      references?: ReferenceSearchRuntimeConfig
      interactiveSdkAmbientProfile?: TypeScriptSdkAmbientProfile
      onReferenceTrace?: (
        event: string,
        fields: Readonly<Record<string, string | number | boolean | null | undefined>>,
      ) => void
    } = {},
  ) {
    if (options.references?.residentFastPath) this.packageResolver.enableConfigurationWitness()
    this.coordinator = new SemanticCoordinator({
      maxResidentContexts: options.maxResidentContexts ?? 2,
      createContext: rootPath => this.createContext(rootPath),
      onLifecycle: options.references?.trace ? (event, fields) => this.referenceTrace(
        `semantic.context.${event}`, { ...fields, monotonicNs: process.hrtime.bigint().toString() },
      ) : undefined,
    })
    if (options.references?.strategy === "batched"
      || options.references?.strategy === "indexed-batched") {
      this.referenceSearch = new ReferenceSearchExecutor({
        batchRootLimit: options.references.batchRootLimit,
        dependencyProfile: options.references.dependencyProfile,
        verifyBatch: (workspace, position, includeDeclaration, dependencyProfile) => (
          verifyReferenceBatchInWorker(workspace, position, includeDeclaration, {
            projectConfiguration: this.projectConfiguration,
            sdkConfiguration: this.sdkConfiguration,
            sdkAmbientProfile: options.references?.sdkAmbientProfile,
            trace: options.references?.trace,
            tolerateUnadmittedProjectDependencies: dependencyProfile === "identity",
            constructorScope: options.references?.constructorScope,
            isCancellationRequested: options.hostCancellationToken
              ? () => options.hostCancellationToken?.isCancellationRequested() === true
              : undefined,
          })
        ),
        disposeResidentContext: rootPath => applyReferenceContextRetention(
          options.references!.contextRetentionProfile,
          this.coordinator,
          rootPath,
          options.onReferenceTrace,
        ),
        validateConstructorExclusion: (workspace, exclusion) => isConstructorModuleCurrent(
          workspace, exclusion, this.projectFileAccess,
        ),
        checkpoint: referenceCheckpoint(options.hostCancellationToken),
        trace: options.references.trace ? options.onReferenceTrace : undefined,
      })
    }
  }

  configureSdk(selection: unknown): void {
    this.sdkConfiguration = selection
    this.coordinator.dispose("sdk-configuration")
  }

  configureProject(selection: unknown): void {
    this.projectConfiguration = selection
    this.coordinator.forEachContext(context => {
      context.anchorMemo.clear()
      context.engine.invalidateResidentReferences()
    })
  }

  private canReuseAnchor(): boolean {
    return this.options.references?.anchorReuse === true
      && (this.options.interactiveSdkAmbientProfile ?? "full") === this.options.references.sdkAmbientProfile
  }

  prepare(workspace: SemanticWorkspaceView): SemanticTypeQueryContext {
    const rootPath = path.resolve(workspace.rootPath)
    const ownerId = workspace.canonicalRootId ?? rootPath
    const resetEpoch = workspace.typeEngineResetEpoch ?? 0
    const contentRevision = workspace.contentRevision ?? 0
    const previous = this.coordinator.peek(rootPath)
    const resetReason = typeContextResetReason(workspace, previous, this.options.references?.sessionReuse === "experimental")
    if (resetReason) {
      this.coordinator.remove(rootPath, resetReason)
    }
    const lease = this.coordinator.acquire(rootPath)
    const entry = lease.context
    const newEntry = previous !== entry
    const prepareStartedAt = this.options.references?.trace ? performance.now() : undefined
    let state: SemanticTypeEngineState
    try {
      state = entry.engine.prepare(workspace)
      if (prepareStartedAt !== undefined) this.referenceTrace("semantic.prepare.complete", {
        durationMs: performance.now() - prepareStartedAt, newEntry, resetReason: resetReason ?? null,
      })
    } catch (error) {
      lease.release()
      if (newEntry) this.coordinator.remove(rootPath, "prepare-failed")
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
      complete: (position, traceContext) => withLease((current) => {
        const arkui = sourceContent && scope.status !== "unavailable"
          ? current.arkui.complete(position, sourceContent)
          : { items: [], isIncomplete: scope.status === "unavailable" }
        const typescript = current.engine.complete(position)
        const completion = arbitrateCompletionLists(arkui, typescript)
        if (this.options.references?.trace) {
          const memory = process.memoryUsage()
          this.options.onReferenceTrace?.("completion.program.complete", {
            ...traceContext,
            ...current.engine.programFileStats(),
            completions: completion.items.length,
            incomplete: completion.isIncomplete,
            preResolvedCompletions: completion.items.filter((item) => item.preResolved).length,
            rss: memory.rss,
            heapUsed: memory.heapUsed,
          })
        }
        return completion
      }),
      trimCompletion: (traceContext) => withLease((current) => {
        current.engine.trim()
        if (this.options.references?.trace) {
          const memory = process.memoryUsage()
          this.options.onReferenceTrace?.("completion.batch.trim", {
            ...traceContext,
            rss: memory.rss,
            heapUsed: memory.heapUsed,
          })
        }
      }),
      resolveCompletion: (position, item) => item.data?.provider === "arkui-resource"
        ? item
        : withLease((current) => {
            const completion = current.engine.resolveCompletion(position, item)
            if (this.options.references?.trace) {
              const memory = process.memoryUsage()
              this.options.onReferenceTrace?.("completion.resolve.program.complete", {
                ...current.engine.programFileStats(),
                rss: memory.rss,
                heapUsed: memory.heapUsed,
              })
            }
            return completion
      }),
      define: (position) => withLease(current => {
        const definitionStartedAt = this.options.references?.trace ? performance.now() : undefined
        const definitions = current.engine.define(position)
        if (definitionStartedAt !== undefined) this.referenceTrace("semantic.definition.complete", {
          durationMs: performance.now() - definitionStartedAt, ...current.engine.programFileStats(),
        })
        if (this.canReuseAnchor()) current.anchorMemo.capture(workspace, position, definitions)
        return mergeDefinitions(sourceContent && scope.status !== "unavailable"
          ? current.arkui.define(position, sourceContent) : [], definitions)
      }),
      typeDefinitions: (position) => withLease(current => current.engine.typeDefinitions(position)),
      implementations: (position) => withLease(current => current.engine.implementations(position)),
      references: (position, includeDeclaration) => (
        withLease(current => current.engine.references(position, includeDeclaration))
      ),
      prepareRename: (position) => withLease(current => current.engine.prepareRename(position)),
      usages: (position) => withLease(current => current.engine.usages(position)),
      diagnostics: (position) => withLease((current) => {
        const diagnostics = mergeDiagnostics(
          current.engine.diagnostics(position),
          scope.status === "unavailable"
            ? [{
                source: "language", severity: "error", code: "arkts.project.configuration",
                path: position.path,
                range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 },
                message: `Project configuration is unavailable: ${scope.reason ?? "unknown"}. Check build-profile.json5 and the product/target selection.`,
              }]
            : sourceContent ? current.arkui.diagnostics(position, sourceContent) : [],
        )
        if (this.options.references?.trace) {
          const memory = process.memoryUsage()
          this.options.onReferenceTrace?.("diagnostics.program.complete", {
            ...current.engine.programFileStats(),
            diagnostics: diagnostics.length,
            rss: memory.rss,
            heapUsed: memory.heapUsed,
          })
        }
        return diagnostics
      }),
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
    candidateIdentityComplete = false,
    candidateAnchorPath?: string,
    candidateSupportPaths?: readonly string[],
    forceLegacy = false,
  ): Promise<SemanticReferenceQueryResult> {
    if (this.referenceSearch && !forceLegacy) {
      const started = performance.now()
      const resident = this.withResidentReferenceContext(workspace, engine => (
        engine.residentReferences(workspace, position, includeDeclaration)
      ))
      if (resident?.status === "complete") {
        this.referenceTrace("references.resident.hit", {
          durationMs: performance.now() - started, locations: resident.references.length,
          sameProgram: true, completeScope: true, verifierWorkerStarts: 0, programBuilds: 0,
        })
        return Promise.resolve(resident)
      }
      if (this.options.references?.residentFastPath) {
        this.referenceTrace("references.resident.miss", { memoryLevel: this.memoryLevel })
      }
    }
    if (this.referenceSearch && !forceLegacy) {
      const isolatedWorkspace = this.withProjectFileIdentities(workspace)
      if (!isolatedWorkspace) {
        return Promise.resolve({ status: "incomplete", reason: "source-unavailable" })
      }
      return this.referenceSearch.execute(
        isolatedWorkspace,
        position,
        includeDeclaration,
        candidatePaths,
        candidateIdentityComplete,
        candidateAnchorPath,
        candidateSupportPaths,
        candidatePaths || this.options.references?.conservativeSemanticUnits
          ? this.packageResolver.projectFor(workspace.rootPath).semanticGraph()
          : undefined,
      )
    }
    const rootPath = path.resolve(workspace.rootPath)
    const hadGlobalScope = this.coordinator.peek(rootPath)
      ?.engine.cacheState().projectMembership.status === "complete"
    try {
      return Promise.resolve(this.prepare(workspace).references(position, includeDeclaration))
    } finally {
      if (this.options.references?.sessionReuse === "experimental"
        && workspace.projectMembership?.status === "complete" && !hadGlobalScope) {
        this.coordinator.remove(rootPath, "reference-global-scope")
      }
    }
  }

  workspaceCount(): number {
    return this.coordinator.stats().residentContextCount
  }

  runtimeStats() {
    return this.coordinator.stats()
  }

  applyMemoryPressure(level: SemanticMemoryLevel): void {
    this.memoryLevel = level
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
      anchorMemo: new ReferenceAnchorMemo(),
      trim() {
        this.engine.trim()
        this.anchorMemo.clear()
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
      checkpoint: this.options.references?.residentFastPath
        ? referenceCheckpoint(this.options.hostCancellationToken) : undefined,
      sdkAmbientProfile: this.options.interactiveSdkAmbientProfile,
      residentReferenceReuse: this.options.references?.residentFastPath === true,
    })
  }

  private withProjectFileIdentities(
    workspace: SemanticWorkspaceView,
  ): SemanticWorkspaceView | undefined {
    return withProjectFileIdentities(workspace, this.projectFileAccess)
  }

  private withResidentReferenceContext<Result>(
    workspace: SemanticWorkspaceView,
    query: (engine: TypeScriptLanguageServiceEngine) => Result | undefined,
  ): Result | undefined {
    if (!this.options.references?.residentFastPath
      || this.memoryLevel === "level2" || this.memoryLevel === "level3"
      || (this.options.interactiveSdkAmbientProfile ?? "full") !== this.options.references.sdkAmbientProfile
      || workspace.resetTypeEngine) return undefined
    const rootPath = path.resolve(workspace.rootPath)
    const entry = this.coordinator.peek(rootPath)
    if (!entry || entry.ownerId !== (workspace.canonicalRootId ?? rootPath)
      || entry.resetEpoch !== workspace.typeEngineResetEpoch
      || entry.appliedContentRevision !== workspace.contentRevision) return undefined
    const checkpoint = referenceCheckpoint(this.options.hostCancellationToken)
    checkpoint?.()
    const lease = this.coordinator.acquire(rootPath)
    try {
      const result = query(lease.context.engine)
      checkpoint?.()
      if (result !== undefined) entry.lastAccess = ++this.accessClock
      return result
    } finally {
      lease.release()
    }
  }

  private referenceTrace(event: string,
    fields: Readonly<Record<string, string | number | boolean | null | undefined>>): void {
    if (!this.options.references?.trace) return
    const memory = process.memoryUsage()
    this.options.onReferenceTrace?.(event, { ...fields, rss: memory.rss, heapUsed: memory.heapUsed })
  }
}
