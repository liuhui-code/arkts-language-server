import path from "node:path"
import fs from "node:fs"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { sourceStatIdentity } from "../workspace/workspace-disk-source.js"

/** Indexed exclusion cannot rely on a catalog whose actual disk snapshot changed. */
export function projectFileIdentitiesCurrent(workspace: SemanticWorkspaceView, checkpoint?: () => void): boolean {
  if (!workspace.projectFileIdentities || workspace.projectMembership?.status !== "complete") return false
  const overlays = new Set(workspace.documents.filter(document => document.overlay)
    .map(document => path.resolve(document.path)))
  for (const [filePath, token] of workspace.projectFileIdentities) {
    checkpoint?.()
    if (overlays.has(path.resolve(filePath))) continue
    try {
      const stat = fs.lstatSync(filePath)
      if (!stat.isFile() || sourceStatIdentity(stat) !== token) return false
    } catch { checkpoint?.(); return false }
  }
  checkpoint?.()
  return true
}

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
