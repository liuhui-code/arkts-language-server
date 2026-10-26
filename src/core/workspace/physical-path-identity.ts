import fs from "node:fs"
import path from "node:path"
import { relativePathWithinRoot } from "../../project/path-identity.js"

export function canonicalWorkspaceRoot(rootPath: string): string {
  const resolved = path.resolve(rootPath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

export function isWorkspacePhysicalAlias(
  lexicalWorkspaceRoot: string | undefined,
  canonicalRoot: string | undefined,
  sourcePath: string,
  physicalPath: string,
): boolean {
  if (!lexicalWorkspaceRoot || !canonicalRoot) return false
  const lexicalRoot = path.resolve(lexicalWorkspaceRoot)
  const relative = path.relative(lexicalRoot, sourcePath)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false
  }
  return path.resolve(canonicalRoot, relative) !== physicalPath
}

export function canonicalSourcePath(filePath: string): string {
  const resolved = path.resolve(filePath)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    try {
      return path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved))
    } catch {
      return resolved
    }
  }
}

export function isInside(rootPath: string, candidatePath: string): boolean {
  const relative = relativePathWithinRoot(rootPath, candidatePath)
  return relative !== undefined && relative !== ""
}
