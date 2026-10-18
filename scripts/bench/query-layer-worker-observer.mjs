import fs from "node:fs"
import path from "node:path"
import * as workers from "node:worker_threads"
import { buildObservedWorkers } from "./query-layer-worker-build.mjs"
import { observeWorkerLifecycle } from "./query-layer-worker-lifecycle.mjs"

/** Diagnostic export-hook artifacts, preserving production-source bytes, workerData, messages and execution flags. */
export async function observeWorkerInputs(output, server, identity) {
  const directory = fs.mkdtempSync(path.join(path.dirname(output), "arkts-query-layer-counter-"))
  const workerArtifacts = await buildObservedWorkers(directory, server, identity)
  fs.writeFileSync(path.join(directory, "worker-artifacts.json"), JSON.stringify(workerArtifacts), { flag: "wx" })
  const preload = new URL("./query-layer-worker-preload.mjs", import.meta.url)
  preload.searchParams.set("counter-dir", directory)
  const created = []
  const lifecycle = observeWorkerLifecycle(directory, workers.threadId)
  class ObservedWorker extends workers.Worker {
    constructor(entry, options = {}) {
      const artifact = workerArtifacts.artifacts.find(item => path.resolve(item.productionPath) === path.resolve(String(entry)))
      if (!artifact) throw new Error("QUERY_LAYER_WORKER_ARTIFACT_UNKNOWN")
      lifecycle.beforeCreate()
      super(artifact.diagnosticPath, { ...options, execArgv: [...(options.execArgv ?? process.execArgv), "--import", preload.href] })
      lifecycle.created(this, artifact)
      const record = { threadId: this.threadId, messages: 0 }
      created.push(record)
      this.on("message", () => record.messages++)
    }
  }
  return {
    module: new Proxy(workers, { get(target, key, receiver) {
      return key === "Worker" ? ObservedWorker : Reflect.get(target, key, receiver)
    } }),
    collect() {
      const files = fs.readdirSync(directory).filter(file => file.endsWith(".jsonl") && !file.endsWith(".lifecycle.jsonl")).sort()
      const snapshots = files.flatMap(file => fs.readFileSync(path.join(directory, file), "utf8")
        .split("\n").filter(Boolean).map(line => JSON.parse(line)))
      for (const worker of created) {
        const observed = snapshots.filter(snapshot => snapshot.threadId === worker.threadId)
        if (worker.messages === 0 || observed.length !== worker.messages) {
          throw new Error("QUERY_LAYER_WORKER_COUNTER_INCOMPLETE")
        }
      }
      if (created.length === 0) throw new Error("QUERY_LAYER_WORKER_COUNTER_MISSING")
      const compilerFiles = fs.readdirSync(directory).filter(file => file.endsWith(".compiler.json")).sort()
      const workerCompilerObjects = compilerFiles.map(file => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")))
      if (workerCompilerObjects.length === 0) throw new Error("QUERY_LAYER_WORKER_COMPILER_MISSING")
      for (const record of workerCompilerObjects) {
        const artifact = workerArtifacts.artifacts.find(item => item.name === record.entryFile)
        if (!artifact || path.resolve(record.entryPath) !== path.resolve(artifact.diagnosticPath)
          || !snapshots.some(snapshot => snapshot.pid === record.pid && snapshot.threadId === record.threadId)) {
          throw new Error("QUERY_LAYER_WORKER_COMPILER_IDENTITY_MISMATCH")
        }
      }
      if (snapshots.some(snapshot => !workerCompilerObjects.some(record => record.pid === snapshot.pid
        && record.threadId === snapshot.threadId))) throw new Error("QUERY_LAYER_WORKER_COMPILER_INCOMPLETE")
      const lifecycleFiles = fs.readdirSync(directory).filter(file => file.endsWith(".lifecycle.jsonl")).sort()
      const workerLifecycleEvents = lifecycleFiles.flatMap(file => fs.readFileSync(path.join(directory, file), "utf8")
        .split("\n").filter(Boolean).map(line => JSON.parse(line)))
      for (const record of workerCompilerObjects) {
        const events = workerLifecycleEvents.filter(event => event.pid === record.pid && event.threadId === record.threadId)
        if (events.length !== 2 || events[0].event !== "created" || events[1].event !== "exited"
          || !Number.isSafeInteger(events[1].exitCode) || events[1].observedAtMs < events[0].observedAtMs
          || events[1].timeOrigin !== events[0].timeOrigin) throw new Error("QUERY_LAYER_WORKER_EXIT_UNOBSERVED")
      }
      return { workerSnapshots: snapshots, rawWorkerCounterDirectory: directory,
        workerArtifacts, workerCompilerObjects,
        workerLifecycleEvents, rawWorkerLifecycleFiles: lifecycleFiles.map(file => path.join(directory, file)),
        workerCompilerObservationComplete: workerCompilerObjects.every(record => record.compilerObjects.complete),
        rawWorkerCompilerFiles: compilerFiles.map(file => path.join(directory, file)),
        workerCounterScope: "cumulative-synchronous-native-api-attempts-from-preload; not RPC-exclusive",
        rawWorkerCounterFiles: files.map(file => path.join(directory, file)) }
    },
  }
}
