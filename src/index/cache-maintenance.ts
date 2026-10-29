import { spawn, type ChildProcess } from "node:child_process"
import os from "node:os"
import type { StructuredLogger } from "../observability/logger.js"
import { resolveIndexSidecarPath } from "./sidecar-path.js"

const MAX_REPORT_BYTES = 4 * 1024 * 1024

/** Owns only an administrative child; never runs SQL or scans project inputs on the LSP thread. */
export class IndexCacheMaintenance {
  private started = false
  private disposed = false
  private timer?: NodeJS.Timeout
  private child?: ChildProcess
  private pending?: Promise<void>

  constructor(private readonly cacheDirectory: string,
    private readonly environment: NodeJS.ProcessEnv, private readonly logger: StructuredLogger) {}

  start(): void {
    if (this.started || this.disposed) return
    this.started = true
    if (this.environment.ARKTS_INDEX_CACHE_GC === "off") return
    if (this.environment.ARKTS_INDEX_CACHE_GC && this.environment.ARKTS_INDEX_CACHE_GC !== "auto") {
      this.logger.error("index.cache.gc.configuration.invalid", { option: "ARKTS_INDEX_CACHE_GC" })
      return
    }
    this.schedule(0)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode !== null) return this.pending
    child.kill("SIGTERM")
    const escalation = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    }, 1_000)
    escalation.unref()
    try { await this.pending } finally { clearTimeout(escalation) }
  }

  private schedule(delay: number): void {
    if (this.disposed) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      try { this.pending = this.run() }
      catch (error) { this.logger.error("index.cache.gc.failed", { reason: String(error) }) }
    }, delay)
    this.timer.unref()
  }

  private run(): Promise<void> {
    const interval = this.number("ARKTS_INDEX_CACHE_GC_INTERVAL_MS", 3_600_000)
    const limit = this.number("ARKTS_INDEX_CACHE_GC_LIMIT", 128)
    if (interval > 2_147_483_647 || limit < 1 || limit > 4096) throw new Error("invalid cache maintenance interval/limit")
    const args = ["--cache-gc", "--cache-dir", this.cacheDirectory, "--apply", "--automatic",
      "--interval-ms", String(interval), "--limit", String(limit)]
    for (const [variable, option] of [
      ["ARKTS_INDEX_CACHE_GC_IDLE_MS", "--idle-ms"],
      ["ARKTS_INDEX_CACHE_GC_ORPHAN_GRACE_MS", "--orphan-grace-ms"],
      ["ARKTS_INDEX_CACHE_GC_MAX_BYTES", "--max-bytes"],
      ["ARKTS_INDEX_CACHE_GC_IDENTITY_COPY_BYTES", "--identity-copy-max-bytes"],
    ]) {
      if (this.environment[variable] !== undefined) args.push(option, String(this.number(variable, 0)))
    }
    const began = performance.now()
    const child = spawn(resolveIndexSidecarPath({ env: this.environment }), args, {
      env: this.environment, stdio: ["ignore", "pipe", "pipe"],
    })
    this.child = child
    let stdout = ""
    let stderr = ""
    let bytes = 0
    let failure: Error | undefined
    child.once("error", error => { failure = error })
    child.once("spawn", () => {
      try { if (child.pid) os.setPriority(child.pid, 10) }
      catch (error) { this.logger.info("index.cache.gc.priority.unavailable", { reason: String(error) }) }
    })
    child.stdout!.on("data", (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes <= MAX_REPORT_BYTES) stdout += chunk.toString("utf8")
      else { failure = new Error("cache maintenance report exceeded its bound"); child.kill("SIGTERM") }
    })
    child.stderr!.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-4096) })
    return new Promise(resolve => {
      child.once("close", (code, signal) => {
        this.child = undefined
        let delay = interval || 1_000
        try {
          if (this.disposed) {
            this.logger.info("index.cache.gc.cancelled", { code, signal })
          } else {
            if (failure || code !== 0 || signal) throw failure ?? new Error(`cache GC exited ${code}/${signal}: ${stderr}`)
            const report = JSON.parse(stdout)
            if (report.schema !== "arkts.index-cache-gc.v1" || !Array.isArray(report.entries)) throw new Error("invalid cache GC report")
            this.logger.info("index.cache.gc.completed", { status: report.status, scanned: report.scanned,
              removedBytes: report.removedBytes, budgetUnmet: report.budgetUnmet,
              deferredEntries: report.entries.filter((entry: { outcome: string }) => entry.outcome === "deferred").length,
              issues: Array.isArray(report.issues) ? report.issues.length : 0,
              protectedEntries: report.entries.filter((entry: { outcome: string }) => entry.outcome === "protected").length,
              durationMs: Math.round((performance.now() - began) * 100) / 100 })
            if (report.nextCursor) delay = 1_000
          }
        } catch (error) { this.logger.error("index.cache.gc.failed", { reason: String(error), code, signal }) }
        finally { this.schedule(delay); resolve() }
      })
    })
  }

  private number(variable: string, fallback: number): number {
    const text = this.environment[variable]
    if (text === undefined) return fallback
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error(`Invalid ${variable}`)
    return Number(text)
  }
}
