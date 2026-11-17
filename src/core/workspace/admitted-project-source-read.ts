import fs from "node:fs"
import path from "node:path"
import type { ProjectSourceSnapshot } from "./semantic-workspace-view.js"
import type { ProjectFileAdmissionToken, SemanticOperationControl } from "./document-store.js"
import type { ProjectFileSetCacheEntry } from "./project-membership-catalog.js"
import { canonicalSourcePath, isInside } from "./physical-path-identity.js"
import { readDiskSource } from "./workspace-disk-source.js"

/** The completed native walk excludes symlink descendants and witnesses every
 * ancestor. Its physical root supplies an EXPECTED path, never a current proof:
 * readDiskSource must still resolve the live name before and after reading.
 * Injected/partial catalogs cannot lend this directory-derived identity.
 */
export function readAdmittedProjectSourceSnapshot(input: {
  readonly filePath: string
  readonly canonicalRootId: string
  readonly token: ProjectFileAdmissionToken
  readonly operationControl: SemanticOperationControl
  readonly nativeCatalog?: Pick<ProjectFileSetCacheEntry, "scanRoot" | "status">
}): ProjectSourceSnapshot | null {
  const { filePath, canonicalRootId, token, operationControl, nativeCatalog } = input
  try {
    const entry = fs.lstatSync(filePath)
    operationControl.checkpoint()
    if (!entry.isFile()) return null
  } catch {
    operationControl.checkpoint()
    return null
  }
  const origin = nativeCatalog?.status === "complete" ? nativeCatalog.scanRoot : undefined
  const physicalPath = origin && isInside(origin, filePath)
    ? path.resolve(canonicalRootId, path.relative(origin, filePath))
    : canonicalSourcePath(filePath)
  if (!isInside(canonicalRootId, physicalPath)) return null
  const result = readDiskSource(filePath, Number.POSITIVE_INFINITY, operationControl, physicalPath, token)
  return result.status === "loaded" && result.identity
    ? { content: result.content, identity: result.identity } : null
}
