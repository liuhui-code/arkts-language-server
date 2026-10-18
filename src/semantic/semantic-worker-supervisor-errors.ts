import {
  SemanticWorkerCancelState,
  cancelSemanticWorkerRequest,
  createSemanticWorkerError,
  readSemanticWorkerCancellationState,
  type SemanticWorkerErrorCode,
  type SemanticWorkerTerminalCancellationState,
} from "./worker-protocol.js"

export class SemanticWorkerSupervisorError extends Error {
  readonly code: SemanticWorkerErrorCode

  constructor(code: SemanticWorkerErrorCode, options?: ErrorOptions) {
    const workerError = createSemanticWorkerError(code)
    super(workerError.message, options)
    this.name = "SemanticWorkerSupervisorError"
    this.code = code
  }
}

export function cancellationError(
  state: SemanticWorkerTerminalCancellationState,
): SemanticWorkerSupervisorError {
  if (state === SemanticWorkerCancelState.clientCancelled) {
    return new SemanticWorkerSupervisorError("client-cancelled")
  }
  if (state === SemanticWorkerCancelState.contentModified) {
    return new SemanticWorkerSupervisorError("content-modified")
  }
  return new SemanticWorkerSupervisorError("worker-unavailable")
}

export function cancelWithoutThrowing(
  cell: SharedArrayBuffer,
  reason: SemanticWorkerTerminalCancellationState,
): void {
  try {
    cancelSemanticWorkerRequest(cell, reason)
  } catch {
    // The fatal path must still settle if the shared cell was corrupted by the worker.
  }
}

export function readCancellationWithoutThrowing(
  cell: SharedArrayBuffer,
): number | undefined {
  try {
    return readSemanticWorkerCancellationState(cell)
  } catch {
    return undefined
  }
}
