import { Worker } from "node:worker_threads"

import type { StructuredLogger } from "../observability/logger.js"
import { semanticRuntimeConfig } from "./coordinator/runtime-config.js"
import { interactiveSemanticRuntimeConfig } from "./interactive-runtime.js"
import { referenceSearchRuntimeConfig } from "./references/reference-runtime.js"
import { messageEpoch, workerLogMessage } from "./semantic-worker-message-routing.js"
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
  }
}

/** Owns one physical Worker and all root epochs routed through it. */
export class SemanticWorkerHost {
  readonly #options: SemanticWorkerHostOptions
  readonly #supervisors = new Map<string, RootSemanticWorkerSupervisor>()
  readonly #handlers = new Map<number, RootSemanticWorkerEndpointHandlers>()
  #worker: Worker | undefined
  #nextEpoch = 1
  #disposed = false

  constructor(options: SemanticWorkerHostOptions) { this.#options = options }

  get rootCount(): number { return this.#supervisors.size }
  get singleRootUri(): string | undefined {
    return this.#supervisors.size === 1 ? this.#supervisors.keys().next().value : undefined
  }

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
      send: message => worker.postMessage(message),
      terminate: () => { this.#handlers.delete(epoch) },
    }
    worker.postMessage({ control: "registerRoot", epoch, rootUri })
    const supervisor = new RootSemanticWorkerSupervisor({
      rootUri, epoch, endpoint,
      waitForDisposeDeadline: () => new Promise(resolve => setTimeout(resolve, 100)),
    })
    this.#supervisors.set(rootUri, supervisor)
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

  async replaceWorker(): Promise<number> {
    const oldWorker = this.#worker
    if (!oldWorker) throw new Error("Semantic Worker is not started")
    const oldThreadId = oldWorker.threadId
    this.#worker = undefined
    await Promise.all([...this.#supervisors.values()].map(supervisor => supervisor.dispose()))
    this.#supervisors.clear()
    this.#handlers.clear()
    await oldWorker.terminate()
    return oldThreadId
  }

  threadId(): number {
    return this.#worker?.threadId ?? -1
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    const worker = this.#worker
    this.#worker = undefined
    await Promise.all([...this.#supervisors.values()].map(supervisor => supervisor.dispose()))
    this.#supervisors.clear()
    this.#handlers.clear()
    await worker?.terminate()
  }

  #ensureWorker(rootUri: string): Worker {
    if (this.#worker) return this.#worker
    const worker = new Worker(this.#options.workerPath, {
      workerData: this.#options.workerData(rootUri),
    })
    worker.on("message", (message: unknown) => {
      if (this.#worker !== worker) return
      const log = workerLogMessage(message)
      if (log) {
        this.#options.logger?.[log.level](log.event, log.fields)
        return
      }
      const epoch = messageEpoch(message)
      if (epoch !== undefined) this.#handlers.get(epoch)?.message(message)
    })
    worker.on("error", error => {
      if (this.#worker !== worker) return
      this.#options.onFailure(error)
      for (const handlers of this.#handlers.values()) handlers.error(error)
    })
    worker.on("exit", code => {
      if (this.#worker !== worker) return
      if (!this.#disposed && code !== 0) {
        this.#options.onFailure(new Error(`Semantic worker exited ${code}`))
      }
      if (!this.#disposed) for (const handlers of this.#handlers.values()) handlers.exit(code)
    })
    this.#worker = worker
    this.#options.logger?.info("semantic.worker.started", { semanticWorkerCount: 1 })
    return worker
  }
}
