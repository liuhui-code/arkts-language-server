import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { WorkspaceIndexStatus } from "../contracts/workspace-index.js"
import { SidecarProtocolError, isRecord } from "./sidecar-protocol-validation.js"
import { decodeMaintenanceEvent, type MaintenanceEvent } from "./maintenance-events.js"
import type { VersionedMaintenance } from "./versioned-maintenance.js"
import { mapCatalogStatus } from "./catalog-status.js"
import { DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_INITIALIZE_TIMEOUT_MS, DEFAULT_TERMINATION_TIMEOUT_MS } from "./sidecar-timeouts.js"
const PROTOCOL_VERSION = 1

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

export interface LegacySidecarProtocolEvent {
  protocol: 1
  event: "catalog/progress"
  params: {
    workspaceIdentity: string
    status: Record<string, unknown>
  }
}

export type SidecarProtocolEvent = LegacySidecarProtocolEvent | MaintenanceEvent

interface ReadIdentity { readerEpoch: string; requestToken: string }
const READ_METHODS = new Set(["search", "exports/search", "references/candidates", "class-bindings/resolve", "index/status"])

export class SidecarSession {
  versioned?: VersionedMaintenance
  private readonly readIdentities = new Map<number, ReadIdentity>()
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
    if (this.versioned && READ_METHODS.has(method)) return this.versioned.read(method, params, signal)
    return this.sendRequest(method, params, signal, false)
  }

  requestRead(method: string, params: unknown, signal: AbortSignal | undefined, identity: ReadIdentity): Promise<unknown> {
    return this.sendRequest(method, params, signal, false, identity)
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
    reader?: ReadIdentity,
  ): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure)
    if (this.closed || (this.closing && !allowClosing)) {
      return Promise.reject(new Error("index sidecar session is closed"))
    }
    if (signal?.aborted) return Promise.reject(abortError())
    const timeoutMs = method === "initialize" ? this.initializeTimeoutMs : this.requestTimeoutMs
    const id = this.nextRequestId++
    if (reader) this.readIdentities.set(id, reader)
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
        if (reader) {
          void this.request("index/cancel", { ...reader, requestId: id }).then(value => {
            if (!isRecord(value) || typeof value.accepted !== "boolean") {
              this.protocolFailure(new SidecarProtocolError("index sidecar returned an invalid read cancel result"))
            }
          }, error => this.fail(error instanceof Error ? error : new Error(String(error)), true))
        }
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
    const reader = this.readIdentities.get(response.id)
    if (reader) {
      if ((response.ok || "readerEpoch" in parsed || "requestToken" in parsed)
        && (parsed.readerEpoch !== reader.readerEpoch || parsed.requestToken !== reader.requestToken)) {
        this.protocolFailure(new SidecarProtocolError("index sidecar returned the wrong read identity"))
        return
      }
      this.readIdentities.delete(response.id)
    }
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
    this.readIdentities.clear()
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

export class SidecarTimeoutError extends Error {
  constructor(readonly method: string, readonly timeoutMs: number) {
    super(`index sidecar ${method} timed out after ${timeoutMs}ms`)
    this.name = "SidecarTimeoutError"
  }
}

function isProtocolEvent(value: unknown): value is SidecarProtocolEvent {
  if (isRecord(value) && (value.event === "maintenance/progress" || value.event === "maintenance/terminal")) {
    try { decodeMaintenanceEvent(value); return true } catch { return false }
  }
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

export function abortError(): Error {
  return new DOMException("Index request aborted", "AbortError")
}
