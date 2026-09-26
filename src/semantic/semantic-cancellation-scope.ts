import { AsyncLocalStorage } from "node:async_hooks"

import ts from "typescript"

import {
  readSemanticWorkerCancellationState,
  SemanticWorkerCancelState,
} from "./worker-protocol.js"

export class SemanticCancellationScope {
  readonly hostToken: ts.HostCancellationToken
  private readonly cells = new AsyncLocalStorage<SharedArrayBuffer>()

  constructor() {
    this.hostToken = Object.freeze({
      isCancellationRequested: () => {
        const cell = this.cells.getStore()
        return cell !== undefined
          && readSemanticWorkerCancellationState(cell) !== SemanticWorkerCancelState.active
      },
    })
  }

  async run<T>(
    cell: SharedArrayBuffer,
    operation: () => T | PromiseLike<T>,
  ): Promise<T> {
    if (this.cells.getStore() !== undefined) {
      throw new Error("Semantic cancellation scope already has an active request")
    }
    readSemanticWorkerCancellationState(cell)
    return this.cells.run(cell, async () => {
      this.checkpoint()
      const result = await operation()
      this.checkpoint()
      return result
    })
  }

  checkpoint(): void {
    if (this.hostToken.isCancellationRequested()) {
      throw new ts.OperationCanceledException()
    }
  }
}
