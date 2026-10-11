import { ArkUIResourceLanguageProvider } from "../arkui/resource-language-provider.js"
import type { LocalPackageResolver } from "../sdk/local-package-resolver.js"
import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import type { HarmonyProjectModel } from "../../project/harmony-project-model.js"
import type { SemanticManagedContext } from "../../semantic/coordinator/semantic-coordinator.js"
import { ReferenceAnchorMemo } from "../../semantic/references/reference-anchor.js"
import type { TypeScriptLanguageServiceEngine } from "./typescript-language-service.js"

export interface WorkspaceEngineEntry extends SemanticManagedContext {
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

/** Certification remains inside the caller's query lease and response interval. */
export function runPreparedSemanticQuery<Result>(entry: WorkspaceEngineEntry,
  workspace: SemanticWorkspaceView, run: (entry: WorkspaceEngineEntry) => Result, certifyReadiness: boolean): Result {
  const result = run(entry)
  if (certifyReadiness) entry.engine.semanticReadiness(workspace, "query")
  return result
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
  packageResolver: Pick<LocalPackageResolver, "projectFor">): WorkspaceEngineEntry {
  return {
    engine,
    arkui: new ArkUIResourceLanguageProvider(rootPath),
    project: packageResolver.projectFor(rootPath),
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
