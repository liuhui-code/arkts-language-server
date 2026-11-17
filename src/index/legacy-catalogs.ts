import type { WorkspaceDescriptor, WorkspaceId } from "../contracts/document.js"
import type { WorkspaceIndexProgress } from "../contracts/workspace-symbol-service.js"
import { SidecarSession, SidecarTimeoutError, abortError, type LegacySidecarProtocolEvent } from "./sidecar-session.js"
import { SidecarProtocolError, asRecord, isNonNegativeInteger } from "./sidecar-protocol-validation.js"
import { mapCatalogStatus, assertMonotonicCatalogProgress, type CatalogProgressMark, type MappedCatalogStatus } from "./catalog-status.js"

interface CatalogRun {
  resolve(): void
  reject(error: Error): void
  report(progress: WorkspaceIndexProgress): void
  bufferedEvents: LegacySidecarProtocolEvent[]
  generation?: number
  abortRequested: boolean
  cancelStarted: boolean
  cancelTimer?: ReturnType<typeof setTimeout>
  stallTimer?: ReturnType<typeof setTimeout>
  lastProgress?: CatalogProgressMark
  settled: boolean
  cleanup(): void
}

export class LegacyCatalogs {
  private readonly catalogRuns = new Map<WorkspaceId, CatalogRun>()
  constructor(
    private readonly session: (workspaceId: WorkspaceId) => SidecarSession,
    private readonly catalogCancelTimeoutMs: number,
    private readonly catalogStallTimeoutMs: number,
  ) {}

  start(
    workspace: WorkspaceDescriptor,
    report: (progress: WorkspaceIndexProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError())
    const session = this.session(workspace.id)
    if (this.catalogRuns.has(workspace.id)) {
      return Promise.reject(new Error(`workspace catalog is already running: ${workspace.id}`))
    }

    let resolve!: () => void
    let reject!: (error: Error) => void
    const promise = new Promise<void>((accept, decline) => {
      resolve = accept
      reject = decline
    })
    const onAbort = () => {
      const run = this.catalogRuns.get(workspace.id)
      if (!run || run.settled) return
      run.abortRequested = true
      if (run.generation !== undefined) void this.cancelCatalog(workspace.id, session, run)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    let run!: CatalogRun
    run = {
      resolve,
      reject,
      report,
      bufferedEvents: [],
      abortRequested: false,
      cancelStarted: false,
      settled: false,
      cleanup: () => {
        signal?.removeEventListener("abort", onAbort)
        if (run.cancelTimer) clearTimeout(run.cancelTimer)
        if (run.stallTimer) clearTimeout(run.stallTimer)
      },
    }
    this.catalogRuns.set(workspace.id, run)
    if (signal?.aborted) onAbort()
    void this.beginCatalog(workspace.id, session, run)
    return promise
  }

  private async beginCatalog(
    workspaceId: WorkspaceId,
    session: SidecarSession,
    run: CatalogRun,
  ): Promise<void> {
    try {
      const result = asRecord(await session.request("catalog/start", {
        reason: "workspace-open",
        force: false,
      }))
      if (typeof result.accepted !== "boolean" || !isNonNegativeInteger(result.generation)) {
        throw new SidecarProtocolError("index sidecar returned an invalid catalog start result")
      }
      run.generation = result.generation
      this.reportCatalogStatus(workspaceId, session, run, result.status)
      for (const event of run.bufferedEvents.splice(0)) {
        if (run.settled) break
        this.applyCatalogEvent(workspaceId, session, run, event)
      }
      if (run.abortRequested && !run.settled) {
        await this.cancelCatalog(workspaceId, session, run)
      }
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      this.reject(workspaceId, asError(error))
    }
  }

  private async cancelCatalog(
    workspaceId: WorkspaceId,
    session: SidecarSession,
    run: CatalogRun,
  ): Promise<void> {
    if (run.generation === undefined || run.settled || run.cancelStarted) return
    run.cancelStarted = true
    try {
      const result = asRecord(await session.request("catalog/cancel", {
        generation: run.generation,
      }))
      if (typeof result.cancelled !== "boolean" || result.generation !== run.generation) {
        throw new SidecarProtocolError("index sidecar returned an invalid catalog cancel result")
      }
      this.reportCatalogStatus(workspaceId, session, run, result.status)
      if (!run.settled) {
        run.cancelTimer = setTimeout(() => {
          session.failFromHost(
            new SidecarTimeoutError("catalog/cancel terminal", this.catalogCancelTimeoutMs),
          )
        }, this.catalogCancelTimeoutMs)
      }
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      this.reject(workspaceId, asError(error))
    }
  }

  acceptEvent(workspaceId: WorkspaceId, event: LegacySidecarProtocolEvent): void {
    const run = this.catalogRuns.get(workspaceId)
    if (!run || run.settled) return
    const session = this.session(workspaceId)
    if (event.params.workspaceIdentity !== session.workspaceIdentity) {
      throw new SidecarProtocolError("index sidecar catalog event used the wrong workspace identity")
    }
    if (run.generation === undefined) {
      run.bufferedEvents.push(event)
      return
    }
    this.applyCatalogEvent(workspaceId, session, run, event)
  }

  private applyCatalogEvent(
    workspaceId: WorkspaceId,
    session: SidecarSession,
    run: CatalogRun,
    event: LegacySidecarProtocolEvent,
  ): void {
    const mapped = mapCatalogStatus(event.params.status)
    this.validateCatalogGeneration(run, mapped)
    this.reportCatalogProgress(workspaceId, session, run, mapped)
  }

  private reportCatalogStatus(
    workspaceId: WorkspaceId,
    session: SidecarSession,
    run: CatalogRun,
    value: unknown,
  ): void {
    const mapped = mapCatalogStatus(value)
    this.validateCatalogGeneration(run, mapped)
    this.reportCatalogProgress(workspaceId, session, run, mapped)
  }

  private reportCatalogProgress(
    workspaceId: WorkspaceId,
    session: SidecarSession,
    run: CatalogRun,
    mapped: MappedCatalogStatus,
  ): void {
    if (run.settled) return
    session.lastStatus = mapped.indexStatus
    run.report(mapped.progress)
    if (!mapped.terminal) {
      if (run.cancelStarted && mapped.phase === "cancelling") {
        if (run.stallTimer) clearTimeout(run.stallTimer)
        run.stallTimer = undefined
        return
      }
      this.advanceCatalogWatchdog(workspaceId, session, run, mapped.mark)
      return
    }
    run.settled = true
    run.cleanup()
    if (this.catalogRuns.get(workspaceId) === run) this.catalogRuns.delete(workspaceId)
    run.resolve()
  }

  private validateCatalogGeneration(run: CatalogRun, mapped: MappedCatalogStatus): void {
    if (run.generation === undefined) {
      throw new SidecarProtocolError("index sidecar catalog status arrived before generation")
    }
    if (!mapped.terminal) {
      if (mapped.buildingGeneration !== run.generation) {
        throw new SidecarProtocolError("index sidecar catalog status used the wrong generation")
      }
      return
    }
    if ((mapped.phase === "ready" || mapped.phase === "partial")
      && mapped.committedGeneration !== run.generation) {
      throw new SidecarProtocolError("index sidecar catalog terminal committed the wrong generation")
    }
    if (mapped.phase === "cancelled" && !run.cancelStarted) {
      throw new SidecarProtocolError("index sidecar cancelled a catalog that was not cancelled")
    }
  }

  private advanceCatalogWatchdog(
    workspaceId: WorkspaceId,
    session: SidecarSession,
    run: CatalogRun,
    mark: CatalogProgressMark,
  ): void {
    const previous = run.lastProgress
    if (previous) {
      assertMonotonicCatalogProgress(previous, mark)
    }
    run.lastProgress = mark
    if (run.stallTimer) clearTimeout(run.stallTimer)
    run.stallTimer = setTimeout(() => {
      if (this.catalogRuns.get(workspaceId) !== run || run.settled) return
      session.failFromHost(
        new SidecarTimeoutError("catalog progress", this.catalogStallTimeoutMs),
      )
    }, this.catalogStallTimeoutMs)
  }

  reject(workspaceId: WorkspaceId, error: Error): void {
    const run = this.catalogRuns.get(workspaceId)
    if (!run || run.settled) return
    run.settled = true
    run.cleanup()
    this.catalogRuns.delete(workspaceId)
    run.reject(error)
  }
}
function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
