import type { WorkspaceReferenceIndexPort } from "../../contracts/workspace-index.js"
import type { StructuredLogger } from "../../observability/logger.js"

const POLL_INTERVAL_MS = 250
const OPEN_GRACE_MS = 5_000
const MAX_WAIT_MS = 60_000

export async function waitForInitialReferenceCatalog(
  index: WorkspaceReferenceIndexPort,
  workspaceId: string,
  environment: NodeJS.ProcessEnv,
  signal?: AbortSignal,
  logger?: StructuredLogger,
): Promise<void> {
  const waitMs = configuredWaitMs(environment.ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS)
  if (waitMs === 0 || signal?.aborted) return

  const started = performance.now()
  const deadline = started + waitMs
  const openDeadline = Math.min(deadline, started + OPEN_GRACE_MS)
  const budget = new AbortController()
  const abort = () => budget.abort()
  const timer = setTimeout(abort, waitMs)
  signal?.addEventListener("abort", abort, { once: true })
  let waiting = false
  let status
  try {
    while (!budget.signal.aborted && performance.now() < deadline) {
      try {
        status = await index.status(workspaceId, budget.signal)
      } catch {
        status = undefined
        if (budget.signal.aborted || performance.now() >= openDeadline) break
      }
      if (status?.state === "ready" || status?.state === "degraded") break
      if (status && (status.state !== "warming" || status.committedGeneration !== 0)) break
      if (!waiting) logger?.info("references.index.initial-catalog-wait.start", { waitMs })
      waiting = true
      await pause(Math.min(POLL_INTERVAL_MS, deadline - performance.now()), budget.signal)
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", abort)
  }
  if (!waiting && !budget.signal.aborted) return
  logger?.info("references.index.initial-catalog-wait.end", {
    outcome: signal?.aborted ? "cancelled"
      : status?.state === "ready" && status.committedGeneration > 0 ? "ready"
        : performance.now() >= deadline ? "timeout" : "unavailable",
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    committedGeneration: status?.committedGeneration,
  })
}

function configuredWaitMs(raw: string | undefined): number {
  if (raw === undefined) return 0
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_WAIT_MS) {
    throw new Error(`ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS must be 0..${MAX_WAIT_MS}`)
  }
  return parsed
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, Math.max(0, ms))
    const abort = () => done()
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener("abort", abort)
      resolve()
    }
    signal?.addEventListener("abort", abort, { once: true })
  })
}
