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
  if (!initialPreparationActive()) return
  const prepareAndSynchronize = (view: SemanticWorkspaceView, id: string) => {
    prepare(view, id)
    runWithSemanticLease(coordinator, id, entry => entry.engine.measureCompilerReadiness(), true)
  }
  if (workspace.projectMembership?.status !== "complete") {
    // An empty explicit root set admits SDK/standard-library roots without
    // treating an arbitrary preparation anchor as part of a future local query.
    prepareAndSynchronize({ ...workspace, documents: [], semanticRootPaths: [] }, groups.root(workspace))
    return
  }
  groups.prepareInitial(workspace, limit, group => prepareAndSynchronize(group.workspace, group.id))
}
