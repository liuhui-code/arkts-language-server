import path from "node:path"
import { semanticUnprepared } from "../../contracts/semantic-readiness.js"
import { pathToFileURL } from "node:url"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../protocol.js"
import { ArkUIResourceLanguageProvider } from "../arkui/resource-language-provider.js"
import { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { arbitrateCompletionLists } from "./completion-arbitrator.js"
import { mergeDefinitions, mergeDiagnostics } from "./type-result-merge.js"
import { withProjectFileIdentities } from "./type-project-file-identities.js"
import { canonicalTypeEngineOwner, typeContextResetReason } from "./type-context-reset.js"
import { traceCompilerQuery, traceImplementationQuery, traceReferenceQuery, traceSemanticQuery } from "./compiler-query-timing.js"
import { runWithSemanticLease } from "./semantic-query-lease.js"
import { createWorkspaceEngineEntry, updateWorkspaceEngineEntry, runPreparedSemanticQuery, type WorkspaceEngineEntry } from "./type-workspace-entry.js"
import {
  TypeScriptLanguageServiceEngine,
  type TypeScriptLanguageServiceEngineOptions,
  type TypeScriptSdkAmbientProfile,
} from "./typescript-language-service.js"
import {
  SemanticCoordinator,
  type SemanticMemoryLevel,
} from "../../semantic/coordinator/semantic-coordinator.js"
import { ReferenceSearchExecutor } from "../../semantic/references/reference-search-executor.js"
import type { ReferenceSearchRuntimeConfig } from "../../semantic/references/reference-runtime.js"
import { applyReferenceContextRetention, referenceCheckpoint } from "../../semantic/references/reference-context-retention.js"
import { verifyReferenceBatchInWorker } from "../../semantic/references/reference-batch-worker.js"
import { resolveIsolatedReferenceAnchor } from "../../semantic/references/reference-anchor.js"
import { isConstructorModuleCurrent } from "../../semantic/references/reference-constructor-scope.js"
import type { TransientSemanticWorkerObserver } from "../../semantic/transient-worker-lifecycle.js"

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

export class SemanticTypeEngineRegistry {
  private readonly coordinator: SemanticCoordinator<WorkspaceEngineEntry>
  private readonly referenceSearch: ReferenceSearchExecutor | undefined
  private accessClock = 0
  private sdkConfiguration: unknown
  private projectConfiguration: unknown
  private memoryLevel: SemanticMemoryLevel = "level0"
  private referencePressureEpoch = 0

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
    if (this.options.references?.l01PressureAdmission) {
      referenceCheckpoint(this.options.hostCancellationToken)?.()
      this.options.refreshMemoryPressure?.()
      if (this.memoryLevel === "level3") {
        this.referenceTrace("references.pressure.anchor-skipped", {
          memoryLevel: this.memoryLevel, reason: "resource-budget-exceeded",
        })
        // No discovery anchor: retain the complete-scope verifier fallback.
        return []
      }
    }
    return resolveIsolatedReferenceAnchor(isolatedWorkspace, position, {
      projectConfiguration: this.projectConfiguration,
      sdkConfiguration: this.sdkConfiguration,
      sdkAmbientProfile: this.options.references?.sdkAmbientProfile,
      trace: this.options.references?.trace,
      onTransientWorker: this.options.onTransientWorker,
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
      refreshMemoryPressure?: () => void
      readMemoryPressure?: () => SemanticMemoryLevel
      onTransientWorker?: TransientSemanticWorkerObserver
      interactiveSdkAmbientProfile?: TypeScriptSdkAmbientProfile
      onReferenceTrace?: (
        event: string,
        fields: Readonly<Record<string, string | number | boolean | null | undefined>>,
      ) => void
    } = {},
  ) {
    this.packageResolver.enableConfigurationWitness()
    this.coordinator = new SemanticCoordinator({
      maxResidentContexts: options.maxResidentContexts ?? 2,
      costAwareEviction: options.references?.l03CostAwareEviction,
      readMemoryPressure: options.readMemoryPressure,
      createContext: rootPath => this.createContext(rootPath),
      onLifecycle: options.references?.trace ? (event, fields) => this.referenceTrace(
        `semantic.context.${event}`, { ...fields, monotonicNs: process.hrtime.bigint().toString() },
      ) : undefined,
    })
    if (options.references && (options.references.strategy !== "legacy" || options.references.l01PressureAdmission)) {
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
            onTransientWorker: options.onTransientWorker,
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
    const previous = this.coordinator.peek(rootPath)
    const resetReason = typeContextResetReason(workspace, previous, this.options.references?.sessionReuse === "experimental")
    if (resetReason) {
      if (resetReason === "canonical-owner-change") this.packageResolver.projectFor(rootPath).invalidate()
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
    const activeEntry = entry
    const scope = updateWorkspaceEngineEntry(activeEntry, workspace, ++this.accessClock)
    const sourceContent = workspace.documents.find(document => document.path === workspace.state.path)?.content
    lease.release()
    const withLease = <Result>(run: (current: WorkspaceEngineEntry) => Result, semanticWork = true, certifyReadiness = semanticWork): Result => (
      runWithSemanticLease(this.coordinator, rootPath, current => runPreparedSemanticQuery(current, workspace, run, certifyReadiness), semanticWork && this.options.references?.l01RearmTrim === true,
        semanticWork && this.options.references?.l03CostAwareEviction === true)
    )
    const traced = <Result extends { readonly status: string }>(current: WorkspaceEngineEntry, kind: string, query: () => Result): Result =>
      traceSemanticQuery(kind, query, () => current.engine.programFileStats(), this.options.references?.trace ? this.options.onReferenceTrace : undefined)
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
      }, false),
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
        const { result: definitions, timing } = traceCompilerQuery(
          () => current.engine.define(position), this.options.references?.trace === true)
        if (timing) this.referenceTrace("semantic.definition.complete", {
          ...timing, ...current.engine.programFileStats(),
        })
        if (this.canReuseAnchor()) current.anchorMemo.capture(workspace, position, definitions)
        return mergeDefinitions(sourceContent && scope.status !== "unavailable"
          ? current.arkui.define(position, sourceContent) : [], definitions)
      }),
      typeDefinitions: (position) => withLease(current => current.engine.typeDefinitions(position)),
      implementations: (position) => withLease(current => traceImplementationQuery(
        () => current.engine.implementations(position), () => current.engine.programFileStats(),
        this.options.references?.trace ? this.options.onReferenceTrace : undefined)),
      references: (position, includeDeclaration) => withLease(current => traceReferenceQuery(
        () => current.engine.references(position, includeDeclaration), () => current.engine.programFileStats(),
        this.options.references?.trace ? this.options.onReferenceTrace : undefined)),
      prepareRename: (position) => withLease(current => traced(current, "prepareRename", () => current.engine.prepareRename(position))),
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
            ...current.engine.programFileStats(), diagnostics: diagnostics.length,
            documentVersion: position.documentVersion, memoryLevel: this.memoryLevel,
            rss: memory.rss,
            heapUsed: memory.heapUsed,
          })
        }
        return diagnostics
      }, true, false),
      codeActions: (position, range) => withLease(current => current.engine.codeActions(position, range)),
      resolveCodeAction: (position, range, fingerprint) => (
        withLease(current => current.engine.resolveCodeAction(position, range, fingerprint))
      ),
      documentHighlights: (position) => withLease(current => current.engine.documentHighlights(position)),
      inlayHints: (position, range) => withLease(current => current.engine.inlayHints(position, range)),
      prepareCallHierarchy: (position) => withLease(current => traced(current, "prepareCallHierarchy", () => current.engine.prepareCallHierarchy(position))),
      outgoingCalls: (position, item) => withLease(current => traced(current, "outgoingCalls", () => current.engine.outgoingCalls(position, item))),
      incomingCalls: (position, item) => withLease(current => traced(current, "incomingCalls", () => current.engine.incomingCalls(position, item))),
      documentSymbols: (position) => withLease(current => current.engine.documentSymbols(position)),
      hover: (position) => withLease(current => current.engine.hover(position)),
      rename: (position, newName) => withLease(current => traced(current, "rename", () => current.engine.rename(position, newName))),
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
    if (this.options.references?.l01PressureAdmission) {
      referenceCheckpoint(this.options.hostCancellationToken)?.()
      this.options.refreshMemoryPressure?.()
    }
    const indexedRoute = this.options.references?.strategy !== "legacy" && !forceLegacy
    const pressureAdmission = this.memoryLevel === "level3" && this.options.references?.l01PressureAdmission === true
    const pressureFallback = !indexedRoute && pressureAdmission
    if (this.referenceSearch && indexedRoute) {
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
    if (this.referenceSearch && (indexedRoute || pressureFallback)) {
      const isolatedWorkspace = this.withProjectFileIdentities(workspace)
      if (!isolatedWorkspace) return Promise.resolve({ status: "incomplete", reason: "source-unavailable" })
      const pressureEpoch = this.referencePressureEpoch
      let verifierStarted = false
      const admitVerifier = this.options.references?.l01PressureAdmission ? () => {
        this.options.refreshMemoryPressure?.()
        if (verifierStarted && (this.memoryLevel === "level3" || this.referencePressureEpoch !== pressureEpoch)) return false
        verifierStarted = true
        return true
      } : undefined
      const selectedPaths = pressureFallback ? undefined : candidatePaths
      if (pressureFallback) this.referenceTrace("references.pressure.fallback", { memoryLevel: this.memoryLevel })
      return this.referenceSearch.execute(
        isolatedWorkspace,
        pressureFallback ? { ...position, expectedReferenceAnchor: undefined } : position,
        includeDeclaration,
        selectedPaths,
        pressureFallback ? false : candidateIdentityComplete,
        pressureFallback ? undefined : candidateAnchorPath,
        pressureFallback ? undefined : candidateSupportPaths,
        !pressureFallback && (selectedPaths || this.options.references?.conservativeSemanticUnits)
          ? this.packageResolver.projectFor(workspace.rootPath).semanticGraph()
          : undefined,
        true, pressureAdmission ? 1 : undefined, admitVerifier,
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

  semanticReadiness(workspace: SemanticWorkspaceView, prepare: boolean) {
    const rootPath = path.resolve(workspace.rootPath)
    this.options.refreshMemoryPressure?.()
    const unavailable = () => semanticUnprepared(pathToFileURL(rootPath).href, "resource-budget-exceeded")
    if (this.memoryLevel === "level2" || this.memoryLevel === "level3") return unavailable()
    if (prepare) this.prepare(workspace)
    const entry = this.coordinator.peek(rootPath)
    if (!entry) return semanticUnprepared(pathToFileURL(rootPath).href)
    const result = runWithSemanticLease(this.coordinator, rootPath,
      current => current.engine.semanticReadiness(workspace, prepare, this.options.references?.trace ? this.options.onReferenceTrace : undefined), false)
    this.options.refreshMemoryPressure?.()
    return this.coordinator.peek(rootPath) === entry && !["level2", "level3"].includes(this.memoryLevel)
      ? result : unavailable()
  }

  runtimeStats() {
    return this.coordinator.stats()
  }

  applyMemoryPressure(level: SemanticMemoryLevel): void {
    if (this.options.references?.l01PressureAdmission && level === "level3" && this.memoryLevel !== "level3") {
      this.referencePressureEpoch += 1
    }
    this.memoryLevel = this.coordinator.applyMemoryPressure(level)
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
    return createWorkspaceEngineEntry(rootPath, this.createTypeScriptEngine(rootPath), this.packageResolver)
  }

  private createTypeScriptEngine(rootPath: string): TypeScriptLanguageServiceEngine {
    return new TypeScriptLanguageServiceEngine(rootPath, {
      packageResolver: this.packageResolver,
      onSdkSelected: this.onSdkSelected,
      onScriptAdmission: this.options.references?.trace ? fields => this.referenceTrace("semantic.prepare.script-admission", fields) : undefined,
      onResidentReferenceProofFailure: this.options.references?.trace
        ? fields => this.referenceTrace("references.resident.proof.rejected", { ...fields }) : undefined,
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
