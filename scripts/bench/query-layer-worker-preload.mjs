import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { isMainThread, parentPort, threadId } from "node:worker_threads"

import { observeInputOperations } from "./query-layer-input-observer.mjs"
import { observeCompilerObjects, wrapCompilerForObservation } from "./query-layer-compiler-observer.mjs"
import { observeWorkerLifecycle } from "./query-layer-worker-lifecycle.mjs"

const directory = new URL(import.meta.url).searchParams.get("counter-dir")
if (!isMainThread && parentPort && directory) {
  if (!path.basename(directory).startsWith("arkts-query-layer-counter-")) {
    throw new Error("QUERY_LAYER_WORKER_COUNTER_DIRECTORY_INVALID")
  }
  const file = path.join(directory, `${process.pid}-${threadId}.jsonl`)
  const append = fs.appendFileSync
  const write = fs.writeFileSync
  const rename = fs.renameSync
  const post = parentPort.postMessage
  const artifacts = JSON.parse(fs.readFileSync(path.join(directory, "worker-artifacts.json"), "utf8")).artifacts
  const workerModule = createRequire(import.meta.url)("node:worker_threads")
  const lifecycle = observeWorkerLifecycle(directory, threadId)
  const OriginalWorker = workerModule.Worker
  workerModule.Worker = class extends OriginalWorker {
    constructor(entry, options) {
      const artifact = artifacts.find(item => [item.productionPath, item.diagnosticPath]
        .some(file => path.resolve(file) === path.resolve(String(entry))))
      if (!artifact) {
        process.stderr.write(`QUERY_LAYER_NESTED_WORKER_ARTIFACT_UNKNOWN:${String(entry)}\n`)
        throw new Error("QUERY_LAYER_NESTED_WORKER_ARTIFACT_UNKNOWN")
      }
      lifecycle.beforeCreate()
      try { super(artifact.diagnosticPath, options) }
      catch (error) { process.stderr.write(`${error.stack}\n`); throw error }
      lifecycle.created(this, artifact)
    }
  }
  const observer = observeInputOperations()
  const compiler = observeCompilerObjects({ checkpoint: boundary => recordCompiler(boundary) })
  compiler.mark("worker-lifetime-start", {})
  globalThis[Symbol.for("arkts.query-layer.compiler-observer")] = exports => wrapCompilerForObservation(exports, compiler)
  const compilerFile = path.join(directory, `${process.pid}-${threadId}.compiler.json`)
  const recordCompiler = boundary => {
    const record = { pid: process.pid, threadId, entryFile: path.basename(process.argv[1] ?? ""), entryPath: process.argv[1],
      observedAtMs: performance.now(), timeOrigin: performance.timeOrigin,
      observationScope: "worker-lifetime-public-calls; not RPC-exclusive", boundary, compilerObjects: compiler.snapshot() }
    write(`${compilerFile}.pending`, JSON.stringify(record) + "\n")
    rename(`${compilerFile}.pending`, compilerFile)
  }
  const requests = new Map()
  let sequence = 0
  parentPort.on("message", message => {
    if (Number.isSafeInteger(message?.id) && typeof message.method === "string") {
      if (requests.size >= 256) throw new Error("QUERY_LAYER_WORKER_COUNTER_REQUEST_LIMIT")
      requests.set(JSON.stringify([message.epoch, message.id]), {
        epoch: message.epoch, id: message.id, method: message.method,
      })
    }
  })
  parentPort.postMessage = function (message, ...rest) {
    const key = JSON.stringify([message?.epoch, message?.id])
    const request = requests.get(key)
    const snapshot = { pid: process.pid, threadId, sequence: ++sequence, timestamp: Date.now(),
      entryFile: path.basename(process.argv[1] ?? ""), counts: observer.snapshot(),
      ...(request ? { request } : {}),
      response: typeof message?.ok === "boolean", messageKeys: Object.keys(message ?? {}).sort() }
    append(file, `${JSON.stringify(snapshot)}\n`)
    recordCompiler("outbound-message")
    if (snapshot.response) requests.delete(key)
    return Reflect.apply(post, this, [message, ...rest])
  }
  process.on("exit", () => recordCompiler("isolate-exit"))
}
