import { Worker } from "node:worker_threads"
import { SemanticWorkerRetirement } from "./semantic-worker-retirement.js"
import { isOwnershipFaultEvent } from "./semantic-worker-fault.js"
import { semanticWorkerDeadlines, SemanticWorkerWatchdog } from "./semantic-worker-watchdog.js"

import type { StructuredLogger } from "../observability/logger.js"
import { semanticRuntimeConfig } from "./coordinator/runtime-config.js"
import { interactiveSemanticRuntimeConfig } from "./interactive-runtime.js"
import { referenceSearchRuntimeConfig } from "./references/reference-runtime.js"
import { messageEpoch, workerLogMessage } from "./semantic-worker-message-routing.js"
import { pressureWorkerRecycleEnabled } from "./semantic-worker-runtime-control.js"
import { SemanticWorkerQueueTrace } from "./semantic-worker-queue-trace.js"
import {
  RootSemanticWorkerSupervisor,
  type RootSemanticWorkerEndpoint,
  type RootSemanticWorkerEndpointHandlers,
  type RootSemanticWorkerMutationInput,
} from "./semantic-worker-supervisor.js"

export interface DeferredSemanticMutation {
  readonly rootUri: string
  readonly mutation: RootSemanticWorkerMutationInput
}

export interface SemanticWorkerControlMessage {
  readonly control: "configureProject" | "configureSdk" | "applyMemoryPressure"
  readonly value: unknown
}

interface SemanticWorkerHostOptions {
  readonly workerPath: string
  readonly logger?: StructuredLogger
  readonly environment: NodeJS.ProcessEnv
  readonly workerData: (rootUri: string) => ReturnType<typeof semanticWorkerData>
  readonly onFailure: (error: unknown) => void
  readonly onHealthy?: () => void
  readonly onPressureRecycle: () => void
  readonly initialPreparationConsumed?: (rootUri: string) => boolean
}

interface RecycleWitness {
  readonly eligible: boolean
  readonly reason: string
}

export function semanticWorkerData(rootUri: string, environment: NodeJS.ProcessEnv,
  projectConfiguration: unknown, sdkConfiguration: unknown) {
  return {
    rootUri, projectConfiguration, sdkConfiguration,
    runtimeConfig: semanticRuntimeConfig(environment),
    references: referenceSearchRuntimeConfig(environment),
    interactive: interactiveSemanticRuntimeConfig(environment),
    metricsPath: environment.ARKTS_MEMORY_METRICS_FILE,
    semanticProgress: undefined as SharedArrayBuffer | undefined,
  }
}

/** Owns one physical Worker and all root epochs routed through it. */
export class SemanticWorkerHost {
  readonly #options: SemanticWorkerHostOptions
  readonly #supervisors = new Map<string, RootSemanticWorkerSupervisor>()
  readonly #handlers = new Map<number, RootSemanticWorkerEndpointHandlers>()
  readonly #roots = new Set<string>()
  #worker: Worker | undefined
  #watchdog: SemanticWorkerWatchdog | undefined
  #retirement: SemanticWorkerRetirement | undefined
  #draining: Worker | undefined
  #nextEpoch = 1
  #disposed = false
  #disposePromise: Promise<void> | undefined

  constructor(options: SemanticWorkerHostOptions) { this.#options = options }

  get rootUris(): readonly string[] { return [...this.#roots] }

  supervisor(rootUri: string): RootSemanticWorkerSupervisor {
    const existing = this.#supervisors.get(rootUri)
    if (existing) return existing
    if (this.#disposed) throw new Error("Semantic worker host is disposed")
    const worker = this.#ensureWorker(rootUri)
    const epoch = this.#nextEpoch++
    const endpoint: RootSemanticWorkerEndpoint = {
      listen: handlers => {
        this.#handlers.set(epoch, handlers)
        return () => { this.#handlers.delete(epoch) }
      },
      send: message => { worker.postMessage(message); this.#watchdog?.sent(message) },
      terminate: () => {
        this.#handlers.delete(epoch)
        if (this.#worker === worker && !this.#disposed) {
          this.#options.onFailure(new Error("Semantic Worker root endpoint failed"))
        }
      },
    }
    worker.postMessage({ control: "registerRoot", epoch, rootUri,
      initialPreparationConsumed: this.#options.initialPreparationConsumed?.(rootUri) ?? false })
    const supervisor = new RootSemanticWorkerSupervisor({
      rootUri, epoch, endpoint,
      waitForDisposeDeadline: () => new Promise(resolve => setTimeout(resolve, 100)),
      queueTrace: this.#options.environment.ARKTS_SEMANTIC_QUEUE_TRACE === "1" && this.#options.logger
        ? new SemanticWorkerQueueTrace(this.#options.logger, rootUri, epoch) : undefined,
    })
    this.#supervisors.set(rootUri, supervisor)
    this.#roots.add(rootUri)
    return supervisor
  }

  sendControl(message: SemanticWorkerControlMessage): void {
    this.#worker?.postMessage(message)
  }

  async flushMutations(queue: DeferredSemanticMutation[]): Promise<void> {
    while (queue.length > 0) {
      const batch = queue.splice(0)
      for (const { rootUri, mutation } of batch) {
        await this.supervisor(rootUri).mutate(mutation)
      }
    }
  }

  async recycleWitness(): Promise<RecycleWitness> {
    const worker = this.#worker
    if (!worker) throw new Error("Semantic Worker is not started")
    return new Promise((resolve, reject) => {
      const token = `${Date.now()}:${Math.random()}`
      const timer = setTimeout(() => finish(new Error("Semantic Worker recycle witness timed out")), 5_000)
      const onMessage = (message: unknown) => {
        if (!message || typeof message !== "object") return
        const candidate = message as Record<string, unknown>
        if (candidate.workerEvent !== "recycleWitness" || candidate.token !== token) return
        if (typeof candidate.eligible !== "boolean" || typeof candidate.reason !== "string") {
          finish(new Error("Invalid Semantic Worker recycle witness"))
          return
        }
        finish(undefined, { eligible: candidate.eligible, reason: candidate.reason })
      }
      const onError = (error: Error) => finish(error)
      const onExit = () => finish(new Error("Semantic Worker exited before recycle witness"))
      const finish = (error?: Error, result?: RecycleWitness) => {
        clearTimeout(timer)
        worker.off("message", onMessage)
        worker.off("error", onError)
        worker.off("exit", onExit)
        if (error) reject(error)
        else resolve(result as RecycleWitness)
      }
      worker.on("message", onMessage)
      worker.once("error", onError)
      worker.once("exit", onExit)
      if (this.#options.environment.ARKTS_BENCHMARK_CONTROL === "1"
        && this.#options.environment.ARKTS_L01_SEMANTIC_WORKER_RECYCLE === "1"
        && this.#options.environment.ARKTS_TEST_WORKER_RECYCLE_WITNESS_TIMEOUT === "1") {
        this.#options.logger?.info("semantic.worker.recycle.witness.waiting", {})
      } else worker.postMessage({ control: "recycleWitness", token })
    })
  }

  replaceWorker(retryRetirement = false): Promise<number> {
    if (!this.#retirement) {
      const worker = this.#worker
      if (!worker) return Promise.resolve(-1)
      this.#worker = undefined
      this.#draining = worker
      this.#watchdog?.dispose()
      this.#watchdog = undefined
      const drain = Promise.allSettled([...this.#supervisors.values()].map(supervisor => supervisor.dispose()))
        .then(outcomes => {
          this.#supervisors.clear()
          this.#handlers.clear()
          this.#draining = undefined
          const errors = outcomes.flatMap(result => result.status === "rejected" ? [result.reason] : [])
          if (errors.length) throw new AggregateError(errors, "Root retirement failed")
        })
      this.#retirement = new SemanticWorkerRetirement(worker, () => drain)
    }
    const retirement = this.#retirement
    return retirement.stop(retryRetirement).catch(error => {
      this.#options.logger?.error("semantic.worker.retirement.failed", {
        threadId: retirement.threadId, exitConfirmed: retirement.exited,
        reason: error instanceof Error ? error.message : String(error),
      })
      throw error
    }).finally(() => {
      // A rejected stop is not exit proof. Keep the handle and its exit listener
      // for the next budgeted recovery, or final session shutdown.
      if (retirement.exited && this.#retirement === retirement) this.#retirement = undefined
    })
  }

  threadId(): number {
    return this.#worker?.threadId ?? -1
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise
    this.#disposed = true
    return this.#disposePromise = this.replaceWorker(true).then(() => { this.#roots.clear() })
  }

  #ensureWorker(rootUri: string): Worker {
    if (this.#retirement) throw new Error("Previous Semantic Worker has not exited")
    if (this.#worker) return this.#worker
    semanticWorkerDeadlines(this.#options.environment) // Validate before allocating an isolate.
    const progress = new SharedArrayBuffer(64)
    const worker = new Worker(this.#options.workerPath, {
      workerData: { ...this.#options.workerData(rootUri), semanticProgress: progress },
    })
    this.#watchdog = new SemanticWorkerWatchdog(this.#options.environment, error => {
      if (this.#worker === worker && !this.#disposed) this.#options.onFailure(error)
    }, this.#options.logger, progress, this.#options.onHealthy)
    worker.on("message", (message: unknown) => {
      if (this.#worker !== worker) {
        // Disposal still owns the active command terminal. It cannot publish a
        // success after cancellation, but must be allowed to finish once.
        if (this.#draining === worker) {
          const epoch = messageEpoch(message)
          if (epoch !== undefined) this.#handlers.get(epoch)?.message(message)
        }
        return
      }
      if (isOwnershipFaultEvent(message)) {
        this.#options.onFailure(new Error("Semantic Worker compiler cleanup ownership is uncertain"))
        return
      }
      if (this.#watchdog?.execution(message)) return
      if (message && typeof message === "object"
        && (message as { workerEvent?: unknown }).workerEvent === "pressureRecycle"
        && pressureWorkerRecycleEnabled(this.#options.environment)) {
        this.#options.onPressureRecycle()
        return
      }
      const log = workerLogMessage(message)
      if (log) {
        this.#options.logger?.[log.level](log.event, log.fields)
        return
      }
      const epoch = messageEpoch(message)
      if (epoch !== undefined) { this.#watchdog?.settled(message); this.#handlers.get(epoch)?.message(message) }
    })
    worker.on("error", error => {
      if (this.#worker !== worker) return
      this.#options.onFailure(error)
      for (const handlers of this.#handlers.values()) handlers.error(error)
    })
    worker.on("exit", code => {
      if (this.#worker !== worker) return
      if (!this.#disposed) {
        this.#options.onFailure(new Error(`Semantic worker exited ${code}`))
      }
      if (!this.#disposed) for (const handlers of this.#handlers.values()) handlers.exit(code)
    })
    this.#worker = worker
    this.#options.logger?.info("semantic.worker.started", { semanticWorkerCount: 1, threadId: worker.threadId })
    return worker
  }
}
