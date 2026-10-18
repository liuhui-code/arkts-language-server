import fs from "node:fs"
import path from "node:path"

const MAX_WORKERS_PER_PARENT = 1024

/** Native parent-side exit is a stopped-thread witness, not LS disposal or RSS recovery. */
export function observeWorkerLifecycle(directory, parentThreadId) {
  const append = fs.appendFileSync
  const file = path.join(directory, `${process.pid}-${parentThreadId}.lifecycle.jsonl`)
  let created = 0
  return {
    beforeCreate() {
      if (created >= MAX_WORKERS_PER_PARENT) throw new Error("QUERY_LAYER_WORKER_LIFECYCLE_CAPACITY")
    },
    created(worker, artifact) {
      created++
      const identity = { pid: process.pid, parentThreadId, threadId: worker.threadId,
        entryFile: artifact.name, entryPath: artifact.diagnosticPath }
      const record = (event, details = {}) => append(file, JSON.stringify({ ...identity, event,
        observedAtMs: performance.now(), timeOrigin: performance.timeOrigin, ...details }) + "\n")
      record("created")
      worker.once("exit", exitCode => record("exited", { exitCode }))
    },
  }
}
