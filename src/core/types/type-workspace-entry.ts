import { ArkUIResourceLanguageProvider } from "../arkui/resource-language-provider.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import type { HarmonyProjectModel } from "../../project/harmony-project-model.js"
import type { SemanticManagedContext } from "../../semantic/coordinator/semantic-coordinator.js"
import { ReferenceAnchorMemo } from "../../semantic/references/reference-anchor.js"
import type { TypeScriptLanguageServiceEngine } from "./typescript-language-service.js"
import { pathToFileURL } from "node:url"
import type { ReadinessTrace } from "./typescript-semantic-readiness.js"
import type { SemanticReadinessReport } from "../../contracts/semantic-readiness.js"
import { semanticUnprepared } from "../../contracts/semantic-readiness.js"
import path from "node:path"
import type { SemanticCoordinator, SemanticMemoryLevel } from "../../semantic/coordinator/semantic-coordinator.js"
import { runWithSemanticLease } from "./semantic-query-lease.js"
import { assertCurrentWorkspaceSources } from "./typescript-workspace-source-fence.js"
import { SemanticInputUnavailableError } from "./typescript-query-inputs.js"

export interface WorkspaceEngineEntry extends SemanticManagedContext {
  engine: TypeScriptLanguageServiceEngine
  arkui: ArkUIResourceLanguageProvider
  project: HarmonyProjectModel
  resourceScope: string
  ownerId: string
  resetEpoch: number
  appliedContentRevision: number
  readonly resolutionGeneration: number
  lastAccess: number
  projectFiles: number
  openDocuments: number
  anchorMemo: ReferenceAnchorMemo
}

/** Existing-owner query intent is not a READY certificate or permission to ignore pressure. */
export function queryWorkspaceReadiness(coordinator: SemanticCoordinator<WorkspaceEngineEntry>,
  workspace: SemanticWorkspaceView, mode: boolean | "query", hooks: {
    readonly refreshPressure?: () => void
    readonly pressure: () => SemanticMemoryLevel
    readonly prepare: () => void
    readonly trace?: ReadinessTrace
  }): SemanticReadinessReport {
  const rootPath = path.resolve(workspace.rootPath)
  const rootUri = pathToFileURL(rootPath).href
  const allowed = () => !["level2", "level3"].includes(hooks.pressure())
  const unavailable = () => semanticUnprepared(rootUri, "resource-budget-exceeded")
  hooks.refreshPressure?.()
  if (!allowed()) return unavailable()
  const query = (prepared: boolean | "query-prepare") => {
    const entry = coordinator.peek(rootPath)
    if (!entry) return semanticUnprepared(rootUri)
    let result: SemanticReadinessReport
    try {
      result = runWithSemanticLease(coordinator, rootPath,
        current => current.engine.withRequestModuleResolution(() =>
          current.engine.semanticReadiness(workspace, prepared, hooks.trace)), false)
    } catch (error) {
      if (!(error instanceof SemanticInputUnavailableError)) throw error
      entry.engine.invalidateResidentReferences()
      return semanticUnprepared(rootUri, "inputs-changed-during-preparation")
    }
    hooks.refreshPressure?.()
    return coordinator.peek(rootPath) === entry && allowed() ? result : unavailable()
  }
  if (mode === "query") {
    if (!coordinator.peek(rootPath)?.engine.hasReadinessRefreshIntent()) return semanticUnprepared(rootUri)
    const current = query(false)
    if (current.semanticState === "ready" || !allowed()) return current
  }
  if (mode !== false) hooks.prepare()
  return query(mode === "query" ? "query-prepare" : mode)
}

/** Certification remains inside the caller's query lease and response interval. */
export function runPreparedSemanticQuery<Result>(entry: WorkspaceEngineEntry,
  workspace: SemanticWorkspaceView, run: (entry: WorkspaceEngineEntry) => Result,
  certifyReadiness: boolean, trace?: ReadinessTrace, checkpoint: () => void = () => {}, access?: ProjectFileAccessPort): Result {
  return entry.engine.withRequestModuleResolution(() => {
    const result = run(entry)
    if (certifyReadiness) certifyPreparedQuery(entry, workspace, trace)
    assertCurrentWorkspaceSources(workspace, checkpoint, access)
    entry.engine.assertCurrentInputs(checkpoint)
    return result
  })
}

/** Includes readiness input construction, afterQuery and final current-proof admission. */
function certifyPreparedQuery(entry: WorkspaceEngineEntry, workspace: SemanticWorkspaceView, trace?: ReadinessTrace): void {
  if (process.env.ARKTS_SEMANTIC_QUEUE_TRACE !== "1" || !trace) {
    assertCertifiedInputs(entry.engine.semanticReadiness(workspace, "query", trace))
    return
  }
  const startedMonotonicMs = performance.now()
  let outcome = "error"
  let queryScopeReport: SemanticReadinessReport | undefined
  const record: ReadinessTrace = (event, fields) => {
    try { trace(event, fields) } catch { /* Unavailable observation cannot alter the real query. */ }
  }
  try {
    queryScopeReport = entry.engine.semanticReadiness(workspace, "query", record)
    assertCertifiedInputs(queryScopeReport)
    outcome = "complete"
  } finally {
    const finishedMonotonicMs = performance.now()
    record("semantic.readiness.query.certification.complete", {
      rootUri: pathToFileURL(workspace.rootPath).href, uri: pathToFileURL(workspace.state.path).href,
      documentVersion: workspace.state.documentVersion, contentRevision: workspace.contentRevision,
      typeGeneration: workspace.state.typeGeneration, outcome, queryScopeSemanticState: queryScopeReport?.semanticState,
      queryScopeMembershipRevision: queryScopeReport?.inputIdentity?.membershipRevision,
      queryScopeProjectSources: queryScopeReport?.coverage?.projectSources,
      startedMonotonicMs, finishedMonotonicMs,
      certificationDurationMs: finishedMonotonicMs - startedMonotonicMs,
    })
  }
}

function assertCertifiedInputs(report: SemanticReadinessReport): void {
  if (report.unavailableReasons.some(reason => reason === "current-program-inputs-unproven"
    || reason === "inputs-changed-during-preparation")) throw new SemanticInputUnavailableError()
}

/** Updates provider ownership and resource scope after the existing engine prepare. */
export function updateWorkspaceEngineEntry(entry: WorkspaceEngineEntry,
  workspace: SemanticWorkspaceView, lastAccess: number) {
  const rootPath = workspace.rootPath
  entry.ownerId = workspace.canonicalRootId ?? rootPath
  entry.resetEpoch = workspace.typeEngineResetEpoch ?? 0
  entry.appliedContentRevision = workspace.contentRevision ?? 0
  entry.lastAccess = lastAccess
  entry.projectFiles = workspace.projectMembership?.paths.length ?? workspace.documents.length
  entry.openDocuments = workspace.documents.filter(document => document.overlay).length
  const scope = entry.project.scopeFor(workspace.state.path)
  const resourceScope = JSON.stringify([scope.moduleRoot ?? rootPath, scope.resourceRoots])
  if (resourceScope !== entry.resourceScope) {
    entry.arkui.dispose()
    entry.arkui = new ArkUIResourceLanguageProvider(scope.moduleRoot ?? rootPath, {
      ...(scope.status === "unconfigured" ? {} : { resourceRoots: scope.resourceRoots }),
    })
    entry.resourceScope = resourceScope
  }
  return scope
}

/** Creates one coordinator-owned entry with the existing provider lifecycle. */
export function createWorkspaceEngineEntry(rootPath: string, engine: TypeScriptLanguageServiceEngine,
  packageResolver: Pick<LocalPackageResolver, "projectFor" | "generation">): WorkspaceEngineEntry {
  return {
    engine,
    arkui: new ArkUIResourceLanguageProvider(rootPath),
    project: packageResolver.projectFor(rootPath),
    resourceScope: "",
    ownerId: rootPath,
    resetEpoch: -1,
    appliedContentRevision: -1,
    resolutionGeneration: packageResolver.generation,
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
