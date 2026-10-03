import fs from "node:fs"
import path from "node:path"

import type { SemanticWorkspaceView } from "../workspace/document-store.js"

interface AppliedContextIdentity {
  readonly ownerId: string
  readonly resetEpoch: number
  readonly appliedContentRevision: number
}

export function typeContextResetReason(
  workspace: SemanticWorkspaceView,
  previous: AppliedContextIdentity | undefined,
  sessionReuse = false,
): string | undefined {
  if (!previous) return undefined
  if (workspace.resetTypeEngine) return "document-store-reset"
  if (previous.ownerId !== (workspace.canonicalRootId ?? path.resolve(workspace.rootPath))) return "canonical-owner-change"
  if (previous.resetEpoch !== (workspace.typeEngineResetEpoch ?? 0)) return "reset-epoch-change"
  if (previous.appliedContentRevision !== (workspace.contentRevision ?? 0)
    && !(sessionReuse && hasCompleteDiskDelta(workspace, previous.appliedContentRevision))) {
    return "content-revision-change"
  }
  return undefined
}

function hasCompleteDiskDelta(workspace: SemanticWorkspaceView, appliedRevision: number): boolean {
  const delta = workspace.contentDelta
  const paths = workspace.changedPaths
  const root = path.resolve(workspace.rootPath)
  const deliveredPaths = new Set(workspace.documents.filter(document => !document.overlay)
    .map(document => path.resolve(document.path)))
  return delta !== undefined && delta.rootPath === root
    && delta.fromRevision === appliedRevision && delta.toRevision === workspace.contentRevision
    && (workspace.removedPaths?.length ?? 0) === 0 && paths !== undefined && paths.length > 0
    && delta.changedPaths.length === paths.length && paths.every((filePath, index) => {
      const relative = path.relative(root, filePath)
      return delta.changedPaths[index] === filePath && deliveredPaths.has(filePath)
        && relative !== "" && !path.isAbsolute(relative)
        && !relative.split(path.sep).some(part => part === ".." || part === "oh_modules")
    })
}

export function canonicalTypeEngineOwner(rootPath: string): string {
  const resolved = path.resolve(rootPath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}
