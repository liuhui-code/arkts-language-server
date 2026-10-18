import path from "node:path"
import { Worker } from "node:worker_threads"
import { SemanticInputUnavailableError } from "../../core/types/typescript-query-inputs.js"
import { observeTransientWorkerLifetime, type TransientSemanticWorkerObserver } from "../transient-worker-lifecycle.js"

const verifierWorkers = new Set<Worker>()
export async function stopReferenceVerifierWorkers(): Promise<void> {
  await Promise.all([...verifierWorkers].map(worker => worker.terminate().catch(() => undefined)))
}

export interface ReferenceVerifierJobOptions {
  readonly workerPath?: string
  readonly trace?: boolean
  readonly isCancellationRequested?: () => boolean
  readonly onTransientWorker?: TransientSemanticWorkerObserver
}

/** One serial Worker; only SDK syntax survives the runtime's per-job LS disposal. */
export class ReferenceVerifierClient {
  private worker?: Worker
  private termination?: Promise<unknown>
  private pending = Promise.resolve()
  private busy = false
  private retire = false

  releaseWhenIdle(): void {
    if (this.busy) this.retire = true
    else this.dispose()
  }

  dispose(): void {
    const worker = this.worker
    this.worker = undefined
    if (worker) this.termination = worker.terminate().catch(() => undefined)
  }

  async run<Result>(input: { readonly operation: "definition" | "references" }, options: ReferenceVerifierJobOptions): Promise<Result> {
    let waitingTimer: NodeJS.Timeout | undefined
    const scheduled = this.pending.then(() => {
      if (waitingTimer) clearInterval(waitingTimer)
      return this.runJob<Result>(input, options)
    })
    this.pending = scheduled.then(() => undefined, () => undefined)
    if (!options.isCancellationRequested) return scheduled
    try {
      return await Promise.race([scheduled, new Promise<never>((_resolve, reject) => {
        waitingTimer = setInterval(() => {
          if (options.isCancellationRequested?.()) reject(new Error("Semantic request cancelled"))
        }, 10)
        waitingTimer.unref()
      })])
    } finally { if (waitingTimer) clearInterval(waitingTimer) }
  }

  private async runJob<Result>(input: { readonly operation: "definition" | "references" }, options: ReferenceVerifierJobOptions): Promise<Result> {
    if (this.busy) throw new Error("Reference verifier jobs must be serial")
    if (options.isCancellationRequested?.()) throw new Error("Semantic request cancelled")
    this.busy = true
    this.retire = false
    const started = performance.now()
    let reused = false
    let workerStartupMs: number | undefined
    let worker: Worker | undefined
    let timer: NodeJS.Timeout | undefined
    let jobStarted = false
    const observeJob = (phase: "started" | "exited") => {
      try { options.onTransientWorker?.(input.operation === "definition" ? "anchor-job" : "reference-job", phase) }
      catch { /* Optional activity metrics cannot change verification. */ }
    }
    try {
      await this.termination
      if (options.isCancellationRequested?.()) throw new Error("Semantic request cancelled")
      reused = !!this.worker
      worker = this.worker ?? new Worker(options.workerPath ?? path.join(__dirname, "reference-verifier-worker.cjs"), {
        workerData: { ...input, persistent: true },
      })
      if (!this.worker) {
        this.worker = worker
        verifierWorkers.add(worker)
        worker.once("exit", () => verifierWorkers.delete(worker!))
        worker.on("error", () => { /* The current job observes errors; idle failures retire the cache. */ })
        worker.once("exit", () => { if (this.worker === worker) this.worker = undefined })
        observeTransientWorkerLifetime(worker, "reference-cache", options.onTransientWorker)
      }
      worker.ref()
      jobStarted = true
      observeJob("started")
      const activeWorker = worker
      return await new Promise<Result>((resolve, reject) => {
        let settled = false
        const finish = (error?: Error, value?: Result) => {
          if (settled) return
          settled = true
          activeWorker.off("message", onMessage)
          activeWorker.off("error", onError)
          activeWorker.off("exit", onExit)
          if (error) reject(error)
          else resolve(value!)
        }
        const onError = (error: Error) => finish(error)
        const onExit = (code: number) => finish(new Error(`Reference verifier worker exited ${code}`))
        const onMessage = (message: Record<string, any>) => {
          if (message.phase === "runtime-ready") {
            if (options.trace) workerStartupMs = performance.now() - started
            return
          }
          if (options.isCancellationRequested?.()) return finish(new Error("Semantic request cancelled"))
          if (message.ok !== true) return finish(message.inputUnavailable
            ? new SemanticInputUnavailableError() : new Error(message.message))
          finish(undefined, { ...message, timings: { ...message.timings, workerStartupMs, workerReused: reused } } as Result)
        }
        activeWorker.on("message", onMessage)
        activeWorker.once("error", onError)
        activeWorker.once("exit", onExit)
        if (options.isCancellationRequested) {
          timer = setInterval(() => {
            if (!options.isCancellationRequested?.()) return
            finish(new Error("Semantic request cancelled"))
          }, 10)
          timer.unref()
        }
        if (reused) activeWorker.postMessage(input)
      })
    } catch (error) {
      this.dispose()
      // Await termination before another job can spawn a replacement heavy Worker.
      await this.termination
      throw error
    } finally {
      if (timer) clearInterval(timer)
      if (jobStarted) observeJob("exited")
      this.busy = false
      if (this.retire) this.dispose()
      else worker?.unref()
    }
  }
}
