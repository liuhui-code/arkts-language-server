import { SemanticWorkerSupervisorError } from "./semantic-worker-supervisor.js"
import type { SemanticWorkerRecycle } from "./semantic-worker-recycle.js"
import type { SemanticWorkerMutationTracker } from "./semantic-worker-mutation-tracker.js"
import type { StructuredLogger } from "../observability/logger.js"
import { setTimeout as delay } from "node:timers/promises"
import { isDeepStrictEqual } from "node:util"

interface RecoveryOptions {
  readonly recycle: SemanticWorkerRecycle
  readonly mutations: SemanticWorkerMutationTracker
  readonly disposed: () => boolean
  readonly options: () => Parameters<SemanticWorkerRecycle["recover"]>[0]
  readonly logger?: StructuredLogger
}

/** The parent owns restart policy; crashed epochs never serve another request. */
export class SemanticWorkerFailureRecovery {
  private readonly restarts: number[] = []
  private pending: Promise<void> | undefined
  private failure: unknown
  private automaticRestarts = 0
  private failedInputRevision = 0
  private inputRevision = 0
  private blockedRevision = 0
  private readonly configurations = new Map<string, unknown>()
  private probing = false
  private stopping = false
  private readonly abort = new AbortController()
  constructor(private readonly owner: RecoveryOptions) {}
  fail(error: unknown): void {
    if (!this.failure) this.blockedRevision = this.inputRevision
    this.failure = error instanceof SemanticWorkerSupervisorError ? error
      : new SemanticWorkerSupervisorError("worker-unavailable", { cause: error })
  }
  inputChanged(configuration?: string, value?: unknown): void {
    if (configuration) {
      if (this.configurations.has(configuration) && isDeepStrictEqual(this.configurations.get(configuration), value)) return
      this.configurations.set(configuration, value)
    }
    this.inputRevision++
  }
  get acceptsMutations(): boolean { return !this.failure && !this.stopping && !this.owner.disposed() }
  healthy(): void {
    if (this.failure) return
    if (this.inputRevision > this.failedInputRevision) this.automaticRestarts = 0
    this.probing = false
  }
  assertHealthy(explicit = true): void {
    if (this.owner.disposed()) throw new Error("Semantic worker is disposed")
    if (this.failure) throw this.failure
    if (this.probing && !explicit) throw new SemanticWorkerSupervisorError("worker-unavailable")
  }

  /** Only changed authoritative input plus explicit work can probe an open circuit. */
  async admit(explicit: boolean): Promise<void> {
    // The half-open semantic proof belongs to explicit work. A diagnostic
    // resumed by replay must not occupy the probe before its caller is sent.
    if (this.probing && !explicit) throw new SemanticWorkerSupervisorError("worker-unavailable")
    if (!this.failure || !explicit) return
    if (this.pending) await this.pending
    if (!this.failure || this.stopping || this.owner.disposed()) return
    this.expireRateWindow()
    if (this.inputRevision <= this.blockedRevision || this.restarts.length >= 3) return
    this.probing = true
    this.blockedRevision = this.inputRevision
    this.failure = undefined
    this.restarts.push(Date.now())
    this.owner.logger?.info("semantic.worker.recovery.half-open", { inputRevision: this.inputRevision })
    await this.recover(true)
  }

  private expireRateWindow(): void {
    while (this.restarts.length && Date.now() - this.restarts[0] > 180_000) this.restarts.shift()
  }

  workerFailed(error: unknown): void {
    if (this.owner.disposed() || this.stopping) return
    this.failedInputRevision = this.inputRevision
    this.expireRateWindow()
    if (this.pending || this.owner.recycle.active) {
      this.fail(error)
      void this.owner.recycle.retire().catch(failure => this.fail(failure))
      return
    }
    const restart = !this.probing && this.restarts.length < 3 && this.automaticRestarts < 3
    if (restart) { this.restarts.push(Date.now()); this.automaticRestarts++ }
    else {
      this.fail(error)
      this.owner.logger?.error("semantic.worker.recovery.stopped", {
        restarts: this.restarts.length, automaticRestarts: this.automaticRestarts, failedInputRevision: this.failedInputRevision })
    }
    this.recover(restart)
  }

  mutationFailed(error: unknown): void {
    if (this.owner.disposed()) return
    if (error instanceof SemanticWorkerSupervisorError && error.code === "restart-required") this.workerFailed(error)
    else this.fail(error)
  }

  private recover(restart: boolean): Promise<void> {
    if (this.pending) return this.pending
    this.owner.mutations.retire()
    const backoffMs = Math.min(1000, 250 * 2 ** Math.max(0, this.automaticRestarts - 1))
    const task = this.owner.recycle.recover(this.owner.options(), restart,
      () => delay(backoffMs, undefined, { signal: this.abort.signal })).catch(error => this.fail(error))
      .finally(() => { if (this.pending === task) this.pending = undefined })
    this.pending = task
    return task
  }

  async settle(): Promise<void> {
    this.stopping = true
    this.abort.abort()
    await this.owner.recycle.retire(true)
    await this.pending
  }
}
