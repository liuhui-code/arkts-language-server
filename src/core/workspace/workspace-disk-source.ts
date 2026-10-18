import fs from "node:fs"

import type { ProjectFileAdmissionToken, SemanticOperationControl } from "./document-store.js"

const MAX_DISK_READ_CHUNK_BYTES = 64 * 1024
export const MAX_DISK_SNAPSHOT_BYTES = 4 * 1024 * 1024

type DiskReadResult =
  | { status: "loaded"; content: string }
  | { status: "unavailable" }
  | { status: "budget-exceeded" }

/** Bounded disk authority shared by document preparation and admission-token reads. */
export function readDiskSource(
  filePath: string,
  remainingBytes: number,
  operationControl: SemanticOperationControl,
  expectedPhysicalPath?: string,
  expectedDiskIdentity?: ProjectFileAdmissionToken,
): DiskReadResult {
  let descriptor: number | undefined
  try {
    operationControl.checkpoint()
    const initial = fs.lstatSync(filePath)
    if (!initial.isFile() && !initial.isSymbolicLink()) return { status: "unavailable" }
    descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0),
    )
    const before = fs.fstatSync(descriptor)
    if (!before.isFile() || before.size > MAX_DISK_SNAPSHOT_BYTES) return { status: "unavailable" }
    if (before.size > remainingBytes) return { status: "budget-exceeded" }
    if (expectedDiskIdentity !== undefined && sourceStatIdentity(before) !== expectedDiskIdentity) {
      return { status: "unavailable" }
    }
    if (expectedPhysicalPath !== undefined) {
      const currentPhysicalPath = fs.realpathSync.native(filePath)
      const expectedEntry = fs.lstatSync(expectedPhysicalPath)
      const expectedStat = fs.statSync(expectedPhysicalPath)
      if (
        currentPhysicalPath !== expectedPhysicalPath
        || !expectedEntry.isFile()
        || before.dev !== expectedStat.dev
        || before.ino !== expectedStat.ino
      ) return { status: "unavailable" }
    }
    operationControl.checkpoint()
    const bytes = Buffer.allocUnsafe(before.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      operationControl.checkpoint()
      const bytesRead = fs.readSync(
        descriptor,
        bytes,
        offset,
        Math.min(bytes.length - offset, MAX_DISK_READ_CHUNK_BYTES),
        null,
      )
      if (bytesRead === 0) break
      offset += bytesRead
      operationControl.checkpoint()
    }
    const after = fs.fstatSync(descriptor)
    const namedAfter = fs.statSync(filePath)
    operationControl.checkpoint()
    if (
      offset !== before.size
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || !namedAfter.isFile()
      || sourceStatIdentity(after) !== sourceStatIdentity(namedAfter)
      || (expectedPhysicalPath !== undefined && fs.realpathSync.native(filePath) !== expectedPhysicalPath)
    ) return { status: "unavailable" }
    return {
      status: "loaded",
      content: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
        .decode(bytes.subarray(0, offset)),
    }
  } catch {
    operationControl.checkpoint()
    return { status: "unavailable" }
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

export function sourceStatIdentity(stat: fs.Stats): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":")
}
