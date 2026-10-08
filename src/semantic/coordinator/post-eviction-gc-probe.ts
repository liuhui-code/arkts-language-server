import { threadId } from "node:worker_threads"

import type { StructuredLogger } from "../../observability/logger.js"
import type { SemanticCoordinatorStats, SemanticMemoryLevel } from "./semantic-coordinator.js"

type Trigger = "explicit-control" | "automatic-sample"

export function createPostEvictionGcProbe(
  enabled: boolean,
  logger: StructuredLogger,
  stats: () => SemanticCoordinatorStats,
): (trigger: Trigger, level: SemanticMemoryLevel, before: SemanticCoordinatorStats) => void {
  return (trigger, level, before) => {
    if (!enabled || level !== "level3") return
    const afterEviction = stats()
    if (afterEviction.residentContextCount >= before.residentContextCount) return
    const evictedContextCount = before.residentContextCount - afterEviction.residentContextCount
    if (afterEviction.residentContextCount !== 0 || afterEviction.leaseCount !== 0) {
      emit(logger, trigger, "skipped", "contexts-or-leases-remain", afterEviction, { evictedContextCount })
      return
    }
    setImmediate(() => {
      const current = stats()
      if (current.residentContextCount !== 0 || current.leaseCount !== 0) {
        emit(logger, trigger, "skipped", "context-readmitted", current, { evictedContextCount })
        return
      }
      const gc = global.gc
      if (typeof gc !== "function") {
        emit(logger, trigger, "inconclusive", "gc-unavailable", current, { evictedContextCount })
        return
      }
      const beforeGc = process.memoryUsage()
      const start = performance.now()
      try {
        gc()
        gc()
      } catch {
        emit(logger, trigger, "inconclusive", "gc-threw", stats(), { evictedContextCount })
        return
      }
      const gcElapsedMs = performance.now() - start
      const afterGc = process.memoryUsage()
      emit(logger, trigger, "complete", undefined, stats(), {
        evictedContextCount,
        gcCount: 2,
        gcElapsedMs,
        ...memoryFields("before", beforeGc),
        ...memoryFields("after", afterGc),
      })
    })
  }
}

function emit(
  logger: StructuredLogger,
  trigger: Trigger,
  status: "complete" | "inconclusive" | "skipped",
  reason: string | undefined,
  current: SemanticCoordinatorStats,
  more: Readonly<Record<string, number>> = {},
): void {
  logger.info("semantic.post-eviction.gc-probe", {
    trigger,
    status,
    reason,
    epochMs: Date.now(),
    monotonicNs: process.hrtime.bigint().toString(),
    pid: process.pid,
    threadId,
    residentContextCount: current.residentContextCount,
    leaseCount: current.leaseCount,
    ...more,
  })
}

function memoryFields(prefix: "before" | "after", usage: NodeJS.MemoryUsage): Record<string, number> {
  return {
    [`${prefix}RssBytes`]: usage.rss,
    [`${prefix}HeapUsedBytes`]: usage.heapUsed,
    [`${prefix}HeapTotalBytes`]: usage.heapTotal,
    [`${prefix}ExternalBytes`]: usage.external,
    [`${prefix}ArrayBuffersBytes`]: usage.arrayBuffers,
  }
}
