import path from "node:path"

import type { SemanticDefinitionCandidate, SemanticDocumentPosition } from "../protocol.js"
import { SemanticGroups } from "./semantic-groups.js"
import { createTypeScriptEngine } from "./type-engine-factory.js"
import { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { arbitrateCompletionLists } from "./completion-arbitrator.js"
import { mergeDefinitions, mergeDiagnostics } from "./type-result-merge.js"
import { withProjectFileIdentities } from "./type-project-file-identities.js"
import { retainedReferenceOwnerAllowed, withResidentReferenceContext } from "./resident-context-lease.js"
import { queryResidentReferences } from "./resident-reference-query.js"
import { canonicalTypeEngineOwner, typeContextResetReason } from "./type-context-reset.js"
import { traceCompilerQuery, traceImplementationQuery, traceReferenceQuery, traceSemanticQuery } from "./compiler-query-timing.js"
import { runWithSemanticLease } from "./semantic-query-lease.js"
import { createWorkspaceEngineEntry, updateWorkspaceEngineEntry, runPreparedSemanticQuery, queryWorkspaceReadiness, type WorkspaceEngineEntry } from "./type-workspace-entry.js"
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
import { ReferenceVerifierClient } from "../../semantic/references/reference-verifier-client.js"
import { verifyReferenceBatchInWorker, type ReferenceBatchWorkerOptions } from "../../semantic/references/reference-batch-worker.js"
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
  private readonly referenceVerifier = new ReferenceVerifierClient()
  private readonly groups: SemanticGroups
  private accessClock = 0
  private sdkConfiguration: unknown
  private projectConfiguration: unknown
  private memoryLevel: SemanticMemoryLevel = "level0"
  private referencePressureEpoch = 0

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
    if (!this.coordinator.peek(path.resolve(workspace.rootPath)) && retainedReferenceOwnerAllowed(this.options, this.memoryLevel)) {
      return this.prepare(workspace).define(position)
    }
    const isolatedWorkspace = withProjectFileIdentities(workspace, this.projectFileAccess)
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
    return resolveIsolatedReferenceAnchor(isolatedWorkspace, position,
      this.referenceWorkerOptions(), this.options.onReferenceTrace)
  }
  private referenceWorkerOptions(): ReferenceBatchWorkerOptions {
    return {
      client: this.referenceVerifier,
      projectConfiguration: this.projectConfiguration, sdkConfiguration: this.sdkConfiguration,
      sdkAmbientProfile: this.options.references?.sdkAmbientProfile,
      trace: this.options.references?.trace, onTransientWorker: this.options.onTransientWorker,
      isCancellationRequested: this.options.hostCancellationToken
        ? () => this.options.hostCancellationToken?.isCancellationRequested() === true : undefined,
    }
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
    this.groups = new SemanticGroups(this.packageResolver)
    this.packageResolver.enableConfigurationWitness()
    this.coordinator = new SemanticCoordinator({
      maxResidentContexts: options.maxResidentContexts ?? 2,
      costAwareEviction: false,
      isScanContext: id => this.groups.isScan(id),
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
            ...this.referenceWorkerOptions(),
            tolerateUnadmittedProjectDependencies: dependencyProfile === "identity",
            constructorScope: options.references?.constructorScope,
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
    this.referenceVerifier.dispose()
    this.groups.clear()
    this.sdkConfiguration = selection
    this.coordinator.dispose("sdk-configuration")
  }

  configureProject(selection: unknown): void {
    this.referenceVerifier.dispose()
    this.groups.clear()
    this.coordinator.dispose("project-configuration")
    this.projectConfiguration = selection
  }
  private canReuseAnchor(): boolean {
    return this.options.references?.anchorReuse === true
      && (this.options.interactiveSdkAmbientProfile ?? "full") === this.options.references.sdkAmbientProfile
  }

  prepareInteractive(workspace: SemanticWorkspaceView,
    membership: () => NonNullable<SemanticWorkspaceView["projectMembership"]>, interactive = true): SemanticTypeQueryContext {
    const group = this.groups.available(workspace) ? this.groups.select(workspace, membership()) : undefined
    return group && (interactive || this.coordinator.peek(group.id))
      ? this.prepare(group.workspace, group.id, interactive) : this.prepare(workspace, undefined, interactive)
  }

  prepareInitialGroups(workspace: SemanticWorkspaceView): void {
    this.groups.prepareInitial(workspace, this.options.maxResidentContexts ?? 2, group => {
      this.prepare(group.workspace, group.id)
      runWithSemanticLease(this.coordinator, group.id, entry => entry.engine.measureCompilerReadiness(), true)
    })
  }

  prepare(workspace: SemanticWorkspaceView, contextId = this.groups.root(workspace), promoteRecency = true): SemanticTypeQueryContext {
    const rootPath = contextId
    const previous = this.coordinator.peek(rootPath)
    const resetReason = typeContextResetReason(workspace, previous,
      contextId !== path.resolve(workspace.rootPath) || this.options.references?.sessionReuse === "experimental")
    const refreshReadiness = resetReason === "content-revision-change" && previous?.engine.hasReadinessRefreshIntent() === true
    if (resetReason) {
      if (resetReason === "canonical-owner-change") this.packageResolver.projectFor(workspace.rootPath).invalidate()
      this.coordinator.remove(rootPath, resetReason)
    }
    const lease = this.coordinator.acquire(rootPath, promoteRecency)
    const entry = lease.context
    const newEntry = previous !== entry
    const prepareStartedAt = this.options.references?.trace ? performance.now() : undefined
    let state: SemanticTypeEngineState
    try {
      state = entry.engine.prepare(workspace)
      if (newEntry && refreshReadiness) entry.engine.restoreReadinessRefreshIntent()
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
      runWithSemanticLease(this.coordinator, rootPath, current => runPreparedSemanticQuery(current, workspace, run, certifyReadiness,
        this.options.onReferenceTrace, referenceCheckpoint(this.options.hostCancellationToken)), semanticWork && this.options.references?.l01RearmTrim === true,
        semanticWork && this.options.references?.l03CostAwareEviction === true, promoteRecency)
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
        () => {
          const result = current.engine.references(position, includeDeclaration)
          current.engine.assertCurrentInputs()
          return result
        }, () => current.engine.programFileStats(),
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

  residentReferences(workspace: SemanticWorkspaceView, position: SemanticDocumentPosition,
    includeDeclaration: boolean): SemanticReferenceQueryResult | undefined {
    if (!this.referenceSearch) return undefined
    if (this.options.references?.l01PressureAdmission) {
      referenceCheckpoint(this.options.hostCancellationToken)?.()
      this.options.refreshMemoryPressure?.()
    }
    return queryResidentReferences(() => this.withResidentReferenceContext(workspace,
      engine => engine.residentReferences(workspace, position, includeDeclaration)),
    this.options.references?.residentFastPath === true, this.memoryLevel,
    (event, fields) => this.referenceTrace(event, fields))
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
      const resident = this.residentReferences(workspace, position, includeDeclaration)
      if (resident) return Promise.resolve(resident)
    }
    if (this.referenceSearch && indexedRoute && !this.coordinator.peek(path.resolve(workspace.rootPath))
      && retainedReferenceOwnerAllowed(this.options, this.memoryLevel)) {
      const result = this.prepare(workspace).references({ ...position, expectedReferenceAnchor: undefined }, includeDeclaration)
      if (result.status === "complete") return Promise.resolve(result)
    }
    if (this.referenceSearch && (indexedRoute || pressureFallback)) {
      const isolatedWorkspace = withProjectFileIdentities(workspace, this.projectFileAccess)
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

  semanticReadiness(workspace: SemanticWorkspaceView, prepare: boolean | "query") {
    return queryWorkspaceReadiness(this.coordinator, workspace, prepare, {
      refreshPressure: this.options.refreshMemoryPressure, pressure: () => this.memoryLevel,
      prepare: () => { referenceCheckpoint(this.options.hostCancellationToken)?.(); this.prepare(workspace) },
      trace: this.options.references?.trace ? this.options.onReferenceTrace : undefined,
    })
  }

  needsReadinessRootRefresh(workspace: SemanticWorkspaceView): boolean {
    const entry = this.coordinator.peek(path.resolve(workspace.rootPath))
    return entry?.engine.hasReadinessRefreshIntent() === true && (entry.engine.cacheState().projectMembership.status !== "complete"
      || typeContextResetReason(workspace, entry, this.options.references?.sessionReuse === "experimental") === "content-revision-change")
  }

  runtimeStats() {
    return this.coordinator.stats()
  }

  applyMemoryPressure(level: SemanticMemoryLevel): void {
    if (this.options.references?.l01PressureAdmission && level === "level3" && this.memoryLevel !== "level3") {
      this.referencePressureEpoch += 1
    }
    if (level === "level3") this.referenceVerifier.releaseWhenIdle()
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
    this.referenceVerifier.dispose()
    this.coordinator.dispose()
  }
  private createContext(rootPath: string): WorkspaceEngineEntry {
    if (this.groups.owner(rootPath) === rootPath) {
      const project = this.packageResolver.projectFor(rootPath)
      const fresh = project.configurationFreshness(referenceCheckpoint(this.options.hostCancellationToken) ?? (() => {}))
      if (!fresh || !fresh()) project.invalidate()
    }
    rootPath = this.groups.owner(rootPath)
    return createWorkspaceEngineEntry(rootPath, createTypeScriptEngine(rootPath, this.packageResolver,
      this.onSdkSelected, this.projectFileAccess, this.sdkConfiguration, this.options,
      (event, fields) => this.referenceTrace(event, fields)), this.packageResolver)
  }
  private withResidentReferenceContext<Result>(workspace: SemanticWorkspaceView,
    query: (engine: TypeScriptLanguageServiceEngine) => Result | undefined): Result | undefined {
    return withResidentReferenceContext(workspace, this.coordinator,
      retainedReferenceOwnerAllowed(this.options, this.memoryLevel), referenceCheckpoint(this.options.hostCancellationToken),
      query, entry => { entry.lastAccess = ++this.accessClock })
  }
  private referenceTrace(event: string,
    fields: Readonly<Record<string, string | number | boolean | null | undefined>>): void {
    if (!this.options.references?.trace) return
    const memory = process.memoryUsage()
    this.options.onReferenceTrace?.(event, { ...fields, rss: memory.rss, heapUsed: memory.heapUsed })
  }
}
