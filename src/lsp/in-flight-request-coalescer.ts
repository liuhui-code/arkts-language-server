interface SharedOperation {
  readonly controller: AbortController
  readonly promise: Promise<unknown>
  waiters: number
  settled: boolean
}

export class InFlightRequestCoalescer {
  readonly #operations = new Map<string, SharedOperation>()

  has(key: string): boolean {
    return this.#operations.has(key)
  }

  run<T>(
    key: string,
    waiterSignal: AbortSignal,
    start: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    let operation = this.#operations.get(key)
    if (!operation) {
      const controller = new AbortController()
      const created: SharedOperation = {
        controller,
        promise: Promise.resolve().then(() => start(controller.signal)),
        waiters: 0,
        settled: false,
      }
      operation = created
      this.#operations.set(key, created)
      void created.promise.then(
        () => this.#settled(key, created),
        () => this.#settled(key, created),
      )
    }
    operation.waiters += 1
    return this.#wait<T>(key, operation, waiterSignal)
  }

  #wait<T>(
    key: string,
    operation: SharedOperation,
    signal: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let finished = false
      const finish = (callback: () => void) => {
        if (finished) return
        finished = true
        signal.removeEventListener("abort", aborted)
        this.#release(key, operation, signal.reason)
        callback()
      }
      const aborted = () => finish(() => reject(signal.reason))
      signal.addEventListener("abort", aborted, { once: true })
      if (signal.aborted) return aborted()
      void operation.promise.then(
        value => finish(() => resolve(value as T)),
        error => finish(() => reject(error)),
      )
    })
  }

  #settled(key: string, operation: SharedOperation): void {
    operation.settled = true
    if (operation.waiters === 0 && this.#operations.get(key) === operation) {
      this.#operations.delete(key)
    }
  }

  #release(key: string, operation: SharedOperation, reason: unknown): void {
    operation.waiters -= 1
    if (operation.waiters !== 0) return
    if (this.#operations.get(key) === operation) this.#operations.delete(key)
    if (!operation.settled) operation.controller.abort(reason)
  }
}
