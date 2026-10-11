import path from "node:path"

/** Inputs are already absolute/normalized; do not use this for raw user paths. */
export function containsResolvedPath(rootPath: string, candidatePath: string): boolean {
  const root = process.platform === "win32" ? rootPath.toLowerCase() : rootPath
  const candidate = process.platform === "win32" ? candidatePath.toLowerCase() : candidatePath
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  return candidate === root || candidate.startsWith(prefix)
}
