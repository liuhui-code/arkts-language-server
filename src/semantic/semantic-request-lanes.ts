import type { SemanticWorkerMethod } from "./worker-protocol.js"

type RequestClass = "completion" | "interactive" | "diagnostic" | "global"

/** Exhaustive: adding a method requires a scheduling decision, not an implicit FIFO default. */
const REQUEST_CLASS = {
  complete: "completion",
  resolveCompletion: "completion",
  define: "interactive",
  typeDefinitions: "interactive",
  documentHighlights: "interactive",
  inlayHints: "interactive",
  foldingRanges: "interactive",
  formatDocument: "interactive",
  documentSymbols: "interactive",
  codeActions: "interactive",
  resolveCodeAction: "interactive",
  hover: "interactive",
  signatureHelp: "interactive",
  prepareCallHierarchy: "interactive",
  outgoingCalls: "interactive",
  diagnose: "diagnostic",
  implementations: "global",
  references: "global",
  prepareRename: "global",
  rename: "global",
  incomingCalls: "global",
  semanticReadiness: "global",
} as const satisfies Readonly<Record<SemanticWorkerMethod, RequestClass>>

const PRIORITY = { completion: 2, interactive: 1, diagnostic: 0, global: -1 } as const

export function isInteractiveSemanticWorkerMethod(method: SemanticWorkerMethod): boolean {
  return PRIORITY[REQUEST_CLASS[method]] > 0
}

export function takeNextSemanticWorkerRequest<T extends { readonly input: { readonly method: SemanticWorkerMethod } }>(
  pending: T[], detachedReference: boolean, bypassedDiagnostic?: T,
): { request?: T; bypassedDiagnostic?: T } {
  const oldest = pending[0]
  if (!oldest) return {}
  if (detachedReference) {
    // Preserve the established detached-reference lane; globals wait for its terminal.
    const index = pending.findIndex(record => isInteractiveSemanticWorkerMethod(record.input.method))
    return { request: index < 0 ? undefined : pending.splice(index, 1)[0],
      bypassedDiagnostic: oldest === bypassedDiagnostic ? bypassedDiagnostic : undefined }
  }
  let priority: number = PRIORITY[REQUEST_CLASS[oldest.input.method]], selected = 0
  if (priority >= 0 && oldest !== bypassedDiagnostic) {
    // Mutation ordering is enforced by the caller. Never pass a queued global.
    // Stable FIFO within a class; one higher-class bypass, then this head must run.
    for (let index = 1; index < pending.length; index++) {
      const next = PRIORITY[REQUEST_CLASS[pending[index]!.input.method]]
      if (next < 0) break
      if (next > priority) { selected = index; priority = next }
    }
  }
  return selected > 0
    ? { request: pending.splice(selected, 1)[0], bypassedDiagnostic: oldest }
    : { request: pending.shift() }
}
