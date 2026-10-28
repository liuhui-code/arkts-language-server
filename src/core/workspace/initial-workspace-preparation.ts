import type { SemanticDocumentPosition } from "../protocol.js"
import type { ProjectMembershipSnapshot, SemanticWorkspaceView } from "./semantic-workspace-view.js"

/** An initialization anchor is store-owned; it is never a user's query target. */
export function prepareInitialWorkspace(rootPath: string, membership: ProjectMembershipSnapshot,
  prepare: (position: SemanticDocumentPosition) => SemanticWorkspaceView): SemanticWorkspaceView | undefined {
  const currentPath = membership.paths[0]
  return currentPath ? prepare({ path: currentPath, workspaceRoot: rootPath, line: 1, column: 1 }) : undefined
}
