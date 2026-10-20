import path from "node:path"
import { canonicalSourcePath, canonicalWorkspaceRoot, isInside, isWorkspacePhysicalAlias } from "./physical-path-identity.js"

interface ClosedDocument {
  readonly path: string
  readonly physicalPath: string
  readonly canonicalRoot: string
  readonly lexicalRoot?: string
}

interface InvalidationPort {
  invalidate(inputs: readonly { path: string; physicalPath: string }[]): Map<string, Map<string, Set<string>>>
  changed(root: string, filePath: string): void
  reset(root: string): void
  advance(root: string, compatibleRoot?: string): void
}

/** Revoke the overlay and certify only an unchanged, same-owner physical authority transition. */
export function invalidateClosedDocument(document: ClosedDocument, port: InvalidationPort): void {
  const { canonicalRoot, lexicalRoot, path: filePath, physicalPath } = document
  const currentPhysicalPath = canonicalSourcePath(filePath)
  const matches = port.invalidate([...new Set([physicalPath, currentPhysicalPath])]
    .map(identity => ({ path: filePath, physicalPath: identity })))
  const changedRoots = new Set([canonicalRoot])
  const resetRoots = new Set<string>()
  port.changed(canonicalRoot, filePath)
  for (const [root, paths] of matches.get(filePath) ?? []) {
    let aliasAffected = false
    for (const affectedPath of paths) {
      port.changed(root, affectedPath)
      aliasAffected ||= affectedPath !== filePath
    }
    changedRoots.add(root)
    if (root !== canonicalRoot || aliasAffected) resetRoots.add(root)
  }
  for (const root of resetRoots) port.reset(root)
  const compatible = lexicalRoot !== undefined && canonicalWorkspaceRoot(lexicalRoot) === canonicalRoot
    && isInside(lexicalRoot, filePath) && physicalPath === currentPhysicalPath
    && !filePath.split(path.sep).includes("oh_modules")
    && !isWorkspacePhysicalAlias(lexicalRoot, canonicalRoot, filePath, currentPhysicalPath)
  for (const root of changedRoots) port.advance(root,
    compatible && root === canonicalRoot && !resetRoots.has(root) ? lexicalRoot : undefined)
}
