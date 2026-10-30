import { LSPErrorCodes, ResponseError } from "vscode-languageserver/node.js"

import { MAX_COMPLETION_RESOLUTIONS } from "./completion-resolution-store.js"

interface PendingResolution {
  start(): void
  cancel(reason: unknown): void
}

interface WorkspaceQueue {
  active?: PendingResolution
  waiting: PendingResolution[]
}

/** Admit item prefetch to the serial Worker without filling its shared physical queue. */
export class CompletionResolutionQueue {
  readonly #workspaces = new Map<string, WorkspaceQueue>()
  #pending = 0
  #closed = false

  run<T>(workspaceId: string, signal: AbortSignal, execute: () => Promise<T>): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason)
    if (this.#closed) return Promise.reject(new Error("Completion resolution queue closed"))
    if (this.#pending >= MAX_COMPLETION_RESOLUTIONS) {
      return Promise.reject(new ResponseError(LSPErrorCodes.RequestFailed, "Completion detail queue is full"))
    }
    const queue = this.#workspaces.get(workspaceId) ?? { waiting: [] }
    this.#workspaces.set(workspaceId, queue)
    this.#pending += 1
    return new Promise<T>((resolve, reject) => {
      const finished = () => {
        signal.removeEventListener("abort", aborted)
        this.#pending -= 1
      }
      const job: PendingResolution = {
        start: () => {
          queue.active = job
          // A cancelled active job still owns admission until the Worker acknowledges it.
          void Promise.resolve().then(() => {
            if (signal.aborted) throw signal.reason
            return execute()
          }).then(resolve, reject).finally(() => {
            finished()
            queue.active = undefined
            this.#next(workspaceId, queue)
          })
        },
        cancel: reason => {
          const index = queue.waiting.indexOf(job)
          if (index < 0) return
          queue.waiting.splice(index, 1)
          finished()
          reject(reason)
          this.#next(workspaceId, queue)
        },
      }
      const aborted = () => job.cancel(signal.reason)
      signal.addEventListener("abort", aborted, { once: true })
      queue.waiting.push(job)
      this.#next(workspaceId, queue)
    })
  }

  clear(): void {
    this.#closed = true
    const reason = new Error("Completion resolution queue closed")
    for (const queue of this.#workspaces.values()) {
      for (const job of [...queue.waiting]) job.cancel(reason)
    }
  }

  #next(workspaceId: string, queue: WorkspaceQueue): void {
    if (queue.active) return
    if (this.#closed) {
      if (queue.waiting.length === 0) this.#workspaces.delete(workspaceId)
      return
    }
    const next = queue.waiting.shift()
    if (next) next.start()
    else if (this.#workspaces.get(workspaceId) === queue) this.#workspaces.delete(workspaceId)
  }
}
