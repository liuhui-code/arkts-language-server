import path from "node:path"
import fs from "node:fs"

/** Fold only the Windows volume letter. File and directory spelling stays intact. */
export function resolvedPathIdentity(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === "win32"
    ? resolved.replace(/^[A-Z](?=:)/, letter => letter.toLowerCase()) : resolved
}

export function sameResolvedPath(left: string, right: string): boolean {
  return resolvedPathIdentity(left) === resolvedPathIdentity(right)
}

/** Lexical relation for resolved paths; physical source admission remains separate. */
export function relativePathWithinRoot(rootPath: string, candidatePath: string): string | undefined {
  const root = resolvedPathIdentity(rootPath)
  const candidate = resolvedPathIdentity(candidatePath)
  if (candidate === root) return ""
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  return candidate.startsWith(prefix) ? candidate.slice(prefix.length) : undefined
}

/** Unknown spellings are equivalent only with current filesystem evidence. */
export function samePhysicalPath(left: string, right: string): boolean {
  if (sameResolvedPath(left, right)) return true
  try { return sameResolvedPath(fs.realpathSync.native(left), fs.realpathSync.native(right)) }
  catch { return false }
}

/** Existing aliases and an unsaved leaf may be rebased through their physical parent. */
export function relativeResourcePath(rootPath: string, candidatePath: string): string | undefined {
  const lexical = relativePathWithinRoot(rootPath, candidatePath)
  if (lexical !== undefined) return lexical
  try {
    const root = fs.realpathSync.native(rootPath)
    let candidate: string
    try { candidate = fs.realpathSync.native(candidatePath) }
    catch { candidate = path.join(fs.realpathSync.native(path.dirname(candidatePath)), path.basename(candidatePath)) }
    return relativePathWithinRoot(root, candidate)
  } catch { return undefined }
}
