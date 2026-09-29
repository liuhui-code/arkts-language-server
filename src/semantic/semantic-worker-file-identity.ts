import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function resourceEventPath(candidate: string): string {
  try { return fs.realpathSync.native(candidate) }
  catch {
    try { return path.join(fs.realpathSync.native(path.dirname(candidate)), path.basename(candidate)) }
    catch { return path.resolve(candidate) }
  }
}

export function toFilePath(uri: string): string | undefined {
  try { return uri.startsWith("file:") ? fileURLToPath(uri) : undefined }
  catch { return undefined }
}

export function referenceRootsMayOverlap(leftUri: string, rightUri: string): boolean {
  if (leftUri === rightUri) return true
  try {
    const left = fs.realpathSync.native(fileURLToPath(leftUri))
    const right = fs.realpathSync.native(fileURLToPath(rightUri))
    return [path.relative(left, right), path.relative(right, left)].some(relative => (
      relative === "" || (!path.isAbsolute(relative) && relative !== ".."
        && !relative.startsWith(`..${path.sep}`))
    ))
  } catch {
    // An unavailable physical identity cannot prove independent input scopes.
    return true
  }
}
