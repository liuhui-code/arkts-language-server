import path from "node:path"
import { createHash } from "node:crypto"
import type { ProjectFileAccessPort, SemanticWorkspaceView } from "../workspace/semantic-workspace-view.js"
import { SEMANTIC_SOURCE_SNAPSHOT_LIMITS as limits } from "../workspace/semantic-workspace-view.js"
import { canonicalSourcePath, isWorkspacePhysicalAlias } from "../workspace/physical-path-identity.js"

/** Deliver only witnessed changed disk inputs; never guess an omitted overlay or widen roots. */
export function withChangedDiskDocuments(workspace: SemanticWorkspaceView,
  access: ProjectFileAccessPort | undefined): SemanticWorkspaceView {
  const membership = workspace.projectMembership
  if (!access || membership?.status !== "complete" || workspace.resetTypeEngine
    || workspace.removedPaths?.length) return workspace
  const delivered = new Set(workspace.documents.map(document => path.resolve(document.path)))
  const missing = (workspace.changedPaths ?? []).filter(file => !delivered.has(file))
  if (!missing.length || missing.length > limits.maxDocuments) return workspace
  let bytes = workspace.documents.reduce((sum, document) => sum + Buffer.byteLength(document.content), 0)
  if (bytes > limits.maxBytes) return workspace
  const members = new Set(membership.paths)
  const overlays = new Set(workspace.overlayPaths?.values())
  const documents = [...workspace.documents]
  const changedDiskInputs: NonNullable<SemanticWorkspaceView["changedDiskInputs"]>[number][] = []
  for (const filePath of missing) {
    const relative = path.relative(workspace.rootPath, filePath)
    if (!members.has(filePath) || relative === "" || path.isAbsolute(relative)
      || relative.split(path.sep).some(part => part === ".." || part === "oh_modules")) return workspace
    const physical = canonicalSourcePath(filePath)
    if (overlays.has(filePath) || workspace.overlayPaths?.has(physical)
      || isWorkspacePhysicalAlias(workspace.rootPath, workspace.canonicalRootId, filePath, physical)) return workspace
    const token = access.tokenFor(workspace.canonicalRootId, membership.revision, filePath)
    if (token === undefined) return workspace
    const content = access.read(workspace.canonicalRootId, membership.revision, filePath, token)
    if (content === null || (bytes += Buffer.byteLength(content)) > limits.maxBytes) return workspace
    if (canonicalSourcePath(filePath) !== physical) return workspace
    if (documents.length < limits.maxDocuments) documents.push({ path: filePath, content, overlay: false })
    else changedDiskInputs.push({ path: filePath, physicalPath: physical, token,
      sourceSha256: createHash("sha256").update(content).digest("hex") })
  }
  return { ...workspace, documents, ...(changedDiskInputs.length ? { changedDiskInputs } : {}),
    state: { ...workspace.state, documentCacheHit: false, loadedDocumentCount: documents.length } }
}
