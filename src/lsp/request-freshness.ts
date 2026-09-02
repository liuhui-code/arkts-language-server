import type { CancellationToken } from "vscode-languageserver/node.js"

export interface FreshRequest {
  signal: AbortSignal
  clientCancelled(): boolean
  isCurrent(): boolean
  finish(): void
}

export class RequestFreshness {
  private readonly lanes = new Map<string, AbortController>()

  start(lane: string, token?: CancellationToken): FreshRequest {
    this.lanes.get(lane)?.abort(new Error("Semantic request superseded"))
    const controller = new AbortController()
    let clientCancelled = token?.isCancellationRequested ?? false
    const cancellation = token?.onCancellationRequested(() => {
      clientCancelled = true
      controller.abort(new Error("Semantic request cancelled by client"))
    })
    if (clientCancelled) controller.abort(new Error("Semantic request cancelled by client"))
    this.lanes.set(lane, controller)
    return {
      signal: controller.signal,
      clientCancelled: () => clientCancelled,
      isCurrent: () => this.lanes.get(lane) === controller,
      finish: () => {
        cancellation?.dispose()
        if (this.lanes.get(lane) === controller) this.lanes.delete(lane)
      },
    }
  }

  cancelAll(): void {
    for (const controller of this.lanes.values()) {
      controller.abort(new Error("Language server shutting down"))
    }
    this.lanes.clear()
  }

  cancelDocument(documentUri: string): void {
    for (const [lane, controller] of this.lanes) {
      if (lane.endsWith(`:${documentUri}`)) {
        controller.abort(new Error("Document version changed"))
      }
    }
  }
}
