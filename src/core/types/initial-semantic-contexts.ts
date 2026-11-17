import type { SemanticWorkspaceView } from "../workspace/document-store.js"
import type { SemanticCoordinator } from "../../semantic/coordinator/semantic-coordinator.js"
import { initialPreparationActive } from "../../semantic/coordinator/initial-preparation.js"
import type { SemanticGroups } from "./semantic-groups.js"
import type { WorkspaceEngineEntry } from "./type-workspace-entry.js"
import { runWithSemanticLease } from "./semantic-query-lease.js"

/** SDK syntax is shared; initialization project texts are never implicit query roots. */
export function prepareInitialSemanticContexts(workspace: SemanticWorkspaceView, groups: SemanticGroups,
  limit: number, coordinator: SemanticCoordinator<WorkspaceEngineEntry>,
  prepare: (workspace: SemanticWorkspaceView, id: string) => void): void {
  const initial = initialPreparationActive()
  if (!initial && groups.hasOperationScopes(workspace.canonicalRootId)) return
  const synchronize = (id: string) => runWithSemanticLease(coordinator, id, entry =>
      entry.engine.withRequestModuleResolution(() => entry.engine.measureCompilerReadiness()), true)
  // SDK/standard-library syntax is prepared in its own original root owner.
  // An already known SDK refusal cannot require a doomed full-project warmup.
  // The real catalog remains complete; the later report remains honestly partial.
  const sdkId = groups.root(workspace)
  if (!initial && coordinator.peek(sdkId)?.engine.hasCompleteSdkCoverage()) return
  prepare({ ...workspace, documents: [], semanticRootPaths: [] }, sdkId)
  const completeSdk = runWithSemanticLease(coordinator, sdkId, entry => entry.engine.hasCompleteSdkCoverage(), false)
  if (workspace.projectMembership?.status !== "complete" || !completeSdk) {
    synchronize(sdkId)
    if (workspace.projectMembership?.status === "complete") groups.preparePartialWorkspace(workspace,
      runWithSemanticLease(coordinator, sdkId, entry => ({ ...entry.engine.projectSyntaxProfile(true),
        configuration: entry.engine.captureConfigurationBeforeSourceReset() }), false))
    return
  }
  if (initial) groups.prepareInitial(workspace, limit, group => { prepare(group.workspace, group.id); synchronize(group.id) })
}
