import { createContextLease, type SemanticContextLease } from "./context-lease.js"

export type SemanticMemoryLevel = "level0" | "level1" | "level2" | "level3"

export interface SemanticManagedContextStats {
  readonly projectFiles: number
  readonly openDocuments: number
}

export interface SemanticManagedContext {
  trim(): void
  dispose(): void
  stats(): SemanticManagedContextStats
}

export interface SemanticCoordinatorOptions<Context extends SemanticManagedContext> {
  readonly maxResidentContexts?: number | null
  readonly costAwareEviction?: boolean
  readonly readMemoryPressure?: () => SemanticMemoryLevel
  /** A separate serial slot shares pressure accounting but cannot flush interaction recency. */
  readonly isScanContext?: (contextId: string) => boolean
  readonly createContext: (contextId: string) => Context
  readonly onLifecycle?: (event: "create" | "reuse" | "trim" | "evict" | "cost", fields: {
    readonly contextSequence: number
    readonly reason: string
    readonly leaseCount: number
    readonly residentContextCount: number
    readonly rebuildCostMs?: number
  }) => void
}

export interface SemanticCoordinatorStats extends SemanticManagedContextStats {
  readonly residentContextCount: number
  readonly leaseCount: number
}

interface ResidentContext<Context> {
  readonly context: Context
  readonly sequence: number
  leaseCount: number
  lastAccess: number
  trimmed: boolean
  rebuildCostMs?: number
}

export class SemanticCoordinator<Context extends SemanticManagedContext> {
  readonly #maxResidentContexts: number | null
  readonly #costAwareEviction: boolean
  readonly #readMemoryPressure: SemanticCoordinatorOptions<Context>["readMemoryPressure"]
  readonly #createContext: (contextId: string) => Context
  readonly #onLifecycle: SemanticCoordinatorOptions<Context>["onLifecycle"]
  readonly #isScanContext: (contextId: string) => boolean
  readonly #contexts = new Map<string, ResidentContext<Context>>()
  #accessClock = 0
  #creationClock = 0

  constructor(options: SemanticCoordinatorOptions<Context>) {
    if (options.maxResidentContexts != null
      && (!Number.isSafeInteger(options.maxResidentContexts) || options.maxResidentContexts < 1)) {
      throw new Error("maxResidentContexts must be a positive integer")
    }
    this.#maxResidentContexts = options.maxResidentContexts ?? null
    this.#costAwareEviction = options.costAwareEviction === true
    this.#readMemoryPressure = options.readMemoryPressure
    this.#createContext = options.createContext
    this.#onLifecycle = options.onLifecycle
    this.#isScanContext = options.isScanContext ?? (() => false)
  }

  acquire(contextId: string, promoteRecency = true): SemanticContextLease<Context> {
    if (!contextId) throw new Error("contextId is required")
    let resident = this.#contexts.get(contextId)
    const reused = resident !== undefined
    if (!resident) {
      this.#makeRoom(contextId)
      resident = {
        context: this.#createContext(contextId),
        sequence: ++this.#creationClock,
        leaseCount: 0,
        lastAccess: 0,
        trimmed: false,
      }
      this.#contexts.set(contextId, resident)
    }
    resident.leaseCount += 1
    if (promoteRecency) resident.lastAccess = ++this.#accessClock
    this.#observe(reused ? "reuse" : "create", resident, reused ? "acquire" : "missing")
    return createContextLease(contextId, resident.context, () => {
      const current = this.#contexts.get(contextId)
      if (current === undefined || current !== resident || current.leaseCount === 0) return
      current.leaseCount -= 1
    })
  }

  remove(contextId: string, reason = "explicit-removal"): boolean {
    const resident = this.#contexts.get(contextId)
    if (!resident || resident.leaseCount > 0) return false
    this.#evict(contextId, resident, reason)
    return true
  }

  peek(contextId: string): Context | undefined {
    return this.#contexts.get(contextId)?.context
  }

  markSemanticWork(contextId: string, context: Context): void {
    const resident = this.#contexts.get(contextId)
    if (resident?.context === context) resident.trimmed = false
  }

  recordRebuildCost(contextId: string, context: Context, rebuildCostMs: number): void {
    const resident = this.#contexts.get(contextId)
    if (resident?.context !== context || !Number.isFinite(rebuildCostMs) || rebuildCostMs <= 0) return
    resident.rebuildCostMs = rebuildCostMs
    this.#observe("cost", resident, "compiler-build")
  }

  forEachContext(visitor: (context: Context, contextId: string) => void): void {
    for (const [contextId, resident] of this.#contexts) visitor(resident.context, contextId)
  }

  applyMemoryPressure(level: SemanticMemoryLevel): SemanticMemoryLevel {
    if (level === "level0" || level === "level1") return level
    const requestedLevel = level
    const candidates = this.#coldUnleasedContexts()
    if (level === "level3") this.#rankByRebuildCost(candidates)
    for (const [contextId, resident] of candidates) {
      if (level === "level2") {
        if (!resident.trimmed) {
          resident.context.trim()
          resident.trimmed = true
          this.#observe("trim", resident, "memory-level2")
        }
      } else this.#evict(contextId, resident, "memory-level3")
      if (this.#readMemoryPressure) {
        level = this.#readMemoryPressure()
        if (level !== requestedLevel) break
      }
    }
    return level
  }

  contextIds(): string[] {
    return [...this.#contexts.entries()]
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess)
      .map(([contextId]) => contextId)
  }

  stats(): SemanticCoordinatorStats {
    let leaseCount = 0
    let projectFiles = 0
    let openDocuments = 0
    for (const resident of this.#contexts.values()) {
      leaseCount += resident.leaseCount
      const context = resident.context.stats()
      projectFiles += context.projectFiles
      openDocuments += context.openDocuments
    }
    return {
      residentContextCount: this.#contexts.size,
      leaseCount,
      projectFiles,
      openDocuments,
    }
  }

  dispose(reason = "shutdown"): void {
    for (const [contextId, resident] of this.#contexts) this.#evict(contextId, resident, reason)
  }

  #makeRoom(contextId: string): void {
    if (this.#maxResidentContexts === null) return
    const scan = this.#isScanContext(contextId)
    const inPool = (id: string) => this.#isScanContext(id) === scan
    const limit = scan ? 1 : this.#maxResidentContexts
    while ([...this.#contexts.keys()].filter(inPool).length >= limit) {
      const candidates = this.#coldUnleasedContexts().filter(([id]) => inPool(id))
      const useCost = this.#rankByRebuildCost(candidates)
      const candidate = candidates[0]
      if (!candidate) throw new Error("all semantic contexts are leased")
      this.#evict(candidate[0], candidate[1], useCost ? "capacity-cost" : "capacity-lru")
    }
  }

  #coldUnleasedContexts(): Array<[string, ResidentContext<Context>]> {
    return [...this.#contexts.entries()]
      .filter(([, resident]) => resident.leaseCount === 0)
      .sort((left, right) => Number(this.#isScanContext(right[0])) - Number(this.#isScanContext(left[0]))
        || left[1].lastAccess - right[1].lastAccess)
  }

  #rankByRebuildCost(candidates: Array<[string, ResidentContext<Context>]>): boolean {
    const useCost = this.#costAwareEviction && candidates.length > 1
      && candidates.every(([, resident]) => resident.rebuildCostMs !== undefined)
      && candidates.some(([, resident]) => resident.rebuildCostMs !== candidates[0]![1].rebuildCostMs)
    if (useCost) candidates.sort((left, right) => left[1].rebuildCostMs! - right[1].rebuildCostMs!
      || left[1].lastAccess - right[1].lastAccess)
    return useCost
  }

  #evict(contextId: string, resident: ResidentContext<Context>, reason: string): void {
    resident.context.dispose()
    this.#contexts.delete(contextId)
    this.#observe("evict", resident, reason)
  }

  #observe(event: Parameters<NonNullable<SemanticCoordinatorOptions<Context>["onLifecycle"]>>[0],
    resident: ResidentContext<Context>, reason: string): void {
    if (!this.#onLifecycle) return
    try {
      this.#onLifecycle(event, { contextSequence: resident.sequence, reason,
        leaseCount: resident.leaseCount, residentContextCount: this.#contexts.size,
        ...(resident.rebuildCostMs === undefined ? {} : { rebuildCostMs: resident.rebuildCostMs }) })
    } catch { /* Optional observation cannot alter context lifetime or query success. */ }
  }
}
