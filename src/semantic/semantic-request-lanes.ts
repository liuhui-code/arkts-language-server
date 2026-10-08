import type { SemanticWorkerMethod } from "./worker-protocol.js"

const INTERACTIVE_METHODS: ReadonlySet<SemanticWorkerMethod> = new Set([
  "complete",
  "resolveCompletion",
  "define",
  "typeDefinitions",
  "documentHighlights",
  "inlayHints",
  "foldingRanges",
  "formatDocument",
  "documentSymbols",
  "codeActions",
  "resolveCodeAction",
  "hover",
  "signatureHelp",
])

export function isInteractiveSemanticWorkerMethod(
  method: SemanticWorkerMethod,
): boolean {
  return INTERACTIVE_METHODS.has(method)
}

export function takeNextSemanticWorkerRequest<T extends { readonly input: { readonly method: SemanticWorkerMethod } }>(
  pending: T[],
  detachedReference: boolean,
  bypassedDiagnostic?: T,
): { request?: T; bypassedDiagnostic?: T } {
  const oldest = pending[0]
  if (!oldest) return {}
  if (detachedReference) {
    const index = pending.findIndex(record => isInteractiveSemanticWorkerMethod(record.input.method))
    return {
      request: index < 0 ? undefined : pending.splice(index, 1)[0],
      bypassedDiagnostic: oldest === bypassedDiagnostic ? bypassedDiagnostic : undefined,
    }
  }
  if (oldest.input.method === "diagnose" && oldest !== bypassedDiagnostic) {
    let index = 1
    while (pending[index]?.input.method === "diagnose") index += 1
    const next = pending[index]
    if (next?.input.method === "define" || next?.input.method === "hover") {
      return { request: pending.splice(index, 1)[0], bypassedDiagnostic: oldest }
    }
  }
  return { request: pending.shift() }
}
