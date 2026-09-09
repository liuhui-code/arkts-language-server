import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdir, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import type {
  DocumentSnapshot,
  DocumentUri,
  WorkspaceDescriptor,
  WorkspaceId,
} from "../contracts/document.js"
import type { WorkspaceCatalogPort } from "../contracts/workspace-catalog.js"
import type {
  WorkspaceExportCandidate,
  WorkspaceExportIndexPort,
  WorkspaceExportSearchResult,
  WorkspaceIndexPort,
  WorkspaceIndexStatus,
  WorkspaceSymbol,
  WorkspaceSymbolSearchResult,
} from "../contracts/workspace-index.js"
import type { WorkspaceIndexProgress } from "../contracts/workspace-symbol-service.js"
import { resolveIndexSidecarPath, type SidecarPathOptions } from "./sidecar-path.js"

const PROTOCOL_VERSION = 1
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_INITIALIZE_TIMEOUT_MS = 30_000
const DEFAULT_TERMINATION_TIMEOUT_MS = 1_000
const DEFAULT_CATALOG_STALL_TIMEOUT_MS = 30_000

interface SidecarResponse {
  protocol: number
  id: number
  ok: boolean
  result?: unknown
  error?: { code?: string; message?: string }
}

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: Error): void
  cleanup(): void
}

export interface SidecarProtocolEvent {
  protocol: 1
  event: "catalog/progress"
  params: {
    workspaceIdentity: string
    status: Record<string, unknown>
  }
}

export interface SidecarWorkspaceIndexOptions extends SidecarPathOptions {
  onEvent?(event: SidecarProtocolEvent): void
  requestTimeoutMs?: number
  initializeTimeoutMs?: number
  terminationTimeoutMs?: number
  catalogCancelTimeoutMs?: number
  catalogStallTimeoutMs?: number
}

interface CatalogRun {
  resolve(): void
  reject(error: Error): void
  report(progress: WorkspaceIndexProgress): void
  bufferedEvents: SidecarProtocolEvent[]
  generation?: number
  abortRequested: boolean
  cancelStarted: boolean
  cancelTimer?: ReturnType<typeof setTimeout>
  stallTimer?: ReturnType<typeof setTimeout>
  lastProgress?: CatalogProgressMark
  settled: boolean
  cleanup(): void
}

export class SidecarWorkspaceIndex implements WorkspaceIndexPort, WorkspaceCatalogPort, WorkspaceExportIndexPort {
  private readonly sessions = new Map<WorkspaceId, SidecarSession>()
  private readonly openingWorkspaces = new Map<WorkspaceId, Promise<WorkspaceIndexStatus>>()
  private readonly catalogRuns = new Map<WorkspaceId, CatalogRun>()
  private readonly options: SidecarWorkspaceIndexOptions
  private readonly catalogCancelTimeoutMs: number
  private readonly catalogStallTimeoutMs: number

  constructor(options: SidecarWorkspaceIndexOptions = {}) {
    this.options = options
    this.catalogCancelTimeoutMs = resolveRequestTimeout(
      options.catalogCancelTimeoutMs ?? options.requestTimeoutMs,
    )
    this.catalogStallTimeoutMs = resolvePositiveTimeout(
      options.catalogStallTimeoutMs,
      DEFAULT_CATALOG_STALL_TIMEOUT_MS,
      "catalog stall",
    )
  }

  open(workspace: WorkspaceDescriptor, cacheDir: string): Promise<WorkspaceIndexStatus> {
    if (this.sessions.has(workspace.id) || this.openingWorkspaces.has(workspace.id)) {
      return Promise.reject(new Error(`workspace index is already open: ${workspace.id}`))
    }
    const opening = this.openWorkspace(workspace, cacheDir)
    this.openingWorkspaces.set(workspace.id, opening)
    void opening.then(
      () => this.openingWorkspaces.delete(workspace.id),
      () => this.openingWorkspaces.delete(workspace.id),
    )
    return opening
  }

  private async openWorkspace(
    workspace: WorkspaceDescriptor,
    cacheDir: string,
  ): Promise<WorkspaceIndexStatus> {
    const workspaceRoot = await canonicalFileWorkspaceRoot(workspace.rootUri)
    const cacheDirectory = await canonicalDirectory(cacheDir)
    const session = new SidecarSession(
      resolveIndexSidecarPath(this.options),
      (event) => {
        this.acceptCatalogEvent(workspace.id, event)
        this.options.onEvent?.(event)
      },
      (error) => this.rejectCatalog(workspace.id, error),
      resolveRequestTimeout(this.options.requestTimeoutMs),
      resolveInitializeTimeout(this.options.initializeTimeoutMs),
      resolveTerminationTimeout(this.options.terminationTimeoutMs),
    )
    session.clientRootUri = workspace.rootUri
    this.sessions.set(workspace.id, session)
    try {
      const initialized = asRecord(await session.request("initialize", {
        workspaceRoot,
        cacheDirectory,
      }))
      if (typeof initialized.workspaceIdentity !== "string") {
        throw new SidecarProtocolError("index sidecar omitted workspace identity")
      }
      assertEquivalentWorkspaceIdentity(initialized.workspaceIdentity, workspaceRoot)
      session.workspaceIdentity = initialized.workspaceIdentity
      const status = mapStatus(initialized.status)
      session.lastStatus = status
      return status
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      this.sessions.delete(workspace.id)
      await session.closeAfterFailure()
      throw error
    }
  }

  async refresh(
    workspaceId: WorkspaceId,
    generation: number,
    changed: readonly DocumentSnapshot[],
    removedUris: readonly string[],
    signal?: AbortSignal,
  ): Promise<WorkspaceIndexStatus> {
    const session = this.session(workspaceId)
    try {
      const result = asRecord(await session.request("refresh", {
        generation,
        changed: changed.map(({ uri, text }) => ({
          uri: toWorkspaceIdentityUri(session, uri),
          text,
        })),
        removedUris: removedUris.map((uri) => toWorkspaceIdentityUri(session, uri)),
      }, signal))
      const status = mapStatus(result.status)
      session.lastStatus = status
      return status
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async searchSymbols(
    workspaceId: WorkspaceId,
    query: string,
    limit: number,
    signal?: AbortSignal,
    excludedUris: readonly DocumentUri[] = [],
  ): Promise<WorkspaceSymbolSearchResult> {
    const session = this.session(workspaceId)
    try {
      return mapSearchResult(await session.request(
        "search",
        {
          query,
          limit,
          excludedUris: excludedUris.flatMap((uri) => {
            const rebased = tryWorkspaceIdentityUri(session, uri)
            return rebased === undefined ? [] : [rebased]
          }),
        },
        signal,
      ), (uri) => toClientWorkspaceUri(session, uri))
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async searchExports(
    workspaceId: WorkspaceId,
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceExportSearchResult> {
    const session = this.session(workspaceId)
    try {
      return mapExportSearchResult(await session.request(
        "exports/search",
        { query, limit },
        signal,
      ), (uri) => toClientWorkspaceUri(session, uri))
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

  async status(workspaceId: WorkspaceId): Promise<WorkspaceIndexStatus> {
    const session = this.session(workspaceId)
    const degraded = session.degradedStatus()
    if (degraded) return degraded
    try {
      const status = mapStatus(await session.request("status", {}))
      session.lastStatus = status
      return status
    } catch (error) {
      if (error instanceof SidecarProtocolError) session.protocolFailure(error)
      throw error
    }
  }

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

  async close(workspaceId: WorkspaceId): Promise<void> {
    const opening = this.openingWorkspaces.get(workspaceId)
    if (opening) {
      try { await opening } catch { return }
    }
    const session = this.sessions.get(workspaceId)
    if (!session) return
    this.rejectCatalog(workspaceId, new Error("workspace index closed during cataloging"))
    try {
      await session.close()
    } finally {
      this.sessions.delete(workspaceId)
    }
  }

  private session(workspaceId: WorkspaceId): SidecarSession {
    const session = this.sessions.get(workspaceId)
    if (!session) throw new Error(`workspace index is not open: ${workspaceId}`)
    return session
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
      this.rejectCatalog(workspaceId, asError(error))
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
      this.rejectCatalog(workspaceId, asError(error))
    }
  }

  private acceptCatalogEvent(workspaceId: WorkspaceId, event: SidecarProtocolEvent): void {
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
    event: SidecarProtocolEvent,
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
      if (!catalogProgressAdvanced(previous, mark)) return
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

  private rejectCatalog(workspaceId: WorkspaceId, error: Error): void {
    const run = this.catalogRuns.get(workspaceId)
    if (!run || run.settled) return
    run.settled = true
    run.cleanup()
    this.catalogRuns.delete(workspaceId)
    run.reject(error)
  }
}

class SidecarSession {
  readonly child: ChildProcessWithoutNullStreams
  lastStatus: WorkspaceIndexStatus = { state: "warming", committedGeneration: 0 }
  workspaceIdentity = ""
  clientRootUri = ""
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly abandoned = new Map<number, ReturnType<typeof setTimeout>>()
  private stdoutBuffer = ""
  private closePromise: Promise<void> | undefined
  private closed = false
  private closing = false
  private failure: Error | undefined
  private terminationPromise: Promise<void> | undefined
  private readonly closedPromise: Promise<void>
  private resolveClosed!: () => void

  constructor(
    sidecarPath: string,
    private readonly onEvent?: (event: SidecarProtocolEvent) => void,
    private readonly onFailure?: (error: Error) => void,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    private readonly initializeTimeoutMs = DEFAULT_INITIALIZE_TIMEOUT_MS,
    private readonly terminationTimeoutMs = DEFAULT_TERMINATION_TIMEOUT_MS,
  ) {
    this.closedPromise = new Promise((resolve) => { this.resolveClosed = resolve })
    this.child = spawn(sidecarPath, [], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    this.child.stdout.setEncoding("utf8")
    this.child.stdout.on("data", (chunk: string) => this.acceptStdout(chunk))
    // Always drain stderr to avoid child-process backpressure, but retain none of
    // its potentially source-bearing content in memory or public error objects.
    this.child.stderr.resume()
    this.child.on("error", (error) => this.fail(error, true))
    this.child.on("close", (code, signal) => {
      this.closed = true
      if (!this.closing) {
        this.fail(new Error(`index sidecar exited (code=${code ?? "null"}, signal=${signal ?? "null"})`))
      }
      this.resolveClosed()
    })
  }

  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    return this.sendRequest(method, params, signal, false)
  }

  protocolFailure(error: SidecarProtocolError): void {
    this.fail(error, true)
  }

  failFromHost(error: Error): void {
    this.fail(error, true)
  }

  private sendRequest(
    method: string,
    params: unknown,
    signal: AbortSignal | undefined,
    allowClosing: boolean,
  ): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure)
    if (this.closed || (this.closing && !allowClosing)) {
      return Promise.reject(new Error("index sidecar session is closed"))
    }
    if (signal?.aborted) return Promise.reject(abortError())
    const timeoutMs = method === "initialize" ? this.initializeTimeoutMs : this.requestTimeoutMs
    const id = this.nextRequestId++
    const line = `${JSON.stringify({ protocol: PROTOCOL_VERSION, id, method, params })}\n`
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const onAbort = () => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        pending.cleanup()
        this.abandoned.set(id, setTimeout(() => {
          if (!this.abandoned.delete(id)) return
          this.fail(
            new SidecarTimeoutError(`${method} cancellation drain`, timeoutMs),
            true,
          )
        }, timeoutMs))
        pending.reject(abortError())
      }
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort)
        if (timer) clearTimeout(timer)
      }
      this.pending.set(id, { resolve, reject, cleanup })
      signal?.addEventListener("abort", onAbort, { once: true })
      timer = setTimeout(() => {
        if (!this.pending.has(id)) return
        this.fail(new SidecarTimeoutError(method, timeoutMs), true)
      }, timeoutMs)
      this.child.stdin.write(line, (error) => {
        if (!error) return
        this.fail(error, true)
      })
    })
  }

  close(): Promise<void> {
    this.closePromise ??= this.shutdown()
    return this.closePromise
  }

  degradedStatus(): WorkspaceIndexStatus | undefined {
    if (!this.failure) return undefined
    return {
      state: "degraded",
      committedGeneration: this.lastStatus.committedGeneration,
      message: this.failure.message,
    }
  }

  async closeAfterFailure(): Promise<void> {
    await this.terminate()
  }

  private async shutdown(): Promise<void> {
    if (this.closed) return
    if (this.failure) {
      await this.terminate()
      return
    }
    this.closing = true
    try {
      await this.sendRequest("shutdown", {}, undefined, true)
    } catch {
      await this.terminate()
      return
    }
    this.rejectPending(new Error("index sidecar session is closed"))
    this.clearAbandoned()
    this.child.stdin.end()
    if (!await this.waitForClose(this.terminationTimeoutMs)) {
      await this.terminate()
    }
  }

  private acceptStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    while (true) {
      const newline = this.stdoutBuffer.indexOf("\n")
      if (newline < 0) return
      const line = this.stdoutBuffer.slice(0, newline)
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (!line.trim()) {
        this.protocolFailure(new SidecarProtocolError("index sidecar emitted an empty protocol line"))
      } else {
        this.acceptLine(line)
      }
    }
  }

  private acceptLine(line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line) as unknown
    } catch {
      this.protocolFailure(new SidecarProtocolError("index sidecar emitted malformed JSON"))
      return
    }
    if (isIdlessEventEnvelope(parsed)) {
      if (!isProtocolEvent(parsed)) {
        this.protocolFailure(new SidecarProtocolError("index sidecar emitted an unrecognized sidecar event"))
        return
      }
      try {
        this.onEvent?.(parsed)
      } catch (error) {
        this.protocolFailure(error instanceof SidecarProtocolError
          ? error
          : new SidecarProtocolError("index sidecar event handler failed"))
      }
      return
    }
    if (!isRecord(parsed)
      || parsed.protocol !== PROTOCOL_VERSION
      || !Number.isSafeInteger(parsed.id)
      || typeof parsed.ok !== "boolean") {
      this.protocolFailure(new SidecarProtocolError("index sidecar emitted an invalid protocol response"))
      return
    }
    const response = parsed as unknown as SidecarResponse
    const pending = this.pending.get(response.id)
    if (!pending) {
      const abandonedTimer = this.abandoned.get(response.id)
      if (abandonedTimer) {
        clearTimeout(abandonedTimer)
        this.abandoned.delete(response.id)
        return
      }
      this.protocolFailure(
        new SidecarProtocolError(`index sidecar emitted an unknown response id: ${response.id}`),
      )
      return
    }
    if (response.ok) {
      if (!("result" in parsed)) {
        this.protocolFailure(
          new SidecarProtocolError("index sidecar omitted a successful response result"),
        )
        return
      }
      this.pending.delete(response.id)
      pending.cleanup()
      pending.resolve(response.result)
    } else {
      if (!isRecord(response.error)
        || typeof response.error.code !== "string"
        || typeof response.error.message !== "string") {
        this.protocolFailure(new SidecarProtocolError("index sidecar emitted an invalid error response"))
        return
      }
      this.pending.delete(response.id)
      pending.cleanup()
      pending.reject(new SidecarRequestError(
        response.error.code,
        response.error.message,
      ))
    }
  }

  private fail(error: Error, terminate = false): void {
    const firstFailure = this.failure === undefined
    this.failure ??= error
    if (firstFailure) this.onFailure?.(this.failure)
    this.rejectPending(this.failure)
    this.clearAbandoned()
    if (terminate && !this.closed) {
      void this.terminate()
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.cleanup()
      pending.reject(error)
    }
    this.pending.clear()
  }

  private clearAbandoned(): void {
    for (const timer of this.abandoned.values()) clearTimeout(timer)
    this.abandoned.clear()
  }

  private terminate(): Promise<void> {
    this.terminationPromise ??= this.terminateProcess()
    return this.terminationPromise
  }

  private async terminateProcess(): Promise<void> {
    this.closing = true
    if (this.closed) return
    this.child.kill("SIGTERM")
    if (await this.waitForClose(this.terminationTimeoutMs)) return
    this.child.kill("SIGKILL")
    await this.waitForClose(this.terminationTimeoutMs)
  }

  private waitForClose(timeoutMs: number): Promise<boolean> {
    if (this.closed) return Promise.resolve(true)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs)
      void this.closedPromise.then(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
  }
}

export class SidecarRequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = "SidecarRequestError"
  }
}

export class SidecarProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SidecarProtocolError"
  }
}

export class SidecarTimeoutError extends Error {
  constructor(readonly method: string, readonly timeoutMs: number) {
    super(`index sidecar ${method} timed out after ${timeoutMs}ms`)
    this.name = "SidecarTimeoutError"
  }
}

async function canonicalFileWorkspaceRoot(rootUri: string): Promise<string> {
  const url = new URL(rootUri)
  if (url.protocol !== "file:") throw new Error(`workspace root must be a file URI: ${rootUri}`)
  return realpath(fileURLToPath(url))
}

async function canonicalDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory)
  await mkdir(absolute, { recursive: true })
  return realpath(absolute)
}

function mapStatus(value: unknown): WorkspaceIndexStatus {
  const status = asRecord(value)
  if (!isIndexState(status.state) || !isNonNegativeInteger(status.committedGeneration)) {
    throw new SidecarProtocolError("index sidecar returned an invalid status")
  }
  return {
    state: status.state,
    committedGeneration: status.committedGeneration,
    ...(typeof status.message === "string" ? { message: status.message } : {}),
  }
}

function mapSearchResult(
  value: unknown,
  mapUri: (uri: DocumentUri) => DocumentUri = (uri) => uri,
): WorkspaceSymbolSearchResult {
  const result = asRecord(value)
  if (!Array.isArray(result.items)
    || !isNonNegativeInteger(result.servedGeneration)
    || !isCompleteness(result.completeness)) {
    throw new Error("index sidecar returned an invalid symbol search result")
  }
  return {
    items: result.items.map((item) => {
      const symbol = mapWorkspaceSymbol(item)
      return { ...symbol, uri: mapUri(symbol.uri) }
    }),
    servedGeneration: result.servedGeneration,
    completeness: result.completeness,
  }
}

function mapExportSearchResult(
  value: unknown,
  mapUri: (uri: DocumentUri) => DocumentUri = (uri) => uri,
): WorkspaceExportSearchResult {
  const result = asRecord(value)
  if (!Array.isArray(result.items)
    || !isNonNegativeInteger(result.servedGeneration)
    || !isCompleteness(result.completeness)) {
    throw new SidecarProtocolError("index sidecar returned an invalid export search result")
  }
  return {
    items: result.items.map((item) => {
      const candidate = mapWorkspaceExport(item)
      return { ...candidate, uri: mapUri(candidate.uri) }
    }),
    servedGeneration: result.servedGeneration,
    completeness: result.completeness,
  }
}

interface MappedCatalogStatus {
  progress: WorkspaceIndexProgress
  indexStatus: WorkspaceIndexStatus
  phase: CatalogPhase
  committedGeneration: number
  buildingGeneration: number | null
  mark: CatalogProgressMark
  terminal: boolean
}

interface CatalogProgressMark {
  phase: CatalogPhase
  discovered: number
  indexed: number
  rejected: number
  policySkipped: number
  ignored: number
  totalFiles?: number
}

function mapCatalogStatus(value: unknown): MappedCatalogStatus {
  const status = asRecord(value)
  if (!isCatalogPhase(status.phase)
    || !isIndexState(status.state)
    || !isCompleteness(status.completeness)
    || !isNonNegativeInteger(status.committedGeneration)
    || !isNullableGeneration(status.buildingGeneration)
    || !isNonNegativeInteger(status.discovered)
    || !isNonNegativeInteger(status.indexed)
    || !isNonNegativeInteger(status.rejected)
    || !isNonNegativeInteger(status.policySkipped)
    || !isNonNegativeInteger(status.ignored)
    || (status.totalFiles !== undefined && !isNonNegativeInteger(status.totalFiles))) {
    throw new SidecarProtocolError("index sidecar returned an invalid catalog status")
  }
  const phase = mapCatalogPhase(status.phase, status.totalFiles !== undefined)
  return {
    progress: {
      phase,
      discoveredFiles: status.discovered,
      indexedFiles: status.indexed,
      skippedEntries: status.rejected + status.policySkipped + status.ignored,
      ...(status.totalFiles === undefined ? {} : { totalFiles: status.totalFiles }),
    },
    indexStatus: {
      state: status.state,
      committedGeneration: status.committedGeneration,
      ...(typeof status.message === "string" ? { message: status.message } : {}),
    },
    phase: status.phase,
    committedGeneration: status.committedGeneration,
    buildingGeneration: status.buildingGeneration,
    mark: {
      phase: status.phase,
      discovered: status.discovered,
      indexed: status.indexed,
      rejected: status.rejected,
      policySkipped: status.policySkipped,
      ignored: status.ignored,
      ...(status.totalFiles === undefined ? {} : { totalFiles: status.totalFiles }),
    },
    terminal: status.phase === "ready"
      || status.phase === "partial"
      || status.phase === "degraded"
      || status.phase === "cancelled",
  }
}

function mapWorkspaceSymbol(value: unknown): WorkspaceSymbol {
  const symbol = asRecord(value)
  if (typeof symbol.name !== "string"
    || typeof symbol.kind !== "string"
    || typeof symbol.uri !== "string"
    || (symbol.containerName !== undefined
      && symbol.containerName !== null
      && typeof symbol.containerName !== "string")) {
    throw new SidecarProtocolError("index sidecar returned an invalid workspace symbol")
  }
  const range = asRecord(symbol.range)
  const start = mapPosition(range.start)
  const end = mapPosition(range.end)
  return {
    name: symbol.name,
    kind: symbol.kind,
    uri: symbol.uri,
    range: { start, end },
    ...(typeof symbol.containerName === "string" ? { containerName: symbol.containerName } : {}),
  }
}

function mapWorkspaceExport(value: unknown): WorkspaceExportCandidate {
  const candidate = asRecord(value)
  if (typeof candidate.exportedName !== "string"
    || typeof candidate.kind !== "string"
    || typeof candidate.uri !== "string"
    || !isNonNegativeInteger(candidate.ordinal)) {
    throw new SidecarProtocolError("index sidecar returned an invalid export candidate")
  }
  for (const field of ["declarationIdentity", "importSpecifier", "moduleId", "targetScope"] as const) {
    if (candidate[field] !== undefined && typeof candidate[field] !== "string") {
      throw new SidecarProtocolError("index sidecar returned invalid export metadata")
    }
  }
  const range = asRecord(candidate.range)
  return {
    exportedName: candidate.exportedName,
    kind: candidate.kind,
    uri: candidate.uri,
    range: { start: mapPosition(range.start), end: mapPosition(range.end) },
    ordinal: candidate.ordinal,
    ...(typeof candidate.declarationIdentity === "string"
      ? { declarationIdentity: candidate.declarationIdentity }
      : {}),
    ...(typeof candidate.importSpecifier === "string"
      ? { importSpecifier: candidate.importSpecifier }
      : {}),
    ...(typeof candidate.moduleId === "string" ? { moduleId: candidate.moduleId } : {}),
    ...(typeof candidate.targetScope === "string" ? { targetScope: candidate.targetScope } : {}),
  }
}

function mapPosition(value: unknown): { line: number; character: number } {
  const position = asRecord(value)
  if (!isNonNegativeInteger(position.line) || !isNonNegativeInteger(position.character)) {
    throw new SidecarProtocolError("index sidecar returned an invalid symbol position")
  }
  return { line: position.line, character: position.character }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SidecarProtocolError("index sidecar returned an invalid object")
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isProtocolEvent(value: unknown): value is SidecarProtocolEvent {
  if (!(isRecord(value)
    && value.protocol === PROTOCOL_VERSION
    && !("id" in value)
    && value.event === "catalog/progress"
    && isRecord(value.params)
    && typeof value.params.workspaceIdentity === "string")) return false
  try {
    mapCatalogStatus(value.params.status)
    return true
  } catch {
    return false
  }
}

function isIdlessEventEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && value.protocol === PROTOCOL_VERSION
    && !("id" in value)
    && "event" in value
}

function isIndexState(value: unknown): value is WorkspaceIndexStatus["state"] {
  return value === "warming" || value === "ready" || value === "degraded"
}

function isCompleteness(value: unknown): value is WorkspaceSymbolSearchResult["completeness"] {
  return value === "ready" || value === "partial" || value === "stale"
}

type CatalogPhase = "idle" | "discovering" | "activating" | "cancelling" | "ready" | "partial" | "degraded" | "cancelled"

function isCatalogPhase(value: unknown): value is CatalogPhase {
  return value === "idle"
    || value === "discovering"
    || value === "activating"
    || value === "cancelling"
    || value === "ready"
    || value === "partial"
    || value === "degraded"
    || value === "cancelled"
}

function mapCatalogPhase(
  phase: CatalogPhase,
  totalKnown: boolean,
): WorkspaceIndexProgress["phase"] {
  if (phase === "ready" || phase === "partial") return "ready"
  if (phase === "degraded") return "degraded"
  if (phase === "cancelled") return "cancelled"
  if (phase === "activating" || phase === "cancelling" || totalKnown) return "indexing"
  return "discovering"
}

function assertMonotonicCatalogProgress(
  previous: CatalogProgressMark,
  current: CatalogProgressMark,
): void {
  const regressed = catalogPhaseRank(current.phase) < catalogPhaseRank(previous.phase)
    || current.discovered < previous.discovered
    || current.indexed < previous.indexed
    || current.rejected < previous.rejected
    || current.policySkipped < previous.policySkipped
    || current.ignored < previous.ignored
    || (previous.totalFiles !== undefined
      && (current.totalFiles === undefined || current.totalFiles < previous.totalFiles))
  if (regressed) {
    throw new SidecarProtocolError("index sidecar catalog progress regressed")
  }
}

function catalogProgressAdvanced(
  previous: CatalogProgressMark,
  current: CatalogProgressMark,
): boolean {
  return catalogPhaseRank(current.phase) > catalogPhaseRank(previous.phase)
    || current.discovered > previous.discovered
    || current.indexed > previous.indexed
    || current.rejected > previous.rejected
    || current.policySkipped > previous.policySkipped
    || current.ignored > previous.ignored
    || (previous.totalFiles === undefined && current.totalFiles !== undefined)
    || (previous.totalFiles !== undefined
      && current.totalFiles !== undefined
      && current.totalFiles > previous.totalFiles)
}

function catalogPhaseRank(phase: CatalogPhase): number {
  switch (phase) {
    case "idle": return 0
    case "discovering": return 1
    case "activating": return 2
    case "cancelling": return 3
    case "ready":
    case "partial":
    case "degraded":
    case "cancelled": return 4
  }
}

function isNullableGeneration(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function abortError(): Error {
  return new DOMException("Index request aborted", "AbortError")
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function assertEquivalentWorkspaceIdentity(identity: string, canonicalRoot: string): void {
  try {
    const identityPath = fileURLToPath(identity)
    if (path.resolve(identityPath) === path.resolve(canonicalRoot)) return
  } catch {
    // Fall through to the locked protocol error.
  }
  throw new SidecarProtocolError("index sidecar returned the wrong workspace identity")
}

function toWorkspaceIdentityUri(session: SidecarSession, uri: DocumentUri): DocumentUri {
  const rebased = tryWorkspaceIdentityUri(session, uri)
  if (rebased !== undefined) return rebased
  throw new Error(`document URI is outside workspace root: ${uri}`)
}

function tryWorkspaceIdentityUri(
  session: SidecarSession,
  uri: DocumentUri,
): DocumentUri | undefined {
  return tryRebaseFileUri(uri, session.clientRootUri, session.workspaceIdentity)
    ?? tryRebaseFileUri(uri, session.workspaceIdentity, session.workspaceIdentity)
}

function toClientWorkspaceUri(session: SidecarSession, uri: DocumentUri): DocumentUri {
  const rebased = tryRebaseFileUri(uri, session.workspaceIdentity, session.clientRootUri)
  if (rebased !== undefined) return rebased
  throw new SidecarProtocolError(`index sidecar returned a symbol outside workspace root: ${uri}`)
}

function tryRebaseFileUri(
  documentUri: DocumentUri,
  sourceRootUri: DocumentUri,
  targetRootUri: DocumentUri,
): DocumentUri | undefined {
  try {
    const sourceRoot = fileURLToPath(sourceRootUri)
    const documentPath = fileURLToPath(documentUri)
    const relative = path.relative(sourceRoot, documentPath)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return undefined
    }
    return pathToFileURL(path.join(fileURLToPath(targetRootUri), relative)).href
  } catch {
    return undefined
  }
}

function resolveRequestTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_REQUEST_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("index sidecar request timeout must be a positive number")
  }
  return timeout
}

function resolveInitializeTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_INITIALIZE_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("index sidecar initialize timeout must be a positive number")
  }
  return timeout
}

function resolveTerminationTimeout(value: number | undefined): number {
  const timeout = value ?? DEFAULT_TERMINATION_TIMEOUT_MS
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("index sidecar termination timeout must be a positive number")
  }
  return timeout
}

function resolvePositiveTimeout(
  value: number | undefined,
  fallback: number,
  label: string,
): number {
  const timeout = value ?? fallback
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError(`index sidecar ${label} timeout must be a positive number`)
  }
  return timeout
}
