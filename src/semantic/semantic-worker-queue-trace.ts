import { performance } from "node:perf_hooks"
import { threadId } from "node:worker_threads"

import type { StructuredLogger } from "../observability/logger.js"
import type { RootSemanticWorkerRequestInput } from "./semantic-worker-command-input.js"
import type { SemanticWorkerRequest } from "./worker-protocol.js"

/** Parent-side admission through successful send return, not Worker execution. */
export class SemanticWorkerQueueTrace {
  readonly #admissions = new WeakMap<object, { traceId: number; monotonicMs: number }>()
  #nextTraceId = 1

  constructor(
    readonly logger: StructuredLogger,
    readonly rootUri: string,
    readonly epoch: number,
  ) {}

  enqueued(input: RootSemanticWorkerRequestInput): void {
    const admission = { traceId: this.#nextTraceId++, monotonicMs: performance.now() }
    this.#admissions.set(input, admission)
    this.#record("semantic.queue.enqueued", { ...admission, method: input.method,
      uri: input.uri, expectedDocumentVersion: input.expectedDocumentVersion })
  }

  sendReturned(input: RootSemanticWorkerRequestInput, wire: SemanticWorkerRequest): void {
    const admission = this.#admissions.get(input)
    if (!admission) return
    this.#admissions.delete(input)
    const monotonicMs = performance.now()
    this.#record("semantic.queue.send.returned", {
      traceId: admission.traceId, monotonicMs, method: input.method, uri: input.uri,
      expectedDocumentVersion: input.expectedDocumentVersion,
      workerRequestId: wire.id, requiredAppliedRevision: wire.requiredRevision,
      supervisorAdmissionToSendReturnedMs: monotonicMs - admission.monotonicMs,
    })
  }

  #record(event: string, fields: Readonly<Record<string, string | number | null>>): void {
    try {
      this.logger.info(event, { rootUri: this.rootUri, epoch: this.epoch, ...fields })
    } catch {
      // An unavailable observer must not alter request ownership or scheduling.
      // Missing receipts cannot qualify a measurement.
    }
  }
}

/** Worker-local clock only: excludes undelivered messages and compiler execution. */
export function traceSemanticWorkerDispatch(
  logger: StructuredLogger, rootUri: string | undefined,
  request: SemanticWorkerRequest, workerReceivedMonotonicMs: number,
): void {
  const workerDispatchMonotonicMs = performance.now()
  try {
    logger.info("semantic.queue.worker.dispatch.started", {
      rootUri, epoch: request.epoch, workerRequestId: request.id, method: request.method,
      uri: request.uri, expectedDocumentVersion: request.expectedDocumentVersion,
      requiredAppliedRevision: request.requiredRevision, workerThreadId: threadId,
      workerReceivedMonotonicMs, workerDispatchMonotonicMs,
      workerReceivedToDispatchMs: workerDispatchMonotonicMs - workerReceivedMonotonicMs,
    })
  } catch {
    // Failed observation is missing evidence, not a failed semantic request.
  }
}
