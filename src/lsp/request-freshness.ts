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
  winningReason?: RequestAbortReason
}

export type RequestAbortReason =
  | "client-cancelled"
  | "content-modified"
  | "shutdown"
  | "superseded"

export class RequestAbortError extends Error {
  override readonly name = "RequestAbortError"

  constructor(
    readonly kind: RequestAbortReason,
    message: string,
  ) {
    super(message)
  }
}

export class RequestFreshness {
  private readonly lanes = new Map<string, Set<ActiveRequest>>()

  start(
    lane: string,
    token: CancellationToken | undefined,
    scope: RequestFreshnessScope,
  ): FreshRequest {
    const previous = this.lanes.get(lane)
    for (const active of previous ?? []) {
      abortOnce(active, "superseded", "Semantic request superseded")
    }
    const requests = new Set<ActiveRequest>()
    this.lanes.set(lane, requests)
    return this.startInLane(lane, requests, token, scope)
  }

  startConcurrent(
    lane: string,
    token: CancellationToken | undefined,
    scope: RequestFreshnessScope,
  ): FreshRequest {
    const requests = this.lanes.get(lane) ?? new Set<ActiveRequest>()
    this.lanes.set(lane, requests)
    return this.startInLane(lane, requests, token, scope)
  }

  private startInLane(
    lane: string,
    requests: Set<ActiveRequest>,
    token: CancellationToken | undefined,
    scope: RequestFreshnessScope,
  ): FreshRequest {
    const controller = new AbortController()
    const active: ActiveRequest = { controller, scope }
    const cancellation = token?.onCancellationRequested(() => {
      abortOnce(active, "client-cancelled", "Semantic request cancelled by client")
    })
    if (token?.isCancellationRequested) {
      abortOnce(active, "client-cancelled", "Semantic request cancelled by client")
    }
    requests.add(active)
    return {
      signal: controller.signal,
      clientCancelled: () => controller.signal.reason instanceof RequestAbortError
        && controller.signal.reason.kind === "client-cancelled",
      isCurrent: () => this.lanes.get(lane)?.has(active) === true && !controller.signal.aborted,
      finish: () => {
        cancellation?.dispose()
        requests.delete(active)
        if (this.lanes.get(lane) === requests && requests.size === 0) this.lanes.delete(lane)
      },
    }
  }

  cancelAll(): void {
    for (const requests of this.lanes.values()) {
      for (const active of requests) abortOnce(active, "shutdown", "Language server shutting down")
    }
    this.lanes.clear()
  }

  cancelDocument(documentUri: string): void {
    for (const requests of this.lanes.values()) {
      for (const active of requests) {
        const { scope } = active
        if (scope.kind === "document" && scope.documentUri === documentUri) {
          abortOnce(active, "content-modified", "Document version changed")
        }
      }
    }
  }

  cancelWorkspace(workspaceId: string): void {
    for (const requests of this.lanes.values()) {
      for (const active of requests) {
        const { scope } = active
        if (scope.kind === "workspace" && scope.workspaceId === workspaceId) {
          abortOnce(active, "content-modified", "Workspace content changed")
        }
      }
    }
  }
}

function abortOnce(
  active: ActiveRequest,
  reason: RequestAbortReason,
  message: string,
): void {
  if (active.winningReason !== undefined) return
  active.winningReason = reason
  active.controller.abort(new RequestAbortError(reason, message))
}
