import type { StructuredLogger } from "../../observability/logger.js"
import type { ReferenceSearchStrategy } from "./reference-runtime.js"

export function logReferenceCandidateSelection(
  logger: StructuredLogger | undefined,
  strategy: ReferenceSearchStrategy,
  traceId: string | undefined,
  started: number,
  candidates?: { uris: readonly string[] },
): void {
  if (!traceId || strategy !== "indexed-batched") return
  logger?.info("references.candidate-selection.complete", {
    traceId,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    outcome: candidates ? "accepted" : "fallback",
    candidateFiles: candidates?.uris.length ?? 0,
  })
}
