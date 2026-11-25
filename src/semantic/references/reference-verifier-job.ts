import { AsyncResource } from "node:async_hooks"

export type VerifierJobState = "queued" | "running" | "cancel-pending" | "settling" | "settled"

/** A caller's result is separate from the serial queue's physical drain. */
export class ReferenceVerifierJob<Result> {
  state: VerifierJobState = "queued"
  readonly result: Promise<Result>
  private readonly context = new AsyncResource("ReferenceVerifierJob")
  private resolve!: (value: Result) => void
  private reject!: (error: unknown) => void
  private selected = false
  private error?: Error
  private timer?: NodeJS.Timeout
  onInterrupt?: (error: Error) => void

  constructor(readonly id: number, readonly cancelled: (() => boolean) | undefined,
    private readonly observe?: (id: number, phase: VerifierJobState) => void) {
    this.result = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject })
    this.transition("queued")
    if (cancelled) {
      this.timer = setInterval(() => this.withContext(() => {
        try { if (cancelled()) this.interrupt(new Error("Semantic request cancelled")) }
        catch (error) { this.interrupt(error instanceof Error ? error : new Error(String(error))) }
      }), 10)
      this.timer.unref()
    }
  }

  withContext<T>(run: () => T): T | undefined {
    if (this.state === "settled") return undefined
    return this.context.runInAsyncScope(run)
  }

  start(): boolean {
    if (this.state !== "queued") return false
    if (this.cancelled?.()) { this.interrupt(new Error("Semantic request cancelled")); return false }
    this.transition("running")
    return true
  }

  interrupt(error: Error): void {
    if (this.state === "settled" || this.state === "settling" || this.state === "cancel-pending") return
    this.error = error
    this.choose(error)
    if (this.state === "queued") this.finish(error)
    else { this.transition("cancel-pending"); this.onInterrupt?.(error) }
  }

  finish(error?: unknown, value?: Result): void {
    if (this.state === "settled") return
    this.transition("settling")
    this.choose(this.error ?? error, value)
    clearInterval(this.timer)
    this.timer = undefined
    this.onInterrupt = undefined
    this.transition("settled")
    this.context.emitDestroy()
  }

  private transition(next: VerifierJobState): void {
    this.state = next
    try { this.context.runInAsyncScope(() => this.observe?.(this.id, next)) }
    catch { /* Optional observations cannot change task or cleanup outcomes. */ }
  }

  private choose(error?: unknown, value?: Result): void {
    if (this.selected) return
    this.selected = true
    if (error !== undefined) this.reject(error)
    else this.resolve(value!)
  }
}
