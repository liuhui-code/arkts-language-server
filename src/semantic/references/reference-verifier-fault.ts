import { SEMANTIC_WORKER_PROTOCOL_VERSION } from "../worker-protocol.js"

export type VerifierFaultReason = "unexpected-exit" | "worker-error" | "protocol-violation" | "termination-failed" | "transport-failed"
interface VerifierFault {
  readonly workerEvent: "verifierFault"
  readonly protocol: number
  readonly generation: number
  readonly jobId: number | null
  readonly reason: VerifierFaultReason
}
let observer: ((fault: VerifierFault) => void) | undefined

export function observeReferenceVerifierFault(next: (fault: VerifierFault) => void): () => void {
  observer = next
  return () => { if (observer === next) observer = undefined }
}

export function reportReferenceVerifierFault(reason: VerifierFaultReason, generation: number, jobId: number | null): void {
  observer?.({ workerEvent: "verifierFault", protocol: SEMANTIC_WORKER_PROTOCOL_VERSION, generation, jobId, reason })
}

export function isReferenceVerifierFault(value: unknown): value is VerifierFault {
  if (!value || typeof value !== "object") return false
  const message = value as VerifierFault
  return Object.keys(value).length === 5 && message.workerEvent === "verifierFault"
    && message.protocol === SEMANTIC_WORKER_PROTOCOL_VERSION
    && Number.isSafeInteger(message.generation) && message.generation > 0
    && (message.jobId === null || Number.isSafeInteger(message.jobId) && message.jobId > 0)
    && ["unexpected-exit", "worker-error", "protocol-violation", "termination-failed", "transport-failed"].includes(message.reason)
}
