import type { Worker } from "node:worker_threads"

/** Drain nested verifier Workers before stopping their owning isolate. */
export async function shutdownSemanticWorker(worker: Worker | undefined): Promise<void> {
  if (!worker) return
  await new Promise<void>(resolve => {
    const finish = () => {
      clearTimeout(timer)
      worker.off("message", onMessage)
      worker.off("error", finish)
      worker.off("exit", finish)
      resolve()
    }
    const onMessage = (message: { workerEvent?: string } | null) => {
      if (message?.workerEvent === "shutdownComplete") finish()
    }
    const timer = setTimeout(finish, 1_000)
    worker.on("message", onMessage)
    worker.once("error", finish)
    worker.once("exit", finish)
    try { worker.postMessage({ control: "shutdown" }) }
    catch { finish() }
  })
  await worker.terminate()
}
