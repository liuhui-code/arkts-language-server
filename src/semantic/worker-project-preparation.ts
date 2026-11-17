import { semanticUnprepared, type SemanticReadinessQuery, type SemanticReadinessReport } from "../contracts/semantic-readiness.js"
import type { RootSemanticWorkerRequestInput } from "./semantic-worker-command-input.js"
import type { SemanticWorkerDiskSource } from "./semantic-worker-disk-source.js"
import type { SemanticWorkerJsonValue, SemanticWorkerMethod, SemanticWorkerRequestArgsByMethod } from "./worker-protocol.js"

interface PreparationPort {
  assertAvailable(): void
  admitRecovery?(explicit: boolean): Promise<void>
  generation?(rootUri: string, signal?: AbortSignal): Promise<object>
  hasRoot(rootUri: string): boolean
  readonly queriedRoots: Set<string>
  request(rootUri: string, input: RootSemanticWorkerRequestInput, signal?: AbortSignal): Promise<SemanticWorkerJsonValue>
}

/** One initialization promise per root, shared by startup and incoming semantic queries. */
export class WorkerProjectPreparation {
  private readonly initializations = new Map<string, Promise<SemanticReadinessReport>>()
  private readonly prepared = new Map<string, { readonly generation: WeakRef<object>; readonly configuration: number }>()
  private configuration = 0
  private readonly completedRoots = new Set<string>()
  private readonly scopeRoots = new Set<string>()

  constructor(private readonly port: PreparationPort) {}

  async settled(rootUri: string): Promise<void> {
    await this.initializations.get(rootUri)?.then(() => {}, () => {})
  }

  get active(): boolean { return this.initializations.size > 0 }
  hasCompleted(rootUri: string): boolean { return this.completedRoots.has(rootUri) }
  configurationChanged(): void { this.configuration++ }

  async read(query: SemanticReadinessQuery): Promise<SemanticReadinessReport> {
    checkpoint(query.signal)
    await waitForTask(this.port.admitRecovery?.(query.prepare || query.captureSourceInputs !== undefined), query.signal)
    this.port.assertAvailable()
    if (!query.prepare && !query.captureSourceInputs && !this.port.hasRoot(query.rootUri)) return semanticUnprepared(query.rootUri)
    return await this.request("semanticReadiness", query.rootUri, query.rootUri, null,
      { prepare: query.prepare, ...(query.captureSourceInputs ? { captureSourceInputs: query.captureSourceInputs } : {}) }, query.signal) as unknown as SemanticReadinessReport
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
        await this.port.admitRecovery?.(true)
        this.port.assertAvailable()
        const generation = await this.port.generation?.(query.rootUri, query.signal)
        const report = await this.read({ ...query, prepare: true })
        const current = await this.port.generation?.(query.rootUri, query.signal)
        if (configuration === this.configuration && generation === current) {
          if (current) this.prepared.set(query.rootUri, { generation: new WeakRef(current), configuration })
          return report
        }
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code !== "content-modified") throw error
      }
    }
  }

  async request<Method extends SemanticWorkerMethod>(method: Method, rootUri: string, uri: string,
    expectedDocumentVersion: number | null, args: SemanticWorkerRequestArgsByMethod[Method],
    signal?: AbortSignal, diskSource?: SemanticWorkerDiskSource): Promise<SemanticWorkerJsonValue> {
    checkpoint(signal)
    if (method !== "semanticReadiness") await waitForTask(this.port.admitRecovery?.(method !== "diagnose"), signal)
    if (method !== "semanticReadiness") await this.wait(rootUri, signal)
    const value = await this.port.request(rootUri, { method, uri, expectedDocumentVersion, args,
      ...(diskSource ? { diskSource } : {}) } as RootSemanticWorkerRequestInput, signal)
    if (method === "semanticReadiness" && "prepare" in args && args.prepare === true) {
      this.completedRoots.add(rootUri)
      const report = value as unknown as SemanticReadinessReport
      if (report.semanticState === "partial" && report.unavailableReasons.includes("sdk-inputs-incomplete")) this.scopeRoots.add(rootUri)
      else this.scopeRoots.delete(rootUri)
    }
    if (method !== "semanticReadiness" || ("prepare" in args && args.prepare === true)) this.port.queriedRoots.add(rootUri)
    return value
  }

  private async wait(rootUri: string, signal?: AbortSignal): Promise<void> {
    await waitForTask(this.initializations.get(rootUri), signal)
    if (!this.port.generation || !this.scopeRoots.has(rootUri)) return
    const current = await this.port.generation(rootUri, signal), receipt = this.prepared.get(rootUri)
    if (receipt?.configuration === this.configuration && receipt.generation.deref() === current) return
    // A receipt belongs to a real supervisor/configuration, never a thread number.
    // This shared repair does not restore the one-time pressure exemption.
    await waitForTask(this.initialize({ rootUri }), signal)
  }
}

/** Stop one caller waiting without cancelling the shared initialization/recovery owner. */
async function waitForTask(pending: Promise<unknown> | undefined, signal?: AbortSignal): Promise<void> {
  checkpoint(signal)
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

function checkpoint(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Semantic request cancelled")
}
