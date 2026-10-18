import fs from "node:fs"
import path from "node:path"

import type { SemanticOperationControl, WorkspaceFileChangeBatch } from "./document-store.js"
import { canonicalSourcePath, isInside } from "./physical-path-identity.js"
import { MAX_DISK_SNAPSHOT_BYTES, readDiskSource, sourceStatIdentity } from "./workspace-disk-source.js"
import { SOURCE_EXTENSIONS } from "./workspace-source-enumerator.js"

interface CachedDiskSource {
  readonly content: string
  readonly physicalPath: string
  readonly diskFingerprint: string | null
  readonly available: boolean
  readonly overlay: boolean
}

interface WatchedSourceChange {
  sourcePath: string
  physicalPath: string
  kind: "created" | "changed" | "deleted"
  overlay: boolean
  membershipEligible: boolean
  stat: fs.Stats | undefined
}

/** Classify filesystem delivery before mutating store-owned records, closures or revision fences. */
export function classifyWatchedSourceChanges(changes: WorkspaceFileChangeBatch["changes"], options: {
  canonicalRoot: string
  lexicalRoot: string
  documents: ReadonlyMap<string, CachedDiskSource>
  operationControl: SemanticOperationControl
  maxReadBytes: number
}) {
  const { canonicalRoot, lexicalRoot, documents, operationControl } = options
  const rejectedSourceChanges: Array<{ path: string; physicalPath: string }> = []
  const preserveUnchanged = (process.env.ARKTS_L02_SAME_CONTENT_PROMOTION ?? "1") === "1"
  let remainingBytes = options.maxReadBytes
  const sourceChanges = changes.flatMap<WatchedSourceChange>(change => {
    const sourcePath = path.resolve(change.path)
    if (!SOURCE_EXTENSIONS.includes(path.extname(sourcePath))) return []
    const physicalPath = canonicalSourcePath(sourcePath)
    if (!isInside(canonicalRoot, physicalPath)) {
      if (isInside(lexicalRoot, sourcePath)) rejectedSourceChanges.push({ path: sourcePath, physicalPath })
      return []
    }
    let stat: fs.Stats | undefined
    let membershipEligible = false
    if (change.kind !== "deleted") {
      membershipEligible = observeStat(sourcePath, "lstat", operationControl)?.isFile() === true
      stat = observeStat(sourcePath, "stat", operationControl)
      if (!stat?.isFile() || stat.size > MAX_DISK_SNAPSHOT_BYTES) {
        rejectedSourceChanges.push({ path: sourcePath, physicalPath })
        return []
      }
    }
    const cached = documents.get(sourcePath)
    if (preserveUnchanged && change.kind === "changed" && membershipEligible && stat && cached?.available
      && !cached.overlay && cached.physicalPath === physicalPath && stat.size <= remainingBytes
      && cached.diskFingerprint === sourceStatIdentity(stat)) {
      // Metadata alone is not content authority, including same-size/restored-mtime writes.
      remainingBytes -= stat.size
      const identity = sourceStatIdentity(stat)
      const read = readDiskSource(sourcePath, stat.size, operationControl, physicalPath, identity)
      const finalEntry = observeStat(sourcePath, "lstat", operationControl)
      const finalStat = observeStat(sourcePath, "stat", operationControl)
      if (read.status === "loaded" && read.content === cached.content && finalEntry?.isFile()
        && finalStat?.isFile() && sourceStatIdentity(finalStat) === identity
        && canonicalSourcePath(sourcePath) === physicalPath) return []
    }
    return [{ sourcePath, physicalPath, kind: change.kind,
      overlay: cached?.overlay === true, membershipEligible, stat }]
  })
  return { sourceChanges, rejectedSourceChanges }
}

function observeStat(filePath: string, kind: "stat" | "lstat", operationControl: SemanticOperationControl) {
  try {
    const stat = kind === "stat" ? fs.statSync(filePath) : fs.lstatSync(filePath)
    operationControl.checkpoint()
    return stat
  } catch {
    operationControl.checkpoint()
    return undefined
  }
}
