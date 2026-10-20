import fs from "node:fs"

export function diskIdentity(filePath: string): { readonly physicalPath: string; readonly stamp: string } | undefined {
  try {
    const entry = fs.lstatSync(filePath)
    if (!entry.isFile() && !entry.isSymbolicLink()) return undefined
    const physicalPath = fs.realpathSync.native(filePath)
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return undefined
    if (entry.isSymbolicLink()) {
      const physical = fs.lstatSync(physicalPath)
      if (!physical.isFile() || physical.dev !== stat.dev || physical.ino !== stat.ino) return undefined
    }
    const link = entry.isSymbolicLink() ? [entry.dev, entry.ino, entry.size, entry.mtimeMs, entry.ctimeMs] : []
    return { physicalPath,
      stamp: JSON.stringify([physicalPath, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, ...link]) }
  } catch {
    return undefined
  }
}
