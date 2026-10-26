import { SEMANTIC_WORKER_PROTOCOL_VERSION } from "./worker-protocol.js"

const reason = "cleanup-ownership-uncertain"
export function ownershipFaultEvent() {
  return { workerEvent: "fault", protocol: SEMANTIC_WORKER_PROTOCOL_VERSION, reason } as const
}

/** A bounded internal signal, independent of any request's cancellation terminal. */
export function isOwnershipFaultEvent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const message = value as Record<string, unknown>
  return Object.keys(message).length === 3 && message.workerEvent === "fault"
    && message.protocol === SEMANTIC_WORKER_PROTOCOL_VERSION && message.reason === reason
}
