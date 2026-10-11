import fs from "node:fs"
import path from "node:path"

const MAX_WITNESS_PATHS = 4096
const MAX_MISSING_ANCESTORS = 64

export type ConfigurationFreshnessMode = "validate" | "capture"

export interface ConfigurationWitnessFailure {
  readonly reason: string
  readonly sourcePath?: string
  readonly retainedPaths: number
}

/** Evidence belongs to the actual load/lookup, never to a later cache hit. */
export class LoadedConfigurationWitness {
  private readonly identities = new Map<string, string>()
  private readonly pathIdentities = new Map<string, string>()
  private revision = 0
  private resetEpoch = 0
  private unprovable = false

  constructor(private readonly onUnprovable?: (failure: ConfigurationWitnessFailure) => void) {}

  observe<T>(filePath: string, load: () => T): T {
    const resolved = path.resolve(filePath)
    const before = lookupIdentity(resolved)
    try { return load() }
    finally {
      const after = lookupIdentity(resolved)
      if (!before || !after) this.markUnprovable("identity-unavailable", resolved)
      else if (after.loadGuard !== before.loadGuard) this.markUnprovable("changed-during-load", resolved)
      else {
        const owner = before.absenceOwner
        // A directly loaded directory's unchanged full stamp already fences
        // every actual negative child lookup. Never restamp a cached owner.
        const coveredOwner = owner && this.identities.get(owner[0]) === owner[1] ? owner : undefined
        const witnessPath = coveredOwner?.[0] ?? before.witnessPath
        const identity = coveredOwner?.[1] ?? before.identity
        const previous = this.identities.get(witnessPath)
        if (previous !== undefined && previous !== identity) this.markUnprovable("loaded-identity-changed", resolved)
        else if (previous === undefined) {
          if (this.identities.size + this.pathIdentities.size >= MAX_WITNESS_PATHS) this.markUnprovable("witness-capacity", resolved)
          else { this.identities.set(witnessPath, identity); this.revision += 1 }
        }
      }
    }
  }

  /** A cached realpath depends on path identity, not sibling directory contents. */
  observePath<T>(filePath: string, load: () => T): T {
    return this.observePathLoad(filePath, load, false)
  }

  /** A boolean lookup consumes existence, never a directory's children. */
  observePresence(filePath: string, load: () => boolean): boolean {
    return this.observePathLoad(filePath, load, true)
  }

  private observePathLoad<T>(filePath: string, load: () => T, presence: boolean): T {
    const resolved = path.resolve(filePath)
    const before = lookupIdentity(resolved, true)
    let result: T | undefined
    try { result = load(); return result }
    finally {
      const after = lookupIdentity(resolved, true)
      if (!before || !after) this.markUnprovable("identity-unavailable", resolved)
      // A false presence probe consumed no transient contents; true still cannot
      // certify an absent path. Content reads retain the full load-window guard.
      else if (after.loadGuard !== before.loadGuard && !(presence && typeof result === "boolean"
        && after.identity === before.identity && (!before.absenceOwner || result === false))) {
        this.markUnprovable("changed-during-load", resolved)
      }
      else {
        // Retain a genuinely observed stable directory stamp to cover its actual
        // negative children, without inventing a listing or restamping a cache.
        const directory = presence && result === true && !before.absenceOwner
          && before.identity !== before.loadGuard && after.loadGuard === before.loadGuard
        const owner = before.absenceOwner
        const coveredOwner = presence && owner && this.identities.get(owner[0]) === owner[1] ? owner : undefined
        const records = directory || coveredOwner ? this.identities : this.pathIdentities
        const witnessPath = directory ? resolved : coveredOwner?.[0] ?? before.witnessPath
        const identity = directory ? before.loadGuard : coveredOwner?.[1] ?? before.identity
        const previous = records.get(witnessPath)
        if (previous !== undefined && previous !== identity) this.markUnprovable("loaded-identity-changed", resolved)
        else if (previous === undefined) {
          if (this.identities.size + this.pathIdentities.size >= MAX_WITNESS_PATHS) this.markUnprovable("witness-capacity", resolved)
          else { records.set(witnessPath, identity); this.revision += 1 }
        }
      }
    }
  }

  markUnprovable(reason = "caller-invalidated", sourcePath?: string): void {
    if (this.unprovable) return
    this.unprovable = true
    this.revision += 1
    try { this.onUnprovable?.({ reason, sourcePath, retainedPaths: this.identities.size + this.pathIdentities.size }) }
    catch { /* Observability must never change admission or the complete fallback. */ }
  }

  reset(): void {
    this.identities.clear()
    this.pathIdentities.clear()
    this.unprovable = false
    this.revision += 1
    this.resetEpoch += 1
  }

  /** Capture keeps actual loaded identities; the predicate always performs the full scan. */
  freshness(checkpoint: () => void, mode: ConfigurationFreshnessMode = "validate"): (() => boolean) | undefined {
    if (this.unprovable) return undefined
    const resetEpoch = this.resetEpoch
    const current = (): boolean => {
      checkpoint()
      if (this.unprovable || this.resetEpoch !== resetEpoch) return false
      // Another root may append actual loads without changing existing inputs.
      // Validate ALL current facts, including additions, and fence this scan.
      const revision = this.revision
      const identities = [...this.identities]
      const pathIdentities = [...this.pathIdentities]
      for (const [filePath, identity] of identities) {
        checkpoint()
        if (lookupIdentity(filePath)?.identity !== identity) return false
      }
      for (const [filePath, identity] of pathIdentities) {
        checkpoint()
        if (lookupIdentity(filePath, true)?.identity !== identity) return false
      }
      checkpoint()
      return !this.unprovable && this.resetEpoch === resetEpoch && this.revision === revision
    }
    return mode === "capture" ? current : current() ? current : undefined
  }
}

/** Include lexical links and genuine absence, including its existing parent owner. */
function lookupIdentity(filePath: string, directoryIdentityOnly = false): {
  identity: string; loadGuard: string; witnessPath: string; absenceOwner?: readonly [string, string]
} | undefined {
  let candidate = filePath
  const missing: string[] = []
  for (let depth = 0; depth < MAX_MISSING_ANCESTORS; depth += 1) {
    try {
      const lexical = fs.lstatSync(candidate, { throwIfNoEntry: false })
      if (!lexical) {
        // Keep the second absence observation; avoid allocating ENOENT errors.
        if (fs.lstatSync(candidate, { throwIfNoEntry: false })) return undefined
        const parent = path.dirname(candidate)
        if (parent === candidate) return undefined
        missing.push(path.basename(candidate))
        candidate = parent
        continue
      }
      const physical = fs.realpathSync.native(candidate)
      const target = fs.statSync(candidate)
      const link = lexical.isSymbolicLink() ? fs.readlinkSync(candidate) : null
      const owner = [candidate, missing, physical, link]
      // Keep full before/after guards, including an absent path's owner:
      // a missing → present → missing load window is not negative evidence.
      const loadGuard = JSON.stringify([...owner, stamp(lexical, false), stamp(target, false)])
      // The first absent ancestor already proves every descendant absent.
      // Retain that actual lstat evidence once, not a guessed directory listing.
      // Creation/retargeting of it still invalidates every dependent lookup.
      const absent = missing.at(-1)
      const absenceOwner = absent !== undefined && target.isDirectory()
        ? [candidate, JSON.stringify([candidate, [], physical, link, stamp(lexical, false), stamp(target, false)])] as const
        : undefined
      return { loadGuard, absenceOwner, witnessPath: absent === undefined ? filePath : path.join(candidate, absent),
        identity: absent === undefined ? directoryIdentityOnly && target.isDirectory()
          ? JSON.stringify([...owner, stamp(lexical, true), stamp(target, true)]) : loadGuard
          : JSON.stringify([candidate, [absent], physical, link, stamp(lexical, true), stamp(target, true)]) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined
      // ENOENT from an existing dangling link is not an absence witness.
      try {
        if (fs.lstatSync(candidate, { throwIfNoEntry: false })) return undefined
      }
      catch (missingError) {
        if ((missingError as NodeJS.ErrnoException).code !== "ENOENT") return undefined
      }
      const parent = path.dirname(candidate)
      if (parent === candidate) return undefined
      missing.push(path.basename(candidate))
      candidate = parent
    }
  }
  return undefined
}

function stamp(stat: fs.Stats, missingChild: boolean): readonly unknown[] {
  const entity = [stat.dev, stat.ino, stat.mode]
  // Rewalk the observed absent ancestor; unrelated siblings do not change absence.
  // Directly observed/enumerated directories and all files retain full stamps.
  return missingChild && stat.isDirectory()
    ? entity
    : [...entity, stat.size, stat.mtimeMs, stat.ctimeMs]
}
