import { lookupIdentity } from "./configuration-lookup-identity.js"
export { retainedInputFactsCurrent } from "./retained-input-facts.js"
import type { RetainedInputFact } from "./retained-input-facts.js"
import type { SourceReadOrigin } from "./source-read-origin.js"
import fs from "node:fs"
import path from "node:path"
import { configurationSourcePlan, type ConfigurationSourcePlan } from "./configuration-source-plan.js"
import { configurationSourceIdentity } from "./configuration-source-identity.js"
import { requestConfigurationIdentity, validateRequestInput, compareRetainedConfigurationFacts, type ConfigurationInputIdentity, type ConfigurationValidationIdentity } from "./request-input-validation.js"

// Failure details are bounded; actual load-owned evidence is required state, not an evictable cache.
const MAX_NAMESPACE_FAILURE_DETAILS = 4096

export type ConfigurationFreshnessMode = "validate" | "capture"

export interface RetainedConfigurationProof {
  readonly factCount: number
  readonly facts?: readonly RetainedInputFact[]
  current(checkpoint: () => void): boolean
}

export interface ConfigurationWitnessFailure {
  readonly reason: string
  readonly sourcePath?: string
  readonly retainedPaths: number
}

/** Evidence belongs to the actual load/lookup, never to a later cache hit. */
export class LoadedConfigurationWitness {
  private readonly identities = new Map<string, string>()
  private readonly pathIdentities = new Map<string, string>()
  private readonly sourcePlans = new Map<string, ConfigurationSourcePlan | undefined>()
  private readonly failedSourceReads = new Set<string>()
  private revision = 0
  private resetEpoch = 0
  private unprovable = false
  private sourceNamespaceDepth = 0
  private namespaceOnlyFailure = true
  private sourceResetOnlyFailure = true
  private readonly namespaceFailures = new Set<string>()
  private readonly namespaceFacts = new Set<string>()
  private readonly regularSourceFacts = new Set<string>()

  constructor(private readonly onUnprovable?: (failure: ConfigurationWitnessFailure) => void,
    private readonly ownerCurrent: () => boolean = () => true,
    private readonly onStale?: (namespacePaths: readonly string[]) => void) {}

  /** The compiler, rather than configuration discovery, owns these source probes. */
  observeSourceNamespace<T>(filePath: string, load: () => T, presence = false): T {
    this.sourceNamespaceDepth += 1
    try { return presence ? this.observePathLoad(filePath, load, true) : this.observe(filePath, load) }
    finally { this.sourceNamespaceDepth -= 1 }
  }

  private noteFact(records: Map<string, string>, filePath: string, regularSource: boolean): void {
    const key = `${records === this.pathIdentities ? 1 : 0}\0${filePath}`
    if (!this.sourceNamespaceDepth) { this.namespaceFacts.delete(key); this.regularSourceFacts.delete(key) }
    else if (!records.has(filePath)) {
      this.namespaceFacts.add(key)
      if (regularSource) this.regularSourceFacts.add(key)
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
        const coveredOwner = owner && (this.identities.get(owner[0]) === owner[1] || negativeLeaf)
          ? owner : undefined
        const witnessPath = coveredOwner?.[0] ?? before.witnessPath
        const identity = coveredOwner?.[1] ?? before.identity
        this.noteFact(this.identities, witnessPath, witnessPath === resolved && before.regularSource && after.regularSource)
        const previous = this.identities.get(witnessPath)
        if (previous !== undefined && previous !== identity) this.rejectLoadedIdentityChange(resolved, witnessPath,
          before.regularSource && after.regularSource)
        else if (previous === undefined) {
          this.identities.set(witnessPath, identity); this.revision += 1
        }
      }
    }
  }

  /** A pure derived value may retain the original guarded byte-read identity.
   * Never read the current namespace here or replace an existing conflicting fact. */
  retainSourceRead(origin: SourceReadOrigin): void {
    const previous = this.pathIdentities.get(origin.file)
    if (previous !== undefined && previous !== origin.configurationIdentity) {
      this.markUnprovable("loaded-identity-changed", origin.file)
    } else if (previous === undefined) {
      this.pathIdentities.set(origin.file, origin.configurationIdentity)
      this.revision++
    }
  }

  /** A cached realpath depends on path identity, not sibling directory contents. */
  observePath<T>(filePath: string, load: () => T): T {
    return this.observePathLoad(filePath, load, false)
  }

  /** Resolution metadata only. Actual source/configuration byte loads keep their
   * original raw guards; unknown paths and links also take the raw fallback. */
  observeResolutionPath<T>(filePath: string, load: () => T, checkpoint: () => void): T {
    return this.observePathLoad(filePath, load, false, checkpoint)
  }

  /** A boolean lookup consumes existence, never a directory's children. */
  observePresence(filePath: string, load: () => boolean): boolean {
    return this.observePathLoad(filePath, load, true)
  }

  private observePathLoad<T>(filePath: string, load: () => T, presence: boolean, resolutionCheckpoint?: () => void): T {
    const resolved = path.resolve(filePath)
    const identity = () => resolutionCheckpoint
      ? configurationSourceIdentity(resolved, () => lookupIdentity(resolved, true), resolutionCheckpoint)
      : lookupIdentity(resolved, true)
    const before = identity()
    let result: T | undefined
    try { result = load(); return result }
    finally {
      const after = identity()
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
        this.noteFact(records, witnessPath, witnessPath === resolved && before.regularSource && after.regularSource)
        const previous = records.get(witnessPath)
        if (previous !== undefined && previous !== identity) this.rejectLoadedIdentityChange(resolved, witnessPath,
          !directory && before.regularSource && after.regularSource)
        else if (previous === undefined) {
          records.set(witnessPath, identity); this.revision += 1
        }
      }
    }
  }

  markUnprovable(reason = "caller-invalidated", sourcePath?: string): void {
    const sourceFailure = this.sourceNamespaceDepth > 0 && sourcePath !== undefined
      && ["loaded-identity-changed", "changed-during-load", "identity-unavailable"].includes(reason)
      && this.namespaceFailures.size < MAX_NAMESPACE_FAILURE_DETAILS
    if (!sourceFailure) this.sourceResetOnlyFailure = false
    else this.namespaceFailures.add(sourcePath)
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
    try { this.onUnprovable?.({ reason, sourcePath, retainedPaths: this.identities.size + this.pathIdentities.size }) }
    catch { /* Observability must never change admission or the complete fallback. */ }
  }

  reset(): void {
    this.sourcePlans.clear()
    this.identities.clear()
    this.pathIdentities.clear()
    this.failedSourceReads.clear()
    this.namespaceFacts.clear()
    this.regularSourceFacts.clear()
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
        this.sourcePlans.delete(facts.get(file)!)
        facts.delete(file)
        this.namespaceFacts.delete(`${facts === this.pathIdentities ? 1 : 0}\0${file}`)
        this.regularSourceFacts.delete(`${facts === this.pathIdentities ? 1 : 0}\0${file}`)
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
      // This path already owns a retained fact, so the set cannot exceed the
      // actual retained read set. Only a later authoritative read of this same source can
      // recover it; unknown configuration failures remain globally unprovable.
      if (!this.failedSourceReads.has(resolved)) {
        this.failedSourceReads.add(resolved)
        this.revision += 1
        this.reportFailure("changed-source-read-unproven", resolved)
      }
      return
    }
    // This is a new authoritative byte read, not a cache-hit restamp. Other
    // configuration, directory and negative lookup facts retain their original load.
    for (const facts of [this.identities, this.pathIdentities]) {
      const key = `${facts === this.pathIdentities ? 1 : 0}\0${resolved}`
      if (this.namespaceFacts.has(key)) this.regularSourceFacts.add(key)
      if (facts.has(resolved) && facts.get(resolved) !== before.identity) {
        this.sourcePlans.delete(facts.get(resolved)!)
        facts.set(resolved, before.identity)
        this.revision += 1
      }
    }
    if (this.failedSourceReads.delete(resolved)) this.revision += 1
  }

  /** Copy only original non-source facts; the capsule retains no compiler, resolver or witness owner. */
  captureConfigurationBeforeSourceReset(checkpoint: () => void,
    sourceNamespace: (filePath: string) => boolean): RetainedConfigurationProof {
    checkpoint()
    const epoch = this.resetEpoch, revision = this.revision
    let valid = !(this.unprovable && !this.sourceResetOnlyFailure)
      && [...this.namespaceFailures, ...this.failedSourceReads].every(file => sourceNamespace(file))
    const facts: RetainedInputFact[] = []
    for (const [kind, records] of [this.identities, this.pathIdentities].entries()) {
      for (const [filePath, identity] of records) {
        checkpoint()
        if (this.namespaceFacts.has(`${kind}\0${filePath}`) && sourceNamespace(filePath)) continue
        facts.push(Object.freeze({ filePath, identity, directoryOnly: kind === 1 }))
      }
    }
    valid &&= this.resetEpoch === epoch && this.revision === revision
    Object.freeze(facts)
    return Object.freeze({ factCount: facts.length, ...(valid && this.ownerCurrent() ? { facts } : {}), current: (boundary: () => void): boolean => {
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

  /** Loaded facts stay fixed; final observations never inherit query-phase observations. */
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
      const factsCurrent = compareRetainedConfigurationFacts(this, resetEpoch, revision, () => {
        const identities = [...this.identities]
        const pathIdentities = [...this.pathIdentities]
        const stale = [...this.namespaceFailures]
        for (const [filePath, identity] of identities) {
          checkpoint()
          const current = requestConfigurationIdentity(filePath, false, identity, () =>
            configurationSourceIdentity(filePath, () => lookupIdentity(filePath), checkpoint, this.sourcePlan(identity)))
          if (current?.identity !== identity) {
            if (!this.canRecoverNamespace(`0\0${filePath}`, current)) return false
            stale.push(filePath)
          }
        }
        for (const [filePath, identity] of pathIdentities) {
          checkpoint()
          const current = requestConfigurationIdentity(filePath, true, identity, () =>
            configurationSourceIdentity(filePath, () => lookupIdentity(filePath, true), checkpoint, this.sourcePlan(identity)))
          if (current?.identity !== identity) {
            if (!this.canRecoverNamespace(`1\0${filePath}`, current)) return false
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
        return true
      })
      checkpoint()
      if (!factsCurrent) return false
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

  /** The keys are existing load-owned facts; reset, retirement and actual reload
   * release their parsed representations. A cache hit still performs raw IO. */
  private sourcePlan(identity: string): ConfigurationSourcePlan | undefined {
    if (!this.sourcePlans.has(identity)) this.sourcePlans.set(identity, configurationSourcePlan(identity))
    return this.sourcePlans.get(identity)
  }

  private canRecoverNamespace(key: string, current: ConfigurationValidationIdentity | undefined): boolean {
    // An ordinary positive source delta still belongs to snapshot admission,
    // including its real read-window guard. It must not retire the LS before
    // that authoritative read has a chance to reconcile its own retained fact.
    return current !== undefined && this.namespaceFacts.has(key)
      && !(this.regularSourceFacts.has(key) && current.regularSource)
  }

}
