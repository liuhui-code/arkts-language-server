import type { Worker } from "node:worker_threads"

export type TransientSemanticWorkerKind = "reference" | "anchor" | "diagnostic" | "reference-cache" | "reference-job" | "anchor-job"
export type TransientSemanticWorkerObserver = (
  kind: TransientSemanticWorkerKind, phase: "started" | "exited",
) => void

/** Observe physical occupancy, including startup and cleanup, not just query completion. */
export function observeTransientWorkerLifetime(
  worker: Worker,
  kind: TransientSemanticWorkerKind,
  observer: TransientSemanticWorkerObserver | undefined,
): void {
  if (!observer) return
  const observe = (phase: "started" | "exited") => {
    try { observer(kind, phase) }
    catch { /* Optional metrics cannot change query or Worker lifetime. */ }
  }
  worker.once("exit", () => observe("exited"))
  observe("started")
}
