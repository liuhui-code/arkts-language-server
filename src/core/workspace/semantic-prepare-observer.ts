export type SemanticPreparePhase = "current-load" | "overlay-authority" | "dependency-closure"
  | "project-membership" | "workspace-preload" | "finalize"

export interface SemanticPreparePhaseDetails {
  cacheHit?: boolean
  pathCount?: number
  status?: "complete" | "partial"
  addedDocuments?: number
}

export type SemanticPrepareObserver = (
  phase: SemanticPreparePhase,
  durationMs: number,
  details?: SemanticPreparePhaseDetails,
) => void

export function observePreparePhase(observer: SemanticPrepareObserver | undefined,
  phase: SemanticPreparePhase, started: number, details?: SemanticPreparePhaseDetails): void {
  if (!observer) return
  try {
    observer(phase, Math.max(0, performance.now() - started), details)
  } catch {
    // Diagnostics must not affect document authority or project membership.
  }
}
