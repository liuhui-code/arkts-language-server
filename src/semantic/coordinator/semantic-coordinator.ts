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
}

export interface SemanticCoordinatorStats extends SemanticManagedContextStats {
  readonly residentContextCount: number
  readonly leaseCount: number
}

interface ResidentContext<Context> {
  readonly context: Context
  leaseCount: number
  lastAccess: number
  trimmed: boolean
}

export class SemanticCoordinator<Context extends SemanticManagedContext> {
  readonly #maxResidentContexts: number
  readonly #createContext: (contextId: string) => Context
  readonly #contexts = new Map<string, ResidentContext<Context>>()
  #accessClock = 0

  constructor(options: SemanticCoordinatorOptions<Context>) {
    if (!Number.isSafeInteger(options.maxResidentContexts) || options.maxResidentContexts < 1) {
      throw new Error("maxResidentContexts must be a positive integer")
    }
    this.#maxResidentContexts = options.maxResidentContexts
    this.#createContext = options.createContext
  }

  acquire(contextId: string): SemanticContextLease<Context> {
    if (!contextId) throw new Error("contextId is required")
    let resident = this.#contexts.get(contextId)
    if (!resident) {
      this.#makeRoom()
      resident = {
        context: this.#createContext(contextId),
        leaseCount: 0,
        lastAccess: 0,
        trimmed: false,
      }
      this.#contexts.set(contextId, resident)
    }
    resident.leaseCount += 1
    resident.lastAccess = ++this.#accessClock
    return createContextLease(contextId, resident.context, () => {
      const current = this.#contexts.get(contextId)
      if (current === undefined || current !== resident || current.leaseCount === 0) return
      current.leaseCount -= 1
    })
  }

  remove(contextId: string): boolean {
    const resident = this.#contexts.get(contextId)
    if (!resident || resident.leaseCount > 0) return false
    resident.context.dispose()
    this.#contexts.delete(contextId)
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
        }
        continue
      }
      resident.context.dispose()
      this.#contexts.delete(contextId)
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

  dispose(): void {
    for (const resident of this.#contexts.values()) resident.context.dispose()
    this.#contexts.clear()
  }

  #makeRoom(): void {
    while (this.#contexts.size >= this.#maxResidentContexts) {
      const candidate = this.#coldUnleasedContexts()[0]
      if (!candidate) throw new Error("all semantic contexts are leased")
      candidate[1].context.dispose()
      this.#contexts.delete(candidate[0])
    }
  }

  #coldUnleasedContexts(): Array<[string, ResidentContext<Context>]> {
    return [...this.#contexts.entries()]
      .filter(([, resident]) => resident.leaseCount === 0)
      .sort((left, right) => left[1].lastAccess - right[1].lastAccess)
  }
}
