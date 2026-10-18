import type { SemanticWorkerEngine } from "../../src/semantic/semantic-worker-proxy.js"

interface Event { event: string; monotonicMs: number; [key: string]: unknown }

/** A real Worker control with an observed empty context cache, not a fabricated pressure witness. */
export async function observeOwnerPressure(semantic: SemanticWorkerEngine, events: readonly Event[],
  timeoutMs: number, scenarioId: string,
  mark?: (phase: string, details?: Record<string, unknown>) => void) {
  const first = events.length
  const started = performance.now()
  mark?.("pressure-request-start", { scenarioId, level: "level3" })
  semantic.applyMemoryPressure("level3")
  while (performance.now() - started < timeoutMs) {
    const eviction = events.slice(first).find(event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3" && event.residentContextCount === 0)
    if (eviction) {
      mark?.("pressure-eviction-observed", { scenarioId, contextSequence: eviction.contextSequence })
      return { kind: "owner-memory-level3", elapsedMs: performance.now() - started, eviction }
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error("QUERY_LAYER_EVICTION_NOT_OBSERVED")
}
