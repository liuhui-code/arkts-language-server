import fs from "node:fs"
import path from "node:path"
import { requestConfigurationIdentity, validateRequestInput, type ConfigurationInputIdentity } from "./request-input-validation.js"

import { ExactEvidenceBudget, ExactWitnessFacts, ExactWitnessPaths, ExactWitnessCapsule,
  MAX_WITNESS_BYTES, type ExactWitnessFact } from "./exact-witness-facts.js"

const MAX_MISSING_ANCESTORS = 64

export type ConfigurationFreshnessMode = "validate" | "capture"

export interface RetainedConfigurationProof {
  readonly factCount: number
  readonly accountedBytes: number
  current(checkpoint: () => void): boolean
}

export interface ConfigurationWitnessFailure {
  readonly reason: string
  readonly sourcePath?: string
  readonly retainedPaths: number
  readonly retainedBytes: number
  readonly byteLimit: number
}

/** Evidence belongs to the actual load/lookup, never to a later cache hit. */
export class LoadedConfigurationWitness {
  private readonly budget = new ExactEvidenceBudget()
  private readonly identities = new ExactWitnessFacts(this.budget)
  private readonly pathIdentities = new ExactWitnessFacts(this.budget)
  private readonly failedSourceReads = new ExactWitnessPaths(this.budget)
  private revision = 0
  private resetEpoch = 0
  private unprovable = false
  private sourceNamespaceDepth = 0
  private namespaceOnlyFailure = true
  private sourceResetOnlyFailure = true
  private readonly namespaceFailures = new ExactWitnessPaths(this.budget)

  constructor(private readonly onUnprovable?: (failure: ConfigurationWitnessFailure) => void,
    private readonly ownerCurrent: () => boolean = () => true,
    private readonly onStale?: (namespacePaths: readonly string[]) => void) {}

  /** The compiler, rather than configuration discovery, owns these source probes. */
  observeSourceNamespace<T>(filePath: string, load: () => T, presence = false): T {
    this.sourceNamespaceDepth += 1
    try { return presence ? this.observePathLoad(filePath, load, true) : this.observe(filePath, load) }
    finally { this.sourceNamespaceDepth -= 1 }
  }

  private retainFact(records: ExactWitnessFacts, filePath: string, identity: string,
    sourcePath: string, regularSource: boolean): void {
    if (!this.sourceNamespaceDepth) records.configurationConsumed(filePath)
    const previous = records.get(filePath)
    if (previous && previous.identity !== identity) this.rejectLoadedIdentityChange(sourcePath, filePath, regularSource)
    else if (!previous) {
      if (!records.add(filePath, identity, this.sourceNamespaceDepth > 0, regularSource)) {
        this.markUnprovable("witness-capacity", sourcePath)
      } else this.revision += 1
    }
  }

  observe<T>(filePath: string, load: () => T): T {
    const resolved = path.resolve(filePath)
    const before = lookupIdentity(resolved)
    let result: T | undefined
    try { result = load(); return result }
    finally {
      const after = lookupIdentity(resolved)
      if (!before || !after) this.markUnprovable("identity-unavailable", resolved)
      else if (after.loadGuard !== before.loadGuard) this.markUnprovable("changed-during-load", resolved)
      else {
        const owner = before.absenceOwner
        // A native false leaf lookup also observes its actual parent's full
        // stamp on both sides. Retain that load-owned namespace epoch, not an
        // invented listing. Missing ancestor facts still use their own path.
        const negativeLeaf = result === false && before.witnessPath === resolved
        const coveredOwner = owner && (this.identities.get(owner[0])?.identity === owner[1] || negativeLeaf)
          ? owner : undefined
        const witnessPath = coveredOwner?.[0] ?? before.witnessPath
        const identity = coveredOwner?.[1] ?? before.identity
        this.retainFact(this.identities, witnessPath, identity, resolved,
          witnessPath === resolved && before.regularSource && after.regularSource)
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
        const coveredOwner = presence && owner && this.identities.get(owner[0])?.identity === owner[1] ? owner : undefined
        const records = directory || coveredOwner ? this.identities : this.pathIdentities
        const witnessPath = directory ? resolved : coveredOwner?.[0] ?? before.witnessPath
        const identity = directory ? before.loadGuard : coveredOwner?.[1] ?? before.identity
        this.retainFact(records, witnessPath, identity, resolved,
          !directory && witnessPath === resolved && before.regularSource && after.regularSource)
      }
    }
  }

  markUnprovable(reason = "caller-invalidated", sourcePath?: string): void {
    let sourceFailure = this.sourceNamespaceDepth > 0 && sourcePath !== undefined
      && ["loaded-identity-changed", "changed-during-load", "identity-unavailable"].includes(reason)
    if (sourceFailure && !this.namespaceFailures.add(sourcePath!)) {
      sourceFailure = false; reason = "witness-capacity"
    }
    if (!sourceFailure) this.sourceResetOnlyFailure = false
    // An unavailable lookup never repairs this resident proof. Only retire-first
    // replacement may discard its source failure while retaining all non-source facts.
    if (!sourceFailure || reason === "identity-unavailable") this.namespaceOnlyFailure = false
    if (this.unprovable) return
    this.unprovable = true
    this.revision += 1
    this.reportFailure(reason, sourcePath)
  }

  private rejectLoadedIdentityChange(sourcePath: string, witnessPath: string, regularSource: boolean): void {
    // The failed known source still rejects every query. Ordinary compiler
    // lookups cannot repair it or turn its own stale fact into a global poison.
    // A distinct namespace/configuration owner retains the permanent rejection.
    if (!regularSource || sourcePath !== witnessPath || !this.failedSourceReads.has(sourcePath)) {
      this.markUnprovable("loaded-identity-changed", sourcePath)
    }
  }

  private reportFailure(reason: string, sourcePath?: string): void {
    try { this.onUnprovable?.({ reason, sourcePath, retainedPaths: this.identities.size + this.pathIdentities.size,
      retainedBytes: this.budget.bytes, byteLimit: this.budget.limit }) }
    catch { /* Observability must never change admission or the complete fallback. */ }
  }

  reset(): void {
    this.identities.clear()
    this.pathIdentities.clear()
    this.failedSourceReads.clear()
    this.namespaceFailures.clear()
    this.namespaceOnlyFailure = true
    this.sourceResetOnlyFailure = true
    this.unprovable = false
    this.revision += 1
    this.resetEpoch += 1
  }

  /** Retain unaffected original facts, never replace them with current cache-hit stamps. */
  retireNamespaces(roots: readonly string[]): boolean {
    if (this.unprovable || this.failedSourceReads.size) return false
    const affected = (file: string) => roots.some(root => {
      const relative = path.relative(root, file)
      return !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep)
    })
    for (const facts of [this.identities, this.pathIdentities]) {
      for (const file of facts.keys()) if (affected(file)) {
        facts.delete(file)
      }
    }
    this.revision += 1
    this.resetEpoch += 1
    return true
  }

  /** Only a known compiler source delta may replace its own prior lookup fact. */
  observeChangedSourceRead(filePath: string, read: () => string | null): void {
    const resolved = path.resolve(filePath)
    if (!this.identities.has(resolved) && !this.pathIdentities.has(resolved)) return
    const before = lookupIdentity(resolved)
    const content = read()
    const after = lookupIdentity(resolved)
    if (!before?.regularSource || !after?.regularSource) {
      this.markUnprovable("changed-source-namespace-unproven", resolved)
      return
    }
    if (content === null || before.loadGuard !== after.loadGuard) {
      // This path already owns a retained fact, so the set shares the existing
      // witness bound. Only a later authoritative read of this same source can
      // recover it; unknown configuration failures remain globally unprovable.
      if (!this.failedSourceReads.has(resolved)) {
        if (!this.failedSourceReads.add(resolved)) { this.markUnprovable("witness-capacity", resolved); return }
        this.revision += 1
        this.reportFailure("changed-source-read-unproven", resolved)
      }
      return
    }
    // This is a new authoritative byte read, not a cache-hit restamp. Other
    // configuration, directory and negative lookup facts retain their original load.
    for (const facts of [this.identities, this.pathIdentities]) {
      const fact = facts.get(resolved)
      if (fact) {
        const changed = fact.identity !== before.identity
        if (!facts.replace(resolved, before.identity, true)) { this.markUnprovable("witness-capacity", resolved); return }
        if (changed) this.revision += 1
      }
    }
    if (this.failedSourceReads.delete(resolved)) this.revision += 1
  }

  /** Copy only bounded original facts; the capsule retains no compiler, resolver or witness owner. */
  captureConfigurationBeforeSourceReset(checkpoint: () => void,
    sourceNamespace: (filePath: string) => boolean, maxBytes = MAX_WITNESS_BYTES): RetainedConfigurationProof {
    checkpoint()
    const epoch = this.resetEpoch, revision = this.revision
    let valid = !(this.unprovable && !this.sourceResetOnlyFailure)
      && [...this.namespaceFailures, ...this.failedSourceReads].every(file => sourceNamespace(file))
    const capsule = new ExactWitnessCapsule(maxBytes)
    for (const [kind, records] of [this.identities, this.pathIdentities].entries()) {
      for (const [filePath, fact] of records) {
        checkpoint()
        if (fact.sourceNamespace && sourceNamespace(filePath)) continue
        capsule.append(filePath, fact.identity, kind === 1)
      }
    }
    valid &&= this.resetEpoch === epoch && this.revision === revision
    const { facts, accountedBytes } = capsule.finish()
    return Object.freeze({ factCount: facts.length, accountedBytes, current: (boundary: () => void): boolean => {
      boundary()
      if (!valid) return false
      for (const fact of facts) {
        boundary()
        if (lookupIdentity(fact.filePath, fact.directoryOnly)?.identity !== fact.identity) return false
      }
      boundary()
      return true
    } })
  }

  /** Loaded identities stay fixed; query-local sharing ends in an uncached union scan. */
  freshness(checkpoint: () => void, mode: ConfigurationFreshnessMode = "validate"): (() => boolean) | undefined {
    if (!this.ownerCurrent() || this.failedSourceReads.size || this.unprovable && !this.namespaceOnlyFailure) return undefined
    const resetEpoch = this.resetEpoch
    const scan = (): boolean => {
      checkpoint()
      if (!this.ownerCurrent() || this.failedSourceReads.size || this.resetEpoch !== resetEpoch
        || this.unprovable && !this.namespaceOnlyFailure) return false
      // Another root may append actual loads without changing existing inputs.
      // Validate ALL current facts, including additions, and fence this scan.
      const revision = this.revision
      const identities = this.identities.snapshot()
      const pathIdentities = this.pathIdentities.snapshot()
      const stale = [...this.namespaceFailures]
      for (const [filePath, fact] of identities) {
        checkpoint()
        const current = requestConfigurationIdentity(filePath, false, () => lookupIdentity(filePath))
        if (current?.identity !== fact.identity) {
          if (!this.canRecoverNamespace(this.identities.get(filePath), current)) return false
          stale.push(filePath)
        }
      }
      for (const [filePath, fact] of pathIdentities) {
        checkpoint()
        const current = requestConfigurationIdentity(filePath, true, () => lookupIdentity(filePath, true))
        if (current?.identity !== fact.identity) {
          if (!this.canRecoverNamespace(this.pathIdentities.get(filePath), current)) return false
          stale.push(filePath)
        }
      }
      checkpoint()
      if (stale.length) {
        // All non-source facts passed. Never turn an unknown SDK/configuration
        // change into permission to replace its original proof.
        if (this.ownerCurrent() && this.resetEpoch === resetEpoch && this.revision === revision
          && !this.failedSourceReads.size && (!this.unprovable || this.namespaceOnlyFailure)) this.onStale?.(stale)
        return false
      }
      return this.ownerCurrent() && !this.unprovable && this.failedSourceReads.size === 0
        && this.resetEpoch === resetEpoch && this.revision === revision
    }
    const current = (): boolean => {
      checkpoint()
      if (!this.ownerCurrent() || this.failedSourceReads.size || this.resetEpoch !== resetEpoch
        || this.unprovable && !this.namespaceOnlyFailure) return false
      return validateRequestInput(this, resetEpoch, this.revision, scan)
    }
    return mode === "capture" ? current : current() ? current : undefined
  }

  private canRecoverNamespace(fact: ExactWitnessFact | undefined, current: ConfigurationInputIdentity | undefined): boolean {
    // An ordinary positive source delta still belongs to snapshot admission,
    // including its real read-window guard. It must not retire the LS before
    // that authoritative read has a chance to reconcile its own retained fact.
    return current !== undefined && fact?.sourceNamespace === true
      && !(fact.regularSource && current.regularSource)
  }

}

/** Include lexical links and genuine absence, including its existing parent owner. */
function lookupIdentity(filePath: string, directoryIdentityOnly = false): ConfigurationInputIdentity | undefined {
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
      return { loadGuard, absenceOwner, regularSource: absent === undefined && lexical.isFile() && target.isFile(),
        witnessPath: absent === undefined ? filePath : path.join(candidate, absent),
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
