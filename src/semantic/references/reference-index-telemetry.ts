import type { StructuredLogger } from "../../observability/logger.js"
import type { TextPosition } from "../../contracts/document.js"
import type { WorkspaceIndexStatus, WorkspaceReferenceCandidateResult } from "../../contracts/workspace-index.js"
import type { ReferenceSearchStrategy } from "./reference-runtime.js"

export function logReferenceCandidatePhase(
  logger: StructuredLogger | undefined, traceId: string | undefined,
  phase: string, started: number, outcome: "complete" | "error",
): void {
  if (!traceId) return
  logger?.info("references.candidate-phase.complete", {
    traceId, phase, outcome,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
  })
}

/** Measures caller wall time, including transport/queueing, not SQLite CPU time. */
export async function traceReferenceCandidatePhase<Value>(
  logger: StructuredLogger | undefined, traceId: string | undefined,
  phase: string, operation: () => Promise<Value>,
): Promise<Value> {
  if (!traceId) return operation()
  const started = performance.now()
  try {
    const value = await operation()
    logReferenceCandidatePhase(logger, traceId, phase, started, "complete")
    return value
  } catch (error) {
    logReferenceCandidatePhase(logger, traceId, phase, started, "error")
    throw error
  }
}

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

export function logReferenceCandidateFallback(
  logger: StructuredLogger | undefined, target: { uri: string; range: { start: TextPosition } },
  result: WorkspaceReferenceCandidateResult, status: WorkspaceIndexStatus,
): void {
  logger?.info("references.index.fallback", {
    reason: "candidate-ineligible", targetUri: target.uri,
    targetLine: target.range.start.line, targetCharacter: target.range.start.character,
    supported: result.supported, complete: result.complete, completeness: result.completeness,
    hasDeclarationIdentity: Boolean(result.declarationIdentity),
    servedGeneration: result.servedGeneration, committedGeneration: status.committedGeneration,
  })
}

/** Observation only: callers still enforce the existing fail-conservative policy. */
export function logReferenceSeedProofRejection(
  logger: StructuredLogger | undefined, traceId: string | undefined, reason: string,
  seed: { servedGeneration: number }, result: WorkspaceReferenceCandidateResult,
  status: WorkspaceIndexStatus, supportComplete?: boolean,
): void {
  if (!traceId) return
  logger?.info("references.anchor.seed.proof-rejected", {
    traceId, reason, supported: result.supported, complete: result.complete,
    completeness: result.completeness, identityComplete: result.identityComplete,
    supportComplete, seedGeneration: seed.servedGeneration,
    servedGeneration: result.servedGeneration, committedGeneration: status.committedGeneration,
  })
}
