import path from "node:path"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"

/** Preserve document-authority admission when crossing into an isolated verifier. */
export function withProjectFileIdentities(
  workspace: SemanticWorkspaceView,
  access: ProjectFileAccessPort | undefined,
): SemanticWorkspaceView | undefined {
  const membership = workspace.projectMembership
  if (!access || !membership || membership.status !== "complete") return workspace
  const overlays = new Set(workspace.documents.filter(document => document.overlay)
    .map(document => path.resolve(document.path)))
  const projectFileIdentities: Array<readonly [string, string]> = []
  for (const memberPath of membership.paths) {
    const filePath = path.resolve(memberPath)
    const token = access.tokenFor(workspace.canonicalRootId, membership.revision, filePath)
    if (token === undefined) {
      if (overlays.has(filePath)) continue
      return undefined
    }
    projectFileIdentities.push([filePath, token])
  }
  return { ...workspace, projectFileIdentities }
}
