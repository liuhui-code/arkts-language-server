import type { DocumentSnapshot } from "../contracts/document.js"
import type { StructuredLogger } from "../observability/logger.js"
import { SemanticWorkerHost, type DeferredSemanticMutation } from "./semantic-worker-host.js"
import { pressureWorkerRecycleEnabled } from "./semantic-worker-runtime-control.js"
import { SemanticWorkerCancelState, SemanticWorkerSupervisorError,
  type RootSemanticWorkerMutationInput,
  type RootSemanticWorkerRequestInput } from "./semantic-worker-supervisor.js"
import type { SemanticWorkerJsonValue } from "./worker-protocol.js"

interface RecycleOptions {
  readonly documents: ReadonlyMap<string, DocumentSnapshot>
  readonly quiescent: boolean
  readonly checkHealth: () => void
  readonly fail: (error: unknown) => void
  readonly invalidate: () => void
}

/** Owns the recycle witness, deferred edits and replacement transaction. */
export class SemanticWorkerRecycle {
  readonly #host: SemanticWorkerHost
  readonly #environment: NodeJS.ProcessEnv
  readonly #mutations: DeferredSemanticMutation[] = []
  readonly #logger: StructuredLogger | undefined
  #active = false
  #changed = false
  #completed: Promise<void> | undefined
  #requests = 0
  #automaticOptions: (() => RecycleOptions) | undefined
  #automaticQueued = false

  constructor(host: SemanticWorkerHost, environment: NodeJS.ProcessEnv,
    logger?: StructuredLogger) {
    this.#host = host
    this.#environment = environment
    this.#logger = logger
  }

  get active(): boolean { return this.#active }

  async request(rootUri: string, input: RootSemanticWorkerRequestInput,
    signal: AbortSignal | undefined, checkAvailable: () => void): Promise<SemanticWorkerJsonValue> {
    if (this.#active) await this.wait(signal)
    checkAvailable()
    this.#requests += 1
    try {
      const handle = this.#host.supervisor(rootUri).request(input)
      const abort = () => handle.cancel(workerAbortState(signal))
      signal?.addEventListener("abort", abort, { once: true })
      if (signal?.aborted) abort()
      try { return await handle.result }
      finally { signal?.removeEventListener("abort", abort) }
    } finally {
      this.#requests -= 1
      this.retryAutomatic()
    }
  }

  requestAutomatic(options: () => RecycleOptions): void {
    if (!pressureWorkerRecycleEnabled(this.#environment)) return
    this.#automaticOptions = options
    this.retryAutomatic()
  }

  retryAutomatic(): void {
    if (!this.#automaticOptions || this.#automaticQueued || this.#active) return
    this.#automaticQueued = true
    setImmediate(() => {
      this.#automaticQueued = false
      const options = this.#automaticOptions?.()
      if (!options || !options.quiescent || this.#requests !== 0) return
      this.#automaticOptions = undefined
      void this.run(options, "automatic").then(
        result => this.#logger?.info("semantic.worker.pressure-recycle.complete", result),
        error => this.#logger?.info("semantic.worker.pressure-recycle.skipped", {
          reason: error instanceof Error ? error.message : String(error),
        }),
      )
    })
  }

  cancelAutomatic(): void { this.#automaticOptions = undefined }

  wait(signal?: AbortSignal): Promise<void> {
    const completed = this.#completed ?? Promise.resolve()
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal?.removeEventListener("abort", abort)
        reject(new SemanticWorkerSupervisorError(
          workerAbortState(signal) === SemanticWorkerCancelState.contentModified
            ? "content-modified" : "client-cancelled"))
      }
      if (signal?.aborted) { abort(); return }
      signal?.addEventListener("abort", abort, { once: true })
      void completed.then(() => {
        signal?.removeEventListener("abort", abort)
        resolve()
      })
    })
  }

  configurationChanged(): void { if (this.#active) this.#changed = true }

  defer(rootUri: string, mutation: RootSemanticWorkerMutationInput): boolean {
    if (!this.#active) return false
    this.#changed = true
    this.#mutations.push({ rootUri, mutation })
    return true
  }

  /** A failed mutation journal cannot be reused; restore authoritative buffers. */
  async recover(options: RecycleOptions): Promise<void> {
    if (this.#active) return this.wait()
    const roots = this.#host.rootUris
    this.#active = true
    let release!: () => void
    this.#completed = new Promise(resolve => { release = resolve })
    try {
      options.invalidate()
      const oldThreadId = await this.#host.replaceWorker()
      const documents = [...options.documents.values()]
      for (const rootUri of roots) this.#host.supervisor(rootUri)
      for (const document of documents) {
        await this.#host.supervisor(document.workspaceId).mutate({ kind: "open",
          uri: document.uri, documentVersion: document.version, text: document.text })
      }
      await this.#host.flushMutations(this.#mutations)
      options.checkHealth()
      this.#logger?.info("semantic.worker.recovery.complete", {
        oldThreadId, newThreadId: this.#host.threadId(), documents: documents.length,
      })
    } catch (error) {
      options.fail(error)
      throw error
    } finally {
      this.#active = false
      this.#completed = undefined
      release()
      this.retryAutomatic()
    }
  }

  async run(options: RecycleOptions, trigger: "manual" | "automatic" = "manual"): Promise<{
    recycled: true; oldThreadId: number; newThreadId: number
  }> {
    const enabled = trigger === "automatic" ? pressureWorkerRecycleEnabled(this.#environment)
      : this.#environment.ARKTS_BENCHMARK_CONTROL === "1"
        && this.#environment.ARKTS_L01_SEMANTIC_WORKER_RECYCLE === "1"
    if (!enabled) {
      throw new Error("Semantic Worker recycle is disabled")
    }
    options.checkHealth()
    if (this.#active) throw new Error("Semantic Worker recycle is in progress")
    const rootUris = this.#host.rootUris
    const rootError = trigger === "manual" ? "Semantic Worker recycle requires one quiescent root"
      : "Semantic Worker recycle requires quiescent registered roots"
    if (rootUris.length === 0 || (trigger === "manual" && rootUris.length !== 1)
      || (trigger === "manual" && options.documents.size === 0)
      || !options.quiescent || this.#requests !== 0) {
      throw new Error(rootError)
    }
    const registeredRoots = new Set(rootUris)
    if ([...options.documents.values()].some(document => !registeredRoots.has(document.workspaceId))) {
      throw new Error(rootError)
    }
    this.#active = true
    this.#changed = false
    let release!: () => void
    this.#completed = new Promise(resolve => { release = resolve })
    let replacing = false
    try {
      const witness = await this.#host.recycleWitness()
      if (this.#changed) throw new Error("Semantic Worker changed during recycle witness")
      if (!witness.eligible) throw new Error(`Semantic Worker recycle unavailable: ${witness.reason}`)
      options.checkHealth()
      options.invalidate()
      replacing = true
      const oldThreadId = await this.#host.replaceWorker()
      for (const rootUri of rootUris) this.#host.supervisor(rootUri)
      for (const document of options.documents.values()) {
        await this.#host.supervisor(document.workspaceId).mutate({ kind: "open", uri: document.uri,
          documentVersion: document.version, text: document.text })
      }
      await this.#host.flushMutations(this.#mutations)
      const newThreadId = this.#host.threadId()
      if (oldThreadId < 1 || newThreadId < 1 || oldThreadId === newThreadId) {
        throw new Error("Semantic Worker recycle did not establish a new thread")
      }
      options.checkHealth()
      replacing = false
      if (this.#changed) throw new Error("Semantic Worker changed during recycle")
      return { recycled: true, oldThreadId, newThreadId }
    } catch (error) {
      if (replacing) options.fail(error)
      else await this.#host.flushMutations(this.#mutations)
        .catch(failure => { options.fail(failure); throw failure })
      throw error
    } finally {
      this.#active = false
      this.#completed = undefined
      release()
      this.retryAutomatic()
    }
  }
}

export function workerAbortState(signal: AbortSignal | undefined) {
  const kind = signal?.reason && typeof signal.reason === "object"
    ? (signal.reason as { kind?: unknown }).kind
    : undefined
  if (kind === "content-modified" || kind === "superseded") {
    return SemanticWorkerCancelState.contentModified
  }
  if (kind === "shutdown") return SemanticWorkerCancelState.supervisorDisposing
  return SemanticWorkerCancelState.clientCancelled
}
