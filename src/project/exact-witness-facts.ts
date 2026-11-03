// Exact retained evidence is bounded by owned strings and per-entry bookkeeping.
// This accounting budget is not a V8 heap or process RSS limit.
export const MAX_WITNESS_BYTES = 64 * 1024 * 1024
export const CAPSULE_HEADER_BYTES = 128
const FACT_ENTRY_BYTES = 256
const PATH_ENTRY_BYTES = 128

export function witnessFactBytes(filePath: string, identity: string): number {
  return FACT_ENTRY_BYTES + 2 * (filePath.length + identity.length)
}

export class ExactEvidenceBudget {
  private retained = 0
  constructor(readonly limit = MAX_WITNESS_BYTES) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError("Invalid evidence budget")
  }
  get bytes(): number { return this.retained }
  resize(previous: number, next: number): boolean {
    if (!Number.isSafeInteger(previous) || !Number.isSafeInteger(next)
      || previous < 0 || next < 0 || previous > this.retained) return false
    const result = this.retained - previous + next
    if (!Number.isSafeInteger(result) || result < 0 || result > this.limit) return false
    this.retained = result
    return true
  }
}

export interface ExactWitnessFact {
  identity: string
  sourceNamespace: boolean
  regularSource: boolean
}

/** Each path/kind keeps its original load identity and conservative provenance. */
export class ExactWitnessFacts {
  private readonly records = new Map<string, ExactWitnessFact>()
  constructor(private readonly budget: ExactEvidenceBudget) {}
  get size(): number { return this.records.size }
  get(filePath: string): ExactWitnessFact | undefined { return this.records.get(filePath) }
  has(filePath: string): boolean { return this.records.has(filePath) }
  keys(): IterableIterator<string> { return this.records.keys() }
  [Symbol.iterator](): IterableIterator<[string, ExactWitnessFact]> { return this.records.entries() }
  snapshot(): [string, ExactWitnessFact][] {
    return [...this.records].map(([filePath, fact]) => [filePath, { ...fact }])
  }

  add(filePath: string, identity: string, sourceNamespace: boolean, regularSource: boolean): boolean {
    if (this.records.has(filePath)) throw new Error("A witness fact must not be overwritten")
    if (!this.budget.resize(0, witnessFactBytes(filePath, identity))) return false
    this.records.set(filePath, { identity, sourceNamespace, regularSource: sourceNamespace && regularSource })
    return true
  }

  configurationConsumed(filePath: string): void {
    const fact = this.records.get(filePath)
    if (fact) { fact.sourceNamespace = false; fact.regularSource = false }
  }

  replace(filePath: string, identity: string, regularSource: boolean): boolean {
    const fact = this.records.get(filePath)
    if (!fact) throw new Error("Only a retained witness fact may be replaced")
    if (!this.budget.resize(witnessFactBytes(filePath, fact.identity), witnessFactBytes(filePath, identity))) return false
    fact.identity = identity
    if (fact.sourceNamespace && regularSource) fact.regularSource = true
    return true
  }

  delete(filePath: string): void {
    const fact = this.records.get(filePath)
    if (!fact) return
    this.budget.resize(witnessFactBytes(filePath, fact.identity), 0)
    this.records.delete(filePath)
  }
  clear(): void { for (const filePath of this.records.keys()) this.delete(filePath) }
}

/** Failure paths share the fact budget; an overflow must remain fail-closed. */
export class ExactWitnessPaths {
  private readonly paths = new Set<string>()
  constructor(private readonly budget: ExactEvidenceBudget) {}
  get size(): number { return this.paths.size }
  has(filePath: string): boolean { return this.paths.has(filePath) }
  [Symbol.iterator](): IterableIterator<string> { return this.paths.values() }
  add(filePath: string): boolean {
    if (this.paths.has(filePath)) return true
    if (!this.budget.resize(0, PATH_ENTRY_BYTES + 2 * filePath.length)) return false
    this.paths.add(filePath)
    return true
  }
  delete(filePath: string): boolean {
    if (!this.paths.delete(filePath)) return false
    this.budget.resize(PATH_ENTRY_BYTES + 2 * filePath.length, 0)
    return true
  }
  clear(): void { for (const filePath of this.paths) this.delete(filePath) }
}

export class ExactEvidenceCapacityError extends Error {
  constructor() { super("Retained input evidence exceeds its metadata budget") }
}

export interface CapturedWitnessFact {
  readonly filePath: string
  readonly identity: string
  readonly directoryOnly: boolean
}

/** Copy into the remaining admission allowance, never allocate a full capsule first. */
export class ExactWitnessCapsule {
  private readonly budget: ExactEvidenceBudget
  private readonly facts: CapturedWitnessFact[] = []
  private failed = false
  private sealed = false
  constructor(limit: number) {
    this.budget = new ExactEvidenceBudget(limit)
    if (!this.budget.resize(0, CAPSULE_HEADER_BYTES)) throw new ExactEvidenceCapacityError()
  }
  append(filePath: string, identity: string, directoryOnly: boolean): void {
    if (this.sealed) throw new Error("A retained witness capsule is immutable")
    if (this.failed || !this.budget.resize(0, witnessFactBytes(filePath, identity))) {
      this.failed = true
      throw new ExactEvidenceCapacityError()
    }
    this.facts.push(Object.freeze({ filePath, identity, directoryOnly }))
  }
  finish(): { readonly facts: readonly CapturedWitnessFact[]; readonly accountedBytes: number } {
    if (this.failed) throw new ExactEvidenceCapacityError()
    this.sealed = true
    return Object.freeze({ facts: Object.freeze(this.facts), accountedBytes: this.budget.bytes })
  }
}
