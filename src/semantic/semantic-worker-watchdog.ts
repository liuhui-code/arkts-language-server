import { performance } from "node:perf_hooks"
import type { StructuredLogger } from "../observability/logger.js"
import { SEMANTIC_WORKER_PROTOCOL_VERSION, SemanticWorkerCancelState,
  readSemanticWorkerCancellationState, decodeSemanticWorkerMutationAck, decodeSemanticWorkerResponseForMethod,
  type SemanticWorkerMutation, type SemanticWorkerRequest } from "./worker-protocol.js"
import { workerProgressSnapshot } from "./semantic-worker-progress.js"
import { readCancellationWithoutThrowing } from "./semantic-worker-supervisor-errors.js"

type Command = SemanticWorkerMutation | SemanticWorkerRequest
interface Waiting { readonly command: Command; readonly sent: number; started?: number; cancelled?: number;
  synchronized?: boolean; activitySequence?: number; activityAt?: number;
  invalidation?: "finish-sync" | "settling" | "interrupt" }

export function semanticWorkerDeadlines(env: NodeJS.ProcessEnv) {
  const read = (name: string, fallback: number) => {
    const value = env[name] === undefined ? fallback : Number(env[name])
    if (!Number.isSafeInteger(value) || value < 1) throw Error(name + " must be a positive integer in milliseconds")
    return value
  }
  return {
    request: read("ARKTS_SEMANTIC_REQUEST_TIMEOUT_MS", 30_000),
    global: read("ARKTS_SEMANTIC_GLOBAL_TIMEOUT_MS", 120_000),
    preparation: read("ARKTS_SEMANTIC_PREPARE_TIMEOUT_MS", 180_000),
    mutation: read("ARKTS_SEMANTIC_MUTATION_TIMEOUT_MS", 10_000),
    cancellation: read("ARKTS_SEMANTIC_CANCEL_GRACE_MS", 1000),
  }
}

/** Runs in the unblocked parent. No Worker timer/acknowledgement is needed to detect a stall. */
export class SemanticWorkerWatchdog {
  private readonly waiting = new Map<string, Waiting>()
  private readonly limits: ReturnType<typeof semanticWorkerDeadlines>
  private readonly timer: NodeJS.Timeout
  constructor(env: NodeJS.ProcessEnv, private readonly failed: (error: Error) => void,
    private readonly logger?: StructuredLogger, private readonly progress?: SharedArrayBuffer,
    private readonly healthy?: () => void) {
    this.limits = semanticWorkerDeadlines(env)
    this.timer = setInterval(() => this.check(), 25)
    this.timer.unref()
  }
  sent(command: Command): void {
    this.waiting.set(key(command.epoch, "method" in command ? command.id : -command.revision),
      { command, sent: performance.now() })
  }
  invalidate(request: SemanticWorkerRequest, finishSynchronization: boolean): void {
    const entry = this.waiting.get(key(request.epoch, request.id))
    if (!entry || entry.invalidation === "settling") return
    // Later mutations cannot re-arm a completed commit or its delivery grace.
    // check() admits ordinary cancellation only inside the matching live commit.
    if (!finishSynchronization) entry.invalidation = "interrupt"
    else entry.invalidation ??= "finish-sync"
  }
  execution(message: unknown): boolean {
    if (!message || typeof message !== "object" || (message as { workerEvent?: unknown }).workerEvent !== "execution") return false
    const value = message as { epoch?: number; commandId?: number; action?: string }
    if (!Number.isSafeInteger(value.epoch) || !Number.isSafeInteger(value.commandId)) return true
    const entry = this.waiting.get(key(value.epoch!, value.commandId!))
    if (entry && value.action === "started") entry.started ??= performance.now()
    if (entry && value.action === "synchronized") {
      entry.synchronized = true
      if (entry.invalidation === "finish-sync" && entry.cancelled !== undefined) {
        entry.invalidation = "settling"; entry.cancelled = performance.now()
      }
    }
    return true
  }
  settled(message: unknown): void {
    if (!message || typeof message !== "object") return
    const value = message as { protocol?: number; epoch?: number; id?: number; appliedRevision?: number }
    if (value.protocol !== SEMANTIC_WORKER_PROTOCOL_VERSION || !Number.isSafeInteger(value.epoch)) return
    const entryKey = key(value.epoch!, value.id ?? -(value.appliedRevision ?? 0))
    const entry = this.waiting.get(entryKey)
    if (!entry) return
    try {
      const command = entry.command
      if ("method" in command) {
        const response = decodeSemanticWorkerResponseForMethod(command.method, message, command.uri)
        if (response.appliedRevision !== command.requiredRevision
          || response.documentVersion !== command.expectedDocumentVersion) return
        if (response.ok && entry.synchronized && readSemanticWorkerCancellationState(command.cancelCell) === SemanticWorkerCancelState.active && (command.method !== "semanticReadiness"
          || command.args.prepare && (response.value as { semanticState?: unknown }).semanticState === "ready")) {
          this.healthy?.()
        }
      } else if (decodeSemanticWorkerMutationAck(message).appliedRevision !== command.revision) return
      this.waiting.delete(entryKey)
    } catch { /* The supervisor handles malformed replies; they cannot extend a deadline. */ }
  }
  dispose(): void { clearInterval(this.timer); this.waiting.clear() }
  private check(): void {
    const now = performance.now()
    const progress = this.progress ? workerProgressSnapshot(this.progress) : undefined
    for (const entry of this.waiting.values()) {
      const command = entry.command
      const request = "method" in command ? command : undefined
      const method = request?.method ?? "mutation"
      const limit = !request ? this.limits.mutation : method === "semanticReadiness"
        ? this.limits.preparation : ["references", "rename", "incomingCalls"].includes(method)
          ? this.limits.global : this.limits.request
      const cancellation = request ? readCancellationWithoutThrowing(request.cancelCell) : SemanticWorkerCancelState.active
      if (request && entry.started !== undefined && cancellation !== SemanticWorkerCancelState.active) {
        entry.cancelled ??= now
      }
      const committing = request && entry.started !== undefined && progress?.commandEpoch === command.epoch
        && progress.commandId === request.id && ["synchronize", "program", "checker"].includes(progress.phase)
      // Cancelling a read revokes its result, not the mutable Program commit it
      // already entered. Let that commit settle under its original absolute cap.
      if (committing && entry.cancelled !== undefined && entry.invalidation !== "settling"
        && (cancellation === SemanticWorkerCancelState.clientCancelled
          || cancellation === SemanticWorkerCancelState.contentModified)) entry.invalidation = "finish-sync"
      const draining = entry.invalidation === "finish-sync" && committing
      if (entry.invalidation === "finish-sync" && !committing && entry.cancelled !== undefined) {
        entry.invalidation = "settling"; entry.cancelled = now
      }
      if (committing && progress.activitySequence !== entry.activitySequence) {
        entry.activitySequence = progress.activitySequence
        entry.activityAt = now
      }
      // A normal input cancellation cannot safely unwind an in-place sync.
      // Only a matching sync may advance activityAt. Once accepted, that reference
      // remains monotonic until a validated terminal removes the waiting entry.
      // Returning to request/idle is not terminal receipt and cannot rewind grace.
      const cancelledSince = entry.cancelled === undefined ? undefined
        : Math.max(entry.cancelled, entry.activityAt ?? entry.cancelled)
      const reason = cancellation === undefined ? "invalid-cancellation-state" : !draining && cancelledSince !== undefined && now - cancelledSince >= this.limits.cancellation
        ? "cancellation-deadline" : entry.started !== undefined && now - entry.started >= limit
          ? "execution-deadline" : entry.started === undefined && now - entry.sent >= Math.max(limit, this.limits.preparation) ? "queue-deadline" : undefined
      if (!reason) continue
      this.logger?.error("semantic.worker.unresponsive", { reason, method, epoch: command.epoch,
        elapsedMs: now - entry.sent, limitMs: reason === "cancellation-deadline" ? this.limits.cancellation : limit,
        commandState: entry.cancelled !== undefined ? "cancel-pending" : entry.started !== undefined ? "executing" : "sent",
        cancellationPolicy: entry.invalidation ?? "interrupt",
        ...(cancelledSince === undefined ? {} : { cancellationReferenceMs: cancelledSince, cancellationQuietMs: now - cancelledSince }),
        ...(entry.activityAt === undefined ? {} : { lastActivityAgeMs: now - entry.activityAt }),
        ...(progress ?? { phase: "unmeasured" }) })
      this.dispose()
      this.failed(new Error("Semantic Worker did not settle " + method + ": " + reason))
      return
    }
  }
}
function key(epoch: number, id: number): string { return epoch + ":" + id }
