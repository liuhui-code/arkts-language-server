import { noteKnownMembershipSources } from "./project-membership-fact-delta.js"
import type { WorkspaceContentChanges } from "./workspace-content-changes.js"
import fs from "node:fs"
import path from "node:path"

import type { ProjectFileSetCacheEntry } from "./project-membership-catalog.js"
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
  knownPaths: readonly string[]
  lexicalRoot: string
  documents: ReadonlyMap<string, CachedDiskSource>
  operationControl: SemanticOperationControl
  maxReadBytes: number
}) {
  const { canonicalRoot, lexicalRoot, documents, operationControl } = options
  const rejectedSourceChanges: Array<{ path: string; physicalPath: string }> = []
  const preserveUnchanged = (process.env.ARKTS_L02_SAME_CONTENT_PROMOTION ?? "1") === "1"
  let remainingBytes = options.maxReadBytes
  // This delivery classification shares observations only within this phase.
  // The final same-content/identity fence below deliberately observes again.
  const physicalPaths = new Map<string, string>()
  const physicalPathFor = (source: string): string => {
    let physical = physicalPaths.get(source)
    if (physical === undefined) { physical = canonicalSourcePath(source); physicalPaths.set(source, physical) }
    return physical
  }
  const sourceChanges = expandWatchedSourceRemovals(changes, options.knownPaths, operationControl, physicalPathFor).flatMap<WatchedSourceChange>(change => {
    const sourcePath = path.resolve(change.path)
    if (!SOURCE_EXTENSIONS.includes(path.extname(sourcePath))) return []
    const physicalPath = physicalPathFor(sourcePath)
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

/** Deleted URI has no file-kind proof. Expand only tracked descendants, without
 * discarding unrelated membership or forcing an SDK/whole-root reset. The store
 * keeps this catalog sorted; partial catalogs retain their partial status. */
function expandWatchedSourceRemovals(changes: WorkspaceFileChangeBatch["changes"], knownPaths: readonly string[],
  control: SemanticOperationControl, canonicalize: (source: string) => string) {
  const result = new Map<string, WorkspaceFileChangeBatch["changes"][number]>()
  for (const change of changes) {
    result.set(path.resolve(change.path), change)
    let replacesDirectory = false
    let regular: boolean | undefined
    for (const directory of new Set([path.resolve(change.path), canonicalize(path.resolve(change.path))])) {
      const prefix = directory + path.sep
      let low = 0, high = knownPaths.length
      while (low < high) {
        const middle = (low + high) >>> 1
        if (knownPaths[middle]! < prefix) low = middle + 1
        else high = middle
      }
      for (let index = low; index < knownPaths.length; index++) {
        const source = knownPaths[index]!
        if (!source.startsWith(prefix)) break
        if (change.kind !== "deleted") {
          regular ??= observeStat(change.path, "lstat", control)?.isFile() === true
          if (!regular) break
          replacesDirectory = true
        }
        result.set(source, { path: source, kind: "deleted" })
      }
    }
    // The replacement itself is a newly admitted file, not a content edit of a
    // file that the old directory-only membership never contained.
    if (replacesDirectory) result.set(path.resolve(change.path), { ...change, kind: "created" })
  }
  return [...result.values()]
}

/** Closing an overlay restores physical membership; no stale overlay identity is
 * promoted to a disk file. Return whether the owning catalog revision changed. */
export function refreshClosedSourceMembership(entry: ProjectFileSetCacheEntry, source: string,
  canonicalRoot: string, control: SemanticOperationControl): boolean {
  const index = entry.paths.indexOf(source)
  if (index < 0) { entry.diskIdentities.delete(source); return false }
  const regular = observeStat(source, "lstat", control)?.isFile() === true
  const stat = observeStat(source, "stat", control)
  const physical = canonicalSourcePath(source)
  if (regular && stat?.isFile() && stat.size <= MAX_DISK_SNAPSHOT_BYTES && isInside(canonicalRoot, physical)) {
    const identity = sourceStatIdentity(stat)
    if (entry.diskIdentities.get(source) === identity) return false
    entry.diskIdentities.set(source, identity)
  } else {
    entry.diskIdentities.delete(source)
    entry.paths.splice(index, 1)
    entry.pathBytes -= Buffer.byteLength(source)
  }
  return true
}

/** Finish watched metadata/content publication without conflating overlay authority
 * with changes to its physical admission token. Uncertain delivery breaks lineage. */
export function finishWatchedSourceChanges(input: {
  entry: ProjectFileSetCacheEntry | undefined; membershipChanged: boolean
  sourceChanges: readonly WatchedSourceChange[]; rejectedSourceChanges: readonly unknown[]
  knownPathsBeforeInvalidation: ReadonlySet<string>; canonicalRoot: string; lexicalRoot: string
  changedRoots: ReadonlySet<string>; resetRoots: ReadonlySet<string>
  control: SemanticOperationControl; changes: WorkspaceContentChanges
}): void {
  const { entry, sourceChanges, canonicalRoot } = input
  const compatible = input.rejectedSourceChanges.length === 0 && sourceChanges.length > 0
    && sourceChanges.every(change => change.kind === "changed" && change.membershipEligible
      && input.knownPathsBeforeInvalidation.has(change.sourcePath))
  const compatibleDiskDelta = compatible && sourceChanges.every(change => !change.overlay
    && input.knownPathsBeforeInvalidation.has(change.sourcePath))
  // Physical membership renewal is independent of compiler overlay authority.
  // Existing closed-source behavior is retained; open-source renewal additionally
  // requires no alias/reset uncertainty. renew still verifies every original name
  // and unaffected token, retires the old owner, and keeps raw current/final IO.
  const renewMetadata = compatibleDiskDelta || compatible && !input.resetRoots.size
  try {
    // A source notification is not evidence that its containing namespace stayed
    // unchanged. Preserve revocation so the next preparation scans BEFORE capture,
    // rather than requiring an unrelated diagnostic to fail and dirty it first.
    const proof = entry?.completeProof
    if (proof && !proof.invalidated) for (const directory of new Set(sourceChanges.map(change => path.dirname(change.sourcePath)))) {
      input.control.checkpoint()
      if (!proof.directory(directory)?.current()) { proof.invalidate(); break }
    }
    if (entry && input.membershipChanged && renewMetadata && !entry.completeProof?.invalidated) entry.completeProof = entry.completeProof?.renew?.(
      entry, sourceChanges.map(change => change.sourcePath), input.control)
    for (const root of input.changedRoots) input.changes.advance(root,
      compatibleDiskDelta && root === canonicalRoot && !input.resetRoots.has(root) ? input.lexicalRoot : undefined)
  } catch (error) {
    if (entry) noteKnownMembershipSources(entry, undefined)
    throw error
  }
  if (entry) noteKnownMembershipSources(entry, compatible && !input.resetRoots.size
    ? sourceChanges.map(change => change.sourcePath) : undefined)
}
