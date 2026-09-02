import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdir, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type {
  DocumentSnapshot,
  WorkspaceDescriptor,
  WorkspaceId,
} from "../contracts/document.js"
import type {
  WorkspaceIndexPort,
  WorkspaceIndexStatus,
  WorkspaceSymbol,
  WorkspaceSymbolSearchResult,
} from "../contracts/workspace-index.js"
import { resolveIndexSidecarPath, type SidecarPathOptions } from "./sidecar-path.js"

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

export interface SidecarProtocolEvent {
  protocol: 1
  event: string
  params: unknown
}

export interface SidecarWorkspaceIndexOptions extends SidecarPathOptions {
  onEvent?(event: SidecarProtocolEvent): void
}

export class SidecarWorkspaceIndex implements WorkspaceIndexPort {
  private readonly sessions = new Map<WorkspaceId, SidecarSession>()
  private readonly options: SidecarWorkspaceIndexOptions

  constructor(options: SidecarWorkspaceIndexOptions = {}) {
    this.options = options
  }

  async open(workspace: WorkspaceDescriptor, cacheDir: string): Promise<WorkspaceIndexStatus> {
    if (this.sessions.has(workspace.id)) {
      throw new Error(`workspace index is already open: ${workspace.id}`)
    }

    const workspaceRoot = await canonicalFileWorkspaceRoot(workspace.rootUri)
    const cacheDirectory = await canonicalDirectory(cacheDir)
    const session = new SidecarSession(resolveIndexSidecarPath(this.options), this.options.onEvent)
    this.sessions.set(workspace.id, session)
    try {
      const initialized = asRecord(await session.request("initialize", {
        workspaceRoot,
        cacheDirectory,
      }))
      const status = mapStatus(initialized.status)
      session.lastStatus = status
      return status
    } catch (error) {
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
    const result = asRecord(await session.request("refresh", {
      generation,
      changed: changed.map(({ uri, text }) => ({ uri, text })),
      removedUris,
    }, signal))
    const status = mapStatus(result.status)
    session.lastStatus = status
    return status
  }

  async searchSymbols(
    workspaceId: WorkspaceId,
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<WorkspaceSymbolSearchResult> {
    return mapSearchResult(await this.session(workspaceId).request("search", { query, limit }, signal))
  }

  async status(workspaceId: WorkspaceId): Promise<WorkspaceIndexStatus> {
    const session = this.session(workspaceId)
    const degraded = session.degradedStatus()
    if (degraded) return degraded
    const status = mapStatus(await session.request("status", {}))
    session.lastStatus = status
    return status
  }

  async close(workspaceId: WorkspaceId): Promise<void> {
    const session = this.sessions.get(workspaceId)
    if (!session) return
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
}

class SidecarSession {
  readonly child: ChildProcessWithoutNullStreams
  lastStatus: WorkspaceIndexStatus = { state: "warming", committedGeneration: 0 }
  private nextRequestId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly abandoned = new Set<number>()
  private stdoutBuffer = ""
  private closePromise: Promise<void> | undefined
  private closed = false
  private closing = false
  private failure: Error | undefined
  private readonly closedPromise: Promise<void>
  private resolveClosed!: () => void

  constructor(
    sidecarPath: string,
    private readonly onEvent?: (event: SidecarProtocolEvent) => void,
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
    this.child.on("error", (error) => this.fail(error))
    this.child.on("close", (code, signal) => {
      this.closed = true
      if (!this.closing) {
        this.fail(new Error(`index sidecar exited (code=${code ?? "null"}, signal=${signal ?? "null"})`))
      }
      this.resolveClosed()
    })
  }

  request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure)
    if (this.closed || this.closing) {
      return Promise.reject(new Error("index sidecar session is closed"))
    }
    if (signal?.aborted) return Promise.reject(abortError())
    const id = this.nextRequestId++
    const line = `${JSON.stringify({ protocol: PROTOCOL_VERSION, id, method, params })}\n`
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        this.abandoned.add(id)
        pending.cleanup()
        pending.reject(abortError())
      }
      const cleanup = () => signal?.removeEventListener("abort", onAbort)
      this.pending.set(id, { resolve, reject, cleanup })
      signal?.addEventListener("abort", onAbort, { once: true })
      this.child.stdin.write(line, (error) => {
        if (!error) return
        const pending = this.pending.get(id)
        this.pending.delete(id)
        pending?.cleanup()
        pending?.reject(error)
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
    this.closing = true
    if (!this.closed) this.child.kill()
    await this.closedPromise
  }

  private async shutdown(): Promise<void> {
    if (this.closed) return
    if (this.failure) {
      this.closing = true
      this.child.kill()
      await this.closedPromise
      return
    }
    await this.request("shutdown", {})
    this.closing = true
    this.child.stdin.end()
    await this.closedPromise
  }

  private acceptStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    while (true) {
      const newline = this.stdoutBuffer.indexOf("\n")
      if (newline < 0) return
      const line = this.stdoutBuffer.slice(0, newline)
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (!line.trim()) {
        this.fail(new SidecarProtocolError("index sidecar emitted an empty protocol line"))
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
      this.fail(new SidecarProtocolError("index sidecar emitted malformed JSON"))
      return
    }
    if (isProtocolEvent(parsed)) {
      try {
        this.onEvent?.(parsed)
      } catch {
        this.fail(new SidecarProtocolError("index sidecar event handler failed"))
      }
      return
    }
    if (!isRecord(parsed)
      || parsed.protocol !== PROTOCOL_VERSION
      || !Number.isSafeInteger(parsed.id)
      || typeof parsed.ok !== "boolean") {
      this.fail(new SidecarProtocolError("index sidecar emitted an invalid protocol response"))
      return
    }
    const response = parsed as unknown as SidecarResponse
    const pending = this.pending.get(response.id)
    if (!pending) {
      if (this.abandoned.delete(response.id)) return
      this.fail(new SidecarProtocolError(`index sidecar emitted an unknown response id: ${response.id}`))
      return
    }
    if (response.ok) {
      if (!("result" in parsed)) {
        this.fail(new SidecarProtocolError("index sidecar omitted a successful response result"))
        return
      }
      this.pending.delete(response.id)
      pending.cleanup()
      pending.resolve(response.result)
    } else {
      if (!isRecord(response.error)
        || typeof response.error.code !== "string"
        || typeof response.error.message !== "string") {
        this.fail(new SidecarProtocolError("index sidecar emitted an invalid error response"))
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

  private fail(error: Error): void {
    this.failure ??= error
    for (const pending of this.pending.values()) {
      pending.cleanup()
      pending.reject(this.failure)
    }
    this.pending.clear()
    this.abandoned.clear()
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
    throw new Error("index sidecar returned an invalid status")
  }
  return {
    state: status.state,
    committedGeneration: status.committedGeneration,
    ...(typeof status.message === "string" ? { message: status.message } : {}),
  }
}

function mapSearchResult(value: unknown): WorkspaceSymbolSearchResult {
  const result = asRecord(value)
  if (!Array.isArray(result.items)
    || !isNonNegativeInteger(result.servedGeneration)
    || !isCompleteness(result.completeness)) {
    throw new Error("index sidecar returned an invalid symbol search result")
  }
  return {
    items: result.items.map(mapWorkspaceSymbol),
    servedGeneration: result.servedGeneration,
    completeness: result.completeness,
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
  return isRecord(value)
    && value.protocol === PROTOCOL_VERSION
    && !("id" in value)
    && typeof value.event === "string"
    && value.event.length > 0
    && "params" in value
}

function isIndexState(value: unknown): value is WorkspaceIndexStatus["state"] {
  return value === "warming" || value === "ready" || value === "degraded"
}

function isCompleteness(value: unknown): value is WorkspaceSymbolSearchResult["completeness"] {
  return value === "ready" || value === "partial" || value === "stale"
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function abortError(): Error {
  return new DOMException("Index request aborted", "AbortError")
}
