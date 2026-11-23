import path from "node:path"
import fs from "node:fs"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/document-store.js"
import { sourceStatIdentity } from "../workspace/workspace-disk-source.js"

const admittedProofs = new WeakMap<SemanticWorkspaceView, {
  readonly identities: SemanticWorkspaceView["projectFileIdentities"]; current(): boolean
}>()

/** Indexed exclusion cannot rely on a catalog whose actual disk snapshot changed. */
export function projectFileIdentitiesCurrent(workspace: SemanticWorkspaceView, checkpoint?: () => void): boolean {
  if (!workspace.projectFileIdentities || workspace.projectMembership?.status !== "complete") return false
  const proof = admittedProofs.get(workspace)
  if (proof && proof.identities === workspace.projectFileIdentities) return proof.current()
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
  const view = { ...workspace, projectFileIdentities }
  const proof = access.captureSourceIdentityProof?.(workspace.canonicalRootId, membership.revision)
  if (proof?.catalogStamp.canonicalRootId === workspace.canonicalRootId
    && proof.catalogStamp.revision === membership.revision) {
    for (const identity of projectFileIdentities) Object.freeze(identity)
    Object.freeze(projectFileIdentities)
    admittedProofs.set(view, { identities: projectFileIdentities, current: proof.current })
  }
  return view
}
