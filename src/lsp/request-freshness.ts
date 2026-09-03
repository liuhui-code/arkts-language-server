import type { CancellationToken } from "vscode-languageserver/node.js"

export interface FreshRequest {
  signal: AbortSignal
  clientCancelled(): boolean
  isCurrent(): boolean
  finish(): void
}

export type RequestFreshnessScope =
  | { kind: "document"; documentUri: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "independent" }

interface ActiveRequest {
  controller: AbortController
  scope: RequestFreshnessScope
}

export class RequestFreshness {
  private readonly lanes = new Map<string, ActiveRequest>()

  start(
    lane: string,
    token: CancellationToken | undefined,
    scope: RequestFreshnessScope,
  ): FreshRequest {
    this.lanes.get(lane)?.controller.abort(new Error("Semantic request superseded"))
    const controller = new AbortController()
    const active = { controller, scope }
    let clientCancelled = token?.isCancellationRequested ?? false
    const cancellation = token?.onCancellationRequested(() => {
      clientCancelled = true
      controller.abort(new Error("Semantic request cancelled by client"))
    })
    if (clientCancelled) controller.abort(new Error("Semantic request cancelled by client"))
    this.lanes.set(lane, active)
    return {
      signal: controller.signal,
      clientCancelled: () => clientCancelled,
      isCurrent: () => this.lanes.get(lane) === active && !controller.signal.aborted,
      finish: () => {
        cancellation?.dispose()
        if (this.lanes.get(lane) === active) this.lanes.delete(lane)
      },
    }
  }

  cancelAll(): void {
    for (const { controller } of this.lanes.values()) {
      controller.abort(new Error("Language server shutting down"))
    }
    this.lanes.clear()
  }

  cancelDocument(documentUri: string): void {
    for (const { controller, scope } of this.lanes.values()) {
      if (scope.kind === "document" && scope.documentUri === documentUri) {
        controller.abort(new Error("Document version changed"))
      }
    }
  }

  cancelWorkspace(workspaceId: string): void {
    for (const { controller, scope } of this.lanes.values()) {
      if (scope.kind === "workspace" && scope.workspaceId === workspaceId) {
        controller.abort(new Error("Workspace content changed"))
      }
    }
  }
}
