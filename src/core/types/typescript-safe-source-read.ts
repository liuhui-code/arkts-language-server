import fs from "node:fs"

const MAX_SOURCE_FILE_BYTES = 4 * 1_024 * 1_024

export function safeRead(filePath: string): string | null {
  let descriptor: number | undefined
  try {
    const initial = fs.lstatSync(filePath)
    if (!initial.isFile() && !initial.isSymbolicLink()) return null
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0),
    )
    const before = fs.fstatSync(descriptor)
    if (!before.isFile() || !isBoundedSourceSize(before.size)) return null
    const bytes = Buffer.allocUnsafe(before.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const bytesRead = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    const after = fs.fstatSync(descriptor)
    if (offset !== before.size || !sameSourceStat(before, after)) return null
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(bytes.subarray(0, offset))
  } catch {
    return null
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor)
      } catch {
        // The read already failed closed.
      }
    }
  }
}

export function isRegularBoundedFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath)
    return stat.isFile() && isBoundedSourceSize(stat.size)
  } catch {
    return false
  }
}

function isBoundedSourceSize(size: number): boolean {
  return Number.isSafeInteger(size) && size >= 0 && size <= MAX_SOURCE_FILE_BYTES
}

function sameSourceStat(left: fs.Stats, right: fs.Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
}
