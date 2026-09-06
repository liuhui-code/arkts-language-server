import ts from "typescript"

import {
  readSemanticWorkerCancellationState,
  SemanticWorkerCancelState,
} from "./worker-protocol.js"

export class SemanticCancellationScope {
  readonly hostToken: ts.HostCancellationToken
  private activeCell: SharedArrayBuffer | undefined

  constructor() {
    this.hostToken = Object.freeze({
      isCancellationRequested: () => this.activeCell !== undefined
        && readSemanticWorkerCancellationState(this.activeCell) !== SemanticWorkerCancelState.active,
    })
  }

  async run<T>(
    cell: SharedArrayBuffer,
    operation: () => T | PromiseLike<T>,
  ): Promise<T> {
    if (this.activeCell !== undefined) {
      throw new Error("Semantic cancellation scope already has an active request")
    }
    readSemanticWorkerCancellationState(cell)
    this.activeCell = cell
    try {
      this.checkpoint()
      const result = await operation()
      this.checkpoint()
      return result
    } finally {
      this.activeCell = undefined
    }
  }

  checkpoint(): void {
    if (this.hostToken.isCancellationRequested()) {
      throw new ts.OperationCanceledException()
    }
  }
}
