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
  // A foreground completion can be behind highlights/type prefetch as well as
  // diagnoses. Never cross a global barrier; serve the deferred oldest request
  // after one bypass so neither diagnostics nor other reads can starve.
  if (oldest !== bypassedDiagnostic && oldest.input.method !== "complete") {
    for (let index = 0; index < pending.length; index += 1) {
      const method = pending[index]!.input.method
      if (method !== "diagnose" && !isInteractiveSemanticWorkerMethod(method)) break
      if (index > 0 && method === "complete") {
        return { request: pending.splice(index, 1)[0], bypassedDiagnostic: oldest }
      }
    }
  }
  if (oldest.input.method === "diagnose" && oldest !== bypassedDiagnostic) {
    let index = 1
    while (pending[index]?.input.method === "diagnose") index += 1
    const next = pending[index]
    if (next?.input.method === "define" || next?.input.method === "hover"
      || next?.input.method === "complete") {
      return { request: pending.splice(index, 1)[0], bypassedDiagnostic: oldest }
    }
  }
  return { request: pending.shift() }
}
