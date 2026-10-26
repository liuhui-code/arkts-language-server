import { AsyncLocalStorage } from "node:async_hooks"
import { parentPort, workerData } from "node:worker_threads"
import type { SemanticWorkerMutation, SemanticWorkerRequest } from "./worker-protocol.js"

const phases = ["idle", "request", "synchronize", "program", "checker", "semantic-query"] as const
type Phase = typeof phases[number]
const buffer = (workerData as { semanticProgress?: SharedArrayBuffer } | undefined)?.semanticProgress
const words = buffer ? new Int32Array(buffer) : undefined
const scope = new AsyncLocalStorage<{ epoch: number; commandId: number }>()

/** Small shared counters remain observable when compiler JavaScript never returns. */
export function workerProgressSnapshot(shared: SharedArrayBuffer) {
  const values = Array.from(new Int32Array(shared))
  return { commandEpoch: values[0], commandId: values[1], phase: phases[values[2]] ?? "unknown",
    programStarts: values[3], programReturns: values[4], checkerStarts: values[5], checkerReturns: values[6],
    synchronizationStarts: values[7], synchronizationReturns: values[8] }
}

export function runWorkerCommand(command: SemanticWorkerMutation | SemanticWorkerRequest,
  run: () => Promise<void>): Promise<void> {
  const ticket = { epoch: command.epoch, commandId: "method" in command ? command.id : -command.revision }
  return scope.run(ticket, async () => {
    if (words) {
      Atomics.store(words, 0, ticket.epoch); Atomics.store(words, 1, ticket.commandId); Atomics.store(words, 2, 1)
      parentPort?.postMessage({ workerEvent: "execution", action: "started", ...ticket })
    }
    try { await run() } finally {
      if (words && Atomics.load(words, 0) === ticket.epoch && Atomics.load(words, 1) === ticket.commandId) {
        Atomics.store(words, 2, 0)
      }
    }
  })
}

/** Wraps the actual fixed compiler function, not a readiness flag or grouped timing event. */
export function observeCompilerPhase<Result>(phase: Phase, run: () => Result): Result {
  if (!words) return run()
  const previous = Atomics.exchange(words, 2, phases.indexOf(phase))
  const counter = phase === "program" ? 3 : phase === "checker" ? 5 : phase === "synchronize" ? 7 : undefined
  if (counter !== undefined) Atomics.add(words, counter, 1)
  try {
    const result = run()
    if (counter !== undefined) Atomics.add(words, counter + 1, 1)
    return result
  } finally { Atomics.store(words, 2, previous) }
}

export function compilerSynchronized(): void {
  const ticket = scope.getStore()
  if (words && ticket) parentPort?.postMessage({ workerEvent: "execution", action: "synchronized", ...ticket })
}
