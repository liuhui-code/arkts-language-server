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
  readonly maxResidentContexts: number
  readonly createContext: (contextId: string) => Context
  readonly onLifecycle?: (event: "create" | "reuse" | "trim" | "evict", fields: {
    readonly contextSequence: number
    readonly reason: string
    readonly leaseCount: number
    readonly residentContextCount: number
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
}

export class SemanticCoordinator<Context extends SemanticManagedContext> {
  readonly #maxResidentContexts: number
  readonly #createContext: (contextId: string) => Context
  readonly #onLifecycle: SemanticCoordinatorOptions<Context>["onLifecycle"]
  readonly #contexts = new Map<string, ResidentContext<Context>>()
  #accessClock = 0
  #creationClock = 0

  constructor(options: SemanticCoordinatorOptions<Context>) {
    if (!Number.isSafeInteger(options.maxResidentContexts) || options.maxResidentContexts < 1) {
      throw new Error("maxResidentContexts must be a positive integer")
    }
    this.#maxResidentContexts = options.maxResidentContexts
    this.#createContext = options.createContext
    this.#onLifecycle = options.onLifecycle
  }

  acquire(contextId: string): SemanticContextLease<Context> {
    if (!contextId) throw new Error("contextId is required")
    let resident = this.#contexts.get(contextId)
    const reused = resident !== undefined
    if (!resident) {
      this.#makeRoom()
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
    resident.lastAccess = ++this.#accessClock
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

  forEachContext(visitor: (context: Context, contextId: string) => void): void {
    for (const [contextId, resident] of this.#contexts) visitor(resident.context, contextId)
  }

  applyMemoryPressure(level: SemanticMemoryLevel): void {
    if (level === "level0" || level === "level1") return
    for (const [contextId, resident] of this.#coldUnleasedContexts()) {
      if (level === "level2") {
        if (!resident.trimmed) {
          resident.context.trim()
          resident.trimmed = true
          this.#observe("trim", resident, "memory-level2")
        }
        continue
      }
      this.#evict(contextId, resident, "memory-level3")
    }
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

  #makeRoom(): void {
    while (this.#contexts.size >= this.#maxResidentContexts) {
      const candidate = this.#coldUnleasedContexts()[0]
      if (!candidate) throw new Error("all semantic contexts are leased")
      this.#evict(candidate[0], candidate[1], "capacity-lru")
    }
  }

  #coldUnleasedContexts(): Array<[string, ResidentContext<Context>]> {
    return [...this.#contexts.entries()]
      .filter(([, resident]) => resident.leaseCount === 0)
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess)
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
        leaseCount: resident.leaseCount, residentContextCount: this.#contexts.size })
    } catch { /* Optional observation cannot alter context lifetime or query success. */ }
  }
}
