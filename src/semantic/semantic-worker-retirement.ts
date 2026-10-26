import type { Worker } from "node:worker_threads"
import { shutdownSemanticWorker } from "./semantic-worker-shutdown.js"

/** Owns a physical handle until exit, independently of a caller's terminal. */
export class SemanticWorkerRetirement {
  readonly threadId: number
  readonly #exit: Promise<void>
  #exited: boolean
  #pending: Promise<number> | undefined
  #failure: unknown

  constructor(readonly worker: Worker, readonly drain: () => Promise<void>) {
    this.threadId = worker.threadId
    this.#exited = worker.threadId === -1
    this.#exit = new Promise(resolve => {
      if (this.#exited) resolve()
      else worker.once("exit", () => { this.#exited = true; resolve() })
    })
  }

  get exited(): boolean { return this.#exited }

  stop(retry: boolean): Promise<number> {
    if (this.#pending) return this.#pending
    if (this.#failure && !this.#exited && !retry) return Promise.reject(this.#failure)
    const task = (async () => {
      try { await this.drain() }
      finally { if (!this.#exited) await shutdownSemanticWorker(this.worker) }
      await this.#exit
      return this.threadId
    })().catch(error => { this.#failure = error; throw error })
      .finally(() => { if (this.#pending === task) this.#pending = undefined })
    this.#pending = task
    return task
  }
}
