import type { SemanticWorkspaceView } from "../core/workspace/document-store.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"

/** Reject unknown full scope before its preload can change a retained local LS. */
export function assertCompleteProjectMembership(workspace: SemanticWorkspaceView): void {
  if (workspace.projectMembership?.status !== "complete") throw new SemanticInputUnavailableError()
}
