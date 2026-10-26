import { relativePathWithinRoot } from "./path-identity.js"

/** Inputs are already absolute/normalized; do not use this for raw user paths. */
export function containsResolvedPath(rootPath: string, candidatePath: string): boolean {
  return relativePathWithinRoot(rootPath, candidatePath) !== undefined
}
