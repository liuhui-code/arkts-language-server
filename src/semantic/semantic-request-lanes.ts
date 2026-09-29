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
