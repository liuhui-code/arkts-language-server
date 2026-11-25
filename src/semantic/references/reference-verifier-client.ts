import path from "node:path"
import { AsyncResource } from "node:async_hooks"
import { Worker } from "node:worker_threads"
import { SemanticInputUnavailableError } from "../../core/types/typescript-query-inputs.js"
import { observeTransientWorkerLifetime, type TransientSemanticWorkerObserver } from "../transient-worker-lifecycle.js"
import { ReferenceVerifierJob, type VerifierJobState } from "./reference-verifier-job.js"
import { verifierTicket, type ReferenceVerifierTicket } from "./reference-verifier-ticket.js"
import { reportReferenceVerifierFault, type VerifierFaultReason } from "./reference-verifier-fault.js"

// Captured during module assembly, never by the first request that needs a Worker.
const infrastructure = new AsyncResource("ReferenceVerifierInfrastructure")
const clients = new Set<ReferenceVerifierClient>()
export async function stopReferenceVerifierWorkers(): Promise<void> {
  await Promise.all([...clients].map(client => client.close()))
}

export interface ReferenceVerifierJobOptions {
  readonly workerPath?: string
  readonly trace?: boolean
  readonly isCancellationRequested?: () => boolean
  readonly onTransientWorker?: TransientSemanticWorkerObserver
  readonly onJobState?: (jobId: number, phase: VerifierJobState) => void
}

interface LiveSlot {
  readonly kind: "live"
  readonly worker: Worker
  readonly generation: number
  activeJob?: ReferenceVerifierJob<unknown>
  releaseWhenIdle: boolean
}
interface RetiringSlot {
  readonly kind: "retiring"
  readonly worker: Worker
  readonly generation: number
  readonly done: Promise<void>
  closing: boolean
}
type Slot = { readonly kind: "absent" | "closed" } | LiveSlot | RetiringSlot

/** One physical slot and one serial drain; each job owns its execution context. */
export class ReferenceVerifierClient {
  private slot: Slot = { kind: "absent" }
  private pending = Promise.resolve()
  private readonly jobs = new Set<ReferenceVerifierJob<unknown>>()
  private generation = 0
  private nextJobId = 0
  private failedGeneration = 0

  releaseWhenIdle(): void {
    if (this.slot.kind !== "live") return
    if (this.slot.activeJob) this.slot.releaseWhenIdle = true
    else void this.retire().catch(() => {}) // The retained retiring Promise remains authoritative.
  }

  /** Configuration reset is reusable; owner shutdown is final. */
  dispose(): void {
    for (const job of this.jobs) job.interrupt(new Error("Reference verifier inputs changed"))
    void this.retire().catch(() => {})
  }

  async close(): Promise<void> {
    for (const job of this.jobs) job.interrupt(new Error("Reference verifier owner closed"))
    await this.retire(true)
    await this.pending
  }

  run<Result>(input: { readonly operation: "definition" | "references" }, options: ReferenceVerifierJobOptions): Promise<Result> {
    if (this.slot.kind === "closed" || this.slot.kind === "retiring" && this.slot.closing) {
      return Promise.reject(new Error("Reference verifier owner closed"))
    }
    const id = ++this.nextJobId
    const job = new ReferenceVerifierJob<Result>(id, options.isCancellationRequested, options.onJobState)
    this.jobs.add(job as ReferenceVerifierJob<unknown>)
    const scheduled = this.pending.then(() => job.withContext(() => this.runJob(job, id, input, options)))
    this.pending = scheduled.then(() => undefined, error => { job.finish(error) })
      .finally(() => { this.jobs.delete(job as ReferenceVerifierJob<unknown>) })
    return job.result
  }

  private async runJob<Result>(job: ReferenceVerifierJob<Result>, id: number,
    input: { readonly operation: "definition" | "references" }, options: ReferenceVerifierJobOptions): Promise<void> {
    let slot: LiveSlot | undefined, observed = false, value: Result | undefined, failure: unknown
    try {
      if (this.slot.kind === "retiring") await this.slot.done
      if (this.slot.kind === "closed") throw new Error("Reference verifier owner closed")
      if (!job.start()) return
      const started = performance.now(), reused = this.slot.kind === "live"
      const ticket = { generation: reused ? this.generation : ++this.generation, id }
      slot = this.slot.kind === "live" ? this.slot : this.spawn(input, ticket, options)
      if (slot.activeJob) throw new Error("Reference verifier jobs must be serial")
      slot.activeJob = job as ReferenceVerifierJob<unknown>
      slot.worker.ref()
      observed = true
      this.observe(options, input.operation, "started")
      value = await this.execute<Result>(slot, job, input, ticket, options, started, reused)
    } catch (error) {
      failure = error
      try { await this.retire() } catch (cleanup) { failure = new AggregateError([error, cleanup], "Reference verifier cleanup failed") }
    } finally {
      if (slot?.activeJob === job) slot.activeJob = undefined
      if (observed) this.observe(options, input.operation, "exited")
      if (slot && this.slot === slot) {
        if (slot.releaseWhenIdle) {
          try { await this.retire() } catch (error) { failure ??= error }
        } else slot.worker.unref()
      }
      job.finish(failure, value)
    }
  }

  private spawn(input: object, ticket: ReferenceVerifierTicket, options: ReferenceVerifierJobOptions): LiveSlot {
    let worker: Worker
    try {
      worker = infrastructure.runInAsyncScope(() => new Worker(
        options.workerPath ?? path.join(__dirname, "reference-verifier-worker.cjs"),
        { workerData: { ...input, persistent: true, verifierJob: ticket } }))
    } catch (error) { this.fault("worker-error", ticket.generation); throw error }
    const slot: LiveSlot = { kind: "live", worker, generation: ticket.generation, releaseWhenIdle: false }
    this.slot = slot
    clients.add(this)
    worker.on("error", () => { if (this.slot === slot) this.fault("worker-error", slot.generation) })
    worker.once("exit", () => {
      if (this.slot === slot) {
        this.fault("unexpected-exit", slot.generation)
        this.slot = { kind: "closed" }; clients.delete(this)
      }
    })
    observeTransientWorkerLifetime(worker, "reference-cache", options.onTransientWorker)
    return slot
  }

  private execute<Result>(slot: LiveSlot, job: ReferenceVerifierJob<Result>, input: object,
    ticket: ReferenceVerifierTicket, options: ReferenceVerifierJobOptions, started: number, reused: boolean): Promise<Result> {
    return new Promise((resolve, reject) => {
      let completed = false, workerStartupMs: number | undefined
      const finish = (error?: unknown, value?: Result) => {
        if (completed) return
        completed = true
        job.onInterrupt = undefined
        slot.worker.off("message", onMessage); slot.worker.off("error", onError); slot.worker.off("exit", onExit)
        if (error !== undefined) reject(error)
        else resolve(value!)
      }
      const onError = (error: Error) => job.withContext(() => finish(error))
      const onExit = (code: number) => job.withContext(() => finish(new Error(`Reference verifier worker exited ${code}`)))
      const onMessage = (message: Record<string, any>) => {
        if (completed || this.slot !== slot || slot.activeJob !== job) return
        const received = verifierTicket(message?.verifierJob)
        if (received?.generation === ticket.generation && received.id < ticket.id) return
        job.withContext(() => {
          if (received?.generation !== ticket.generation || received.id !== ticket.id) {
            this.fault("protocol-violation", slot.generation)
            finish(new Error("Reference verifier job identity mismatch")); return
          }
          if (message.phase === "runtime-ready") { if (options.trace) workerStartupMs = performance.now() - started; return }
          if (job.cancelled?.()) { job.interrupt(new Error("Semantic request cancelled")); return }
          if (message.ok !== true) return finish(message.inputUnavailable
            ? new SemanticInputUnavailableError() : new Error(message.message))
          finish(undefined, { ...message, timings: { ...message.timings, workerStartupMs, workerReused: reused } } as Result)
        })
      }
      job.onInterrupt = error => finish(error)
      slot.worker.on("message", onMessage); slot.worker.once("error", onError); slot.worker.once("exit", onExit)
      if (reused) {
        try { slot.worker.postMessage({ ...input, verifierJob: ticket }) }
        catch (error) { this.fault("transport-failed", slot.generation); finish(error) }
      }
    })
  }

  private retire(closing = false): Promise<void> {
    const current = this.slot
    if (current.kind === "retiring") { current.closing ||= closing; return current.done }
    if (current.kind !== "live") {
      if (closing) this.slot = { kind: "closed" }
      return Promise.resolve()
    }
    const retiring: RetiringSlot = { kind: "retiring", worker: current.worker, generation: current.generation,
      closing, done: Promise.resolve().then(() => current.worker.terminate()).then(() => {
        if (this.slot === retiring) this.slot = { kind: retiring.closing ? "closed" : "absent" }
        clients.delete(this)
      }).catch(error => { this.fault("termination-failed", current.generation); throw error }) }
    this.slot = retiring
    return retiring.done
  }

  private observe(options: ReferenceVerifierJobOptions, operation: string, phase: "started" | "exited"): void {
    try { options.onTransientWorker?.(operation === "definition" ? "anchor-job" : "reference-job", phase) }
    catch { /* Optional counters cannot alter semantic outcomes or resource ownership. */ }
  }

  private fault(reason: VerifierFaultReason, generation: number): void {
    if (this.failedGeneration === generation) return
    this.failedGeneration = generation
    try { reportReferenceVerifierFault(reason, generation, this.slot.kind === "live" ? this.slot.activeJob?.id ?? null : null) }
    finally { void this.close().catch(() => {}) }
  }
}
