import type { NativeProof } from "./managed-cache-namespace.js"
import { MaintenanceInputs, IndexInputObservationError, type IndexInputChanges } from "./maintenance-inputs.js"
import { tryClientWorkspaceUri } from "./workspace-uri-identity.js"
import { randomUUID } from "node:crypto"
import type { WorkspaceIndexProgress } from "../contracts/workspace-symbol-service.js"
import type { MaintenanceCapability } from "./maintenance-negotiation.js"
import type { MaintenanceEvent } from "./maintenance-events.js"
import { SidecarSession, SidecarRequestError, SidecarTimeoutError, abortError } from "./sidecar-session.js"
import { asRecord, SidecarProtocolError, isNonNegativeInteger } from "./sidecar-protocol-validation.js"
import { decodeInput, decodeMaintenanceTerminal, decodeReadProof, sameInput, attachReadProof,
  type IndexInput } from "./versioned-index-proof.js"

interface Run {
  attemptId: string
  input: IndexInput
  accepted: boolean
  settled: boolean
  abortRequested: boolean
  cancelStarted: boolean
  starting: boolean
  waiting: boolean
  progress?: MaintenanceEvent
  terminal?: MaintenanceEvent
  timer?: ReturnType<typeof setTimeout>
  cancelTimer?: ReturnType<typeof setTimeout>
  signal?: AbortSignal
  onAbort(): void
  report(progress: WorkspaceIndexProgress): void
  resolve(): void
  reject(error: Error): void
}

/** One accepted parent task; pre-ACK buffering retains one latest progress and
 * one terminal, never a source-sized event history. Transport owns read slots.
 */
export class VersionedMaintenance {
  private readonly issuer = randomUUID()
  private readonly inputs: MaintenanceInputs
  private activity = 0
  private run?: Run
  constructor(private readonly session: SidecarSession,
    readonly capability: MaintenanceCapability,
    private readonly cancelTimeoutMs: number,
    private readonly stallTimeoutMs: number) {
    this.inputs = new MaintenanceInputs(this.issuer, payload => session.request("maintenance/changes", payload),
      error => session.failFromHost(error))
  }

  observe(changes: IndexInputChanges): void { this.inputs.observe(changes) }
  sourceNamespacesChanged(namespaces: readonly NativeProof[]): void {
    this.inputs.observe({ changes: [], uncertainty: ["namespace"], managedCacheNamespaces: namespaces })
  }

  start(report: Run["report"], signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError())
    if (this.run) return Promise.reject(new Error("workspace maintenance is already running"))
    let input: IndexInput
    try { input = this.inputs.forReconcile(); this.inputs.expectAdmission(input) } catch (error) { return Promise.reject(error) }
    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((accept, decline) => { resolve = accept; reject = decline })
    const run: Run = { starting: false, waiting: false, attemptId: randomUUID(), input, accepted: false, settled: false,
      abortRequested: false, cancelStarted: false, report, resolve, reject, signal,
      onAbort: () => {
        run.abortRequested = true
        if (run.accepted) void this.cancel(run)
        else if (run.waiting) this.cancelled(run)
      } }
    this.run = run
    signal?.addEventListener("abort", run.onAbort, { once: true })
    if (signal?.aborted) run.onAbort()
    void this.begin(run)
    return promise
  }

  async read(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw abortError()
    const input = this.inputs.current
    try { await this.inputs.waitForObserved(input, signal) }
    catch (error) {
      if (error instanceof IndexInputObservationError) throw new SidecarRequestError("invalid_generation", error.message)
      throw error
    }
    if (this.inputs.current !== input) throw new SidecarRequestError("invalid_generation", "index input changed before read")
    const requestToken = randomUUID()
    const value = await this.session.requestRead(method, { ...asRecord(params),
      ...(input ? { input } : {}), requestToken }, signal,
      { readerEpoch: this.capability.readerEpoch, requestToken })
    if (this.inputs.current !== input) throw new SidecarRequestError("invalid_generation", "index input changed during read")
    try {
      const indexProof = decodeReadProof(value, { workspaceIdentity: this.session.workspaceIdentity,
        factsDomain: this.capability.factsDomain, input })
      return attachReadProof(asRecord(value), indexProof)
    } catch (error) {
      if (error instanceof SidecarProtocolError) this.session.protocolFailure(error)
      throw error
    }
  }

  acceptEvent(event: MaintenanceEvent): void {
    const run = this.run
    if (event.scope === "file") {
      const current = this.inputs.current
      if (!current || event.input.issuer !== this.issuer || event.input.revision > current.revision
        || typeof event.uri !== "string" || tryClientWorkspaceUri(this.session, event.uri) === undefined) {
        throw new SidecarProtocolError("index sidecar file task used an unowned input or source identity")
      }
      if (event.event === "maintenance/terminal") {
        decodeMaintenanceTerminal(event, { workspaceIdentity: this.session.workspaceIdentity,
          factsDomain: this.capability.factsDomain, input: event.input })
        this.activity++
        if (run?.waiting) void this.begin(run)
      } else if (run?.waiting) this.armStall(run)
      return
    }
    if (!run || run.settled) return
    if (event.attemptId !== run.attemptId || !sameInput(event.input, run.input)) {
      if (event.input.issuer === this.issuer && event.input.revision < run.input.revision) return
      throw new SidecarProtocolError("index sidecar maintenance event used the wrong task identity")
    }
    if (run.terminal) throw new SidecarProtocolError("index sidecar emitted an event after a maintenance terminal")
    if (event.event === "maintenance/terminal") run.terminal = event
    else {
      // These are traversal-local counters: the final freshness fence starts
      // another traversal. The protocol does not promise a global high-water
      // count; task identity and valid activity delimit the watchdog instead.
      run.progress = event
    }
    if (run.accepted) this.deliver(run)
  }

  reject(error: Error): void {
    this.inputs.stop(error)
    if (this.run) this.settle(this.run, error)
  }

  private async begin(run: Run): Promise<void> {
    if (run.settled || run.starting) return
    run.starting = true
    run.waiting = false
    try {
      await this.inputs.waitForAdmission(run.input, run.signal)
      if (run.settled) return
      if (this.inputs.current !== run.input || run.abortRequested) { this.cancelled(run); return }
      const activity = this.activity
      const result = asRecord(await this.session.request("maintenance/start", {
        attemptId: run.attemptId, input: run.input, reason: "workspace-reconcile", force: false,
      }))
      const status = asRecord(result.status)
      if (typeof result.accepted !== "boolean" || status.statusScope !== "task") {
        throw new SidecarProtocolError("index sidecar returned an invalid maintenance start acknowledgment")
      }
      if (run.settled) return
      if (!result.accepted && status.attemptId !== run.attemptId) {
        if (!isNonNegativeInteger(status.activeMaintenanceTasks) || status.activeMaintenanceTasks > 1
          || !isNonNegativeInteger(status.pendingUriCount)
          || (status.activeMaintenanceTasks === 0 && status.pendingUriCount === 0)) {
          throw new SidecarProtocolError("index sidecar refused maintenance without an active or queued task")
        }
        run.waiting = true
        this.armStall(run)
        if (run.abortRequested) this.cancelled(run)
        else if (activity !== this.activity) queueMicrotask(() => { void this.begin(run) })
        return
      }
      if (status.attemptId !== run.attemptId || !sameInput(decodeInput(status.input), run.input)) {
        throw new SidecarProtocolError("index sidecar returned an invalid maintenance start acknowledgment")
      }
      if (run.settled) return
      run.accepted = true
      this.inputs.acknowledgeReconcile(run.input)
      this.armStall(run)
      this.deliver(run)
      if (run.abortRequested && !run.settled) await this.cancel(run)
    } catch (error) {
      if (error instanceof IndexInputObservationError
        || (run.abortRequested && error instanceof Error && error.name === "AbortError")) this.cancelled(run)
      else this.failed(run, error)
    }
    finally { run.starting = false }
  }

  private cancelled(run: Run): void {
    run.report({ phase: "cancelled", discoveredFiles: 0, indexedFiles: 0, skippedEntries: 0 })
    this.settle(run)
  }

  private deliver(run: Run): void {
    const progress = run.progress
    if (progress) {
      run.report({ phase: "indexing", discoveredFiles: progress.discovered as number,
        indexedFiles: progress.indexed as number, skippedEntries: progress.rejected as number,
        ...(progress.validation ? { validation: progress.validation } : {}) })
      this.armStall(run)
    }
    if (!run.terminal) return
    const terminal = decodeMaintenanceTerminal(run.terminal, { workspaceIdentity: this.session.workspaceIdentity,
      factsDomain: this.capability.factsDomain, input: run.input })
    const qualified = terminal.outcome === "qualified" && terminal.currentInput && this.inputs.current === run.input
    const cancelled = run.abortRequested || terminal.outcome === "cancelled"
      || (terminal.outcome === "qualified" && !qualified)
    run.report({ phase: cancelled ? "cancelled" : qualified ? "ready" : "degraded",
      discoveredFiles: qualified ? terminal.indexedDocuments! : progress?.discovered as number ?? 0,
      indexedFiles: qualified ? terminal.indexedDocuments! : progress?.indexed as number ?? 0,
      ...(qualified ? { totalFiles: terminal.indexedDocuments! } : {}),
      skippedEntries: progress?.rejected as number ?? 0 })
    if (qualified) this.session.lastStatus = { state: "ready", committedGeneration: terminal.qualification!.head }
    const error = terminal.error
    this.settle(run, !qualified && !cancelled ? new SidecarRequestError(
      error && typeof error === "object" ? error.code : terminal.outcome,
      typeof error === "string" ? error : error?.message ?? "index maintenance did not obtain a complete current qualification") : undefined)
  }

  private async cancel(run: Run): Promise<void> {
    if (run.settled || run.cancelStarted) return
    run.cancelStarted = true
    if (run.timer) clearTimeout(run.timer)
    // The terminal deadline starts when cancellation is sent, not when its ACK
    // happens to arrive. An earlier terminal must not install a new stale timer.
    run.cancelTimer = setTimeout(() => {
      if (!run.settled) this.session.failFromHost(new SidecarTimeoutError("maintenance/cancel terminal", this.cancelTimeoutMs))
    }, this.cancelTimeoutMs)
    try {
      const result = asRecord(await this.session.request("maintenance/cancel", { attemptId: run.attemptId, input: run.input }))
      if (typeof result.accepted !== "boolean") throw new SidecarProtocolError("index sidecar returned an invalid maintenance cancel result")
    } catch (error) { this.failed(run, error) }
  }

  private armStall(run: Run): void {
    if (run.settled || run.cancelStarted) return
    if (run.timer) clearTimeout(run.timer)
    run.timer = setTimeout(() => {
      if (!run.settled) this.session.failFromHost(new SidecarTimeoutError("maintenance progress", this.stallTimeoutMs))
    }, this.stallTimeoutMs)
  }
  private failed(run: Run, value: unknown): void {
    const error = value instanceof Error ? value : new Error(String(value))
    if (error instanceof SidecarProtocolError) this.session.protocolFailure(error)
    this.settle(run, error)
  }
  private settle(run: Run, error?: Error): void {
    if (run.settled) return
    run.settled = true
    this.inputs.finishAdmission(run.input)
    if (run.timer) clearTimeout(run.timer)
    if (run.cancelTimer) clearTimeout(run.cancelTimer)
    run.signal?.removeEventListener("abort", run.onAbort)
    if (this.run === run) this.run = undefined
    if (error) run.reject(error)
    else run.resolve()
  }
}
