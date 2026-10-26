import { IncompleteImplementationError } from "../core/types/typescript-implementation-query.js"
import { SemanticInputUnavailableError } from "../core/types/typescript-query-inputs.js"
import { readSemanticWorkerCancellationState, SemanticWorkerCancelState,
  type SemanticWorkerErrorCode } from "./worker-protocol.js"

/** Compiler-aware classification stays in the semantic isolate, never its Host. */
export function workerRequestErrorCode(cell: SharedArrayBuffer, error: unknown): SemanticWorkerErrorCode {
  const state = readSemanticWorkerCancellationState(cell)
  return state === SemanticWorkerCancelState.clientCancelled ? "client-cancelled"
    : state === SemanticWorkerCancelState.contentModified ? "content-modified"
      : state === SemanticWorkerCancelState.supervisorDisposing ? "worker-unavailable"
        : error instanceof IncompleteImplementationError || error instanceof SemanticInputUnavailableError
          ? "workspace-incomplete" : "internal-error"
}
