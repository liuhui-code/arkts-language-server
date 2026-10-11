import { SemanticWorkerHost } from "./semantic-worker-host.js"
import { SemanticWorkerRecycle } from "./semantic-worker-recycle.js"
import type { RootSemanticWorkerMutationInput } from "./semantic-worker-supervisor.js"

/** Tracks mutation settlement for lifecycle quiescence; the supervisor owns bounds. */
export class SemanticWorkerMutationTracker {
  readonly #pending = new Set<Promise<void>>()
  #generation = 0

  constructor(
    readonly host: SemanticWorkerHost,
    readonly recycle: SemanticWorkerRecycle,
    readonly failed: (error: unknown) => void,
  ) {}

  get pendingCount(): number { return this.#pending.size }

  retire(): void { this.#generation += 1 }

  mutate(rootUri: string, mutation: RootSemanticWorkerMutationInput): void {
    if (this.recycle.defer(rootUri, mutation)) return
    const generation = this.#generation
    try {
      const pending = this.host.supervisor(rootUri).mutate(mutation)
      this.#pending.add(pending)
      void pending.catch(error => {
        if (generation === this.#generation) this.failed(error)
      }).finally(() => {
        this.#pending.delete(pending)
        this.recycle.retryAutomatic()
      })
    } catch (error) {
      this.failed(error)
    }
  }
}
