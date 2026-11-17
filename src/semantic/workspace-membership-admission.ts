import type { SemanticDocumentStore, SemanticWorkspaceView } from "../core/workspace/document-store.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"

/** Reject unknown full scope before its preload can change a retained local LS. */
export function assertCompleteProjectMembership(workspace: SemanticWorkspaceView): void {
  if (workspace.projectMembership?.status !== "complete") throw new SemanticInputUnavailableError()
}

/** Complete queries rediscover names; previous completeness is not a current proof.
 * A failed scan is unknown, not a permanent complete-scope exclusion. Retry
 * once at a later full query, preserving disk authority and all final fences.
 * Proven capacity limits remain unavailable without rescanning on every query. */
export function prepareCompleteProjectWorkspace(documents: SemanticDocumentStore,
  prepare: () => SemanticWorkspaceView): SemanticWorkspaceView {
  let workspace = prepare()
  const membership = workspace.projectMembership
  if (membership?.status === "complete" || (membership?.status === "partial"
    && (membership.reason === "enumeration-error" || membership.reason === "source-unavailable"
      || !documents.hasCurrentCapacityFailure(workspace.rootPath)))) {
    const refreshed = documents.refreshProjectMembership(workspace.rootPath)
    // A successful unchanged reconciliation preserves this exact captured view.
    // A different root/version still requires a new authoritative capture.
    if (refreshed.changed || refreshed.catalogStamp.canonicalRootId !== workspace.canonicalRootId
      || refreshed.catalogStamp.revision !== membership.revision) workspace = prepare()
  }
  assertCompleteProjectMembership(workspace)
  return workspace
}
