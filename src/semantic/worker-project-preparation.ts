import { semanticUnprepared, type SemanticReadinessQuery, type SemanticReadinessReport } from "../contracts/semantic-readiness.js"
import type { RootSemanticWorkerRequestInput } from "./semantic-worker-command-input.js"
import type { SemanticWorkerDiskSource } from "./semantic-worker-disk-source.js"
import type { SemanticWorkerJsonValue, SemanticWorkerMethod, SemanticWorkerRequestArgsByMethod } from "./worker-protocol.js"

interface PreparationPort {
  assertAvailable(): void
  hasRoot(rootUri: string): boolean
  readonly queriedRoots: Set<string>
  request(rootUri: string, input: RootSemanticWorkerRequestInput, signal?: AbortSignal): Promise<SemanticWorkerJsonValue>
}

/** One initialization promise per root, shared by startup and incoming semantic queries. */
export class WorkerProjectPreparation {
  private readonly initializations = new Map<string, Promise<SemanticReadinessReport>>()
  private configuration = 0

  constructor(private readonly port: PreparationPort) {}

  get active(): boolean { return this.initializations.size > 0 }
  configurationChanged(): void { this.configuration++ }

  async read(query: SemanticReadinessQuery): Promise<SemanticReadinessReport> {
    this.port.assertAvailable()
    if (!query.prepare && !this.port.hasRoot(query.rootUri)) return semanticUnprepared(query.rootUri)
    return await this.request("semanticReadiness", query.rootUri, query.rootUri, null,
      { prepare: query.prepare }, query.signal) as unknown as SemanticReadinessReport
  }

  initialize(query: Omit<SemanticReadinessQuery, "prepare">): Promise<SemanticReadinessReport> {
    const existing = this.initializations.get(query.rootUri)
    if (existing) return existing
    const task = this.prepare(query).finally(() => {
      if (this.initializations.get(query.rootUri) === task) this.initializations.delete(query.rootUri)
    })
    this.initializations.set(query.rootUri, task)
    return task
  }

  private async prepare(query: Omit<SemanticReadinessQuery, "prepare">): Promise<SemanticReadinessReport> {
    for (;;) {
      checkpoint(query.signal)
      const configuration = this.configuration
      try {
        const report = await this.read({ ...query, prepare: true })
        if (configuration === this.configuration) return report
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code !== "content-modified") throw error
      }
    }
  }

  async request<Method extends SemanticWorkerMethod>(method: Method, rootUri: string, uri: string,
    expectedDocumentVersion: number | null, args: SemanticWorkerRequestArgsByMethod[Method],
    signal?: AbortSignal, diskSource?: SemanticWorkerDiskSource): Promise<SemanticWorkerJsonValue> {
    if (method !== "semanticReadiness") await this.wait(rootUri, signal)
    const value = await this.port.request(rootUri, { method, uri, expectedDocumentVersion, args,
      ...(diskSource ? { diskSource } : {}) } as RootSemanticWorkerRequestInput, signal)
    if (method !== "semanticReadiness" || ("prepare" in args && args.prepare === true)) this.port.queriedRoots.add(rootUri)
    return value
  }

  private async wait(rootUri: string, signal?: AbortSignal): Promise<void> {
    checkpoint(signal)
    const pending = this.initializations.get(rootUri)
    if (!pending) return
    if (!signal) { await pending; return }
    let abort: (() => void) | undefined
    try {
      await Promise.race([pending, new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled"))
        signal.addEventListener("abort", abort, { once: true })
        if (signal.aborted) abort()
      })])
    } finally { if (abort) signal.removeEventListener("abort", abort) }
    checkpoint(signal)
  }
}

function checkpoint(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
