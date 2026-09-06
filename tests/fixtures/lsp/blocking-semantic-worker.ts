import { parentPort } from "node:worker_threads"

const port = parentPort
if (!port) throw new Error("blocking semantic worker requires a parent port")

const BLOCKING_FAILSAFE_MS = 30_000

port.on("message", (message: unknown) => {
  if (!isBlockingRequest(message)) return

  const cancellation = new Int32Array(message.cancelCell)
  port.postMessage({
    protocol: 1,
    kind: "entered",
    requestId: message.requestId,
  })

  const waitOutcome = Atomics.wait(cancellation, 0, 0, BLOCKING_FAILSAFE_MS)
  const cancellationState = Atomics.load(cancellation, 0)
  if (waitOutcome === "timed-out" && cancellationState === 0) {
    port.postMessage({
      protocol: 1,
      kind: "failsafe",
      requestId: message.requestId,
      reason: "blocking semantic fixture timed out",
    })
    return
  }

  port.postMessage({
    protocol: 1,
    kind: "terminal",
    requestId: message.requestId,
    cancellation: cancellationState,
  })
})

interface BlockingRequest {
  protocol: 1
  kind: "block"
  requestId: number | string
  cancelCell: SharedArrayBuffer
}

function isBlockingRequest(value: unknown): value is BlockingRequest {
  if (value === null || typeof value !== "object") return false
  const candidate = value as Partial<BlockingRequest>
  return candidate.protocol === 1
    && candidate.kind === "block"
    && (typeof candidate.requestId === "number" || typeof candidate.requestId === "string")
    && candidate.cancelCell instanceof SharedArrayBuffer
    && candidate.cancelCell.byteLength === Int32Array.BYTES_PER_ELEMENT
}
