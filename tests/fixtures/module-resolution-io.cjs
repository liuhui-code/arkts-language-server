const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId, workerData, parentPort } = require("node:worker_threads")

// Diagnostic native API attempts, not kernel syscalls or performance timing.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("module resolution observer requires its private fixture")
  }
  const target = path.join(directory, "sdk", "ets", "api", "node_modules")
  const output = path.join(directory, "module-resolution-io.jsonl")
  const control = path.join(directory, "module-presence-window")
  const marker = path.join(directory, "module-presence-mutated.json")
  const negativeControl = path.join(directory, "module-negative-owner-window")
  const negativeMarker = path.join(directory, "module-negative-owner-mutated.json")
  const firstLeaf = path.join(directory, "sdk", "ets", "api", "Absent", "Probe0.ets")
  const nextLeaf = path.join(directory, "sdk", "ets", "api", "Absent", "Probe1.ets")
  const stat = fs.statSync
  const lstat = fs.lstatSync
  let firstNativeAbsence = false
  let sequence = 0
  let job = 0
  if (parentPort) {
    const post = parentPort.postMessage
    parentPort.postMessage = function (message, ...args) {
      if (message?.phase === "runtime-ready") job++
      return Reflect.apply(post, this, [message, ...args])
    }
  }
  fs.lstatSync = function (file, ...args) {
    if (path.resolve(String(file)) === nextLeaf && firstNativeAbsence
      && workerData?.operation === "references" && fs.existsSync(negativeControl)
      && !fs.existsSync(negativeMarker)) {
      fs.writeFileSync(firstLeaf, "export interface MissingType { value: string }\n", { flag: "wx" })
      fs.writeFileSync(negativeMarker, JSON.stringify({ pid: process.pid, threadId,
        operation: workerData.operation, entryFile: path.basename(process.argv[1] ?? ""),
        firstNativeError: "ENOENT", createdFile: firstLeaf }))
    }
    return Reflect.apply(lstat, this, [file, ...args])
  }
  fs.statSync = function (file, ...args) {
    try {
      if (path.resolve(String(file)) === target && workerData?.operation === "references"
        && fs.existsSync(control) && !fs.existsSync(marker)) {
        if (fs.existsSync(target)) throw new Error("private presence window requires an absent target")
        fs.mkdirSync(target)
        try {
          const observed = Reflect.apply(stat, this, [file, ...args])
          fs.writeFileSync(marker, JSON.stringify({ pid: process.pid, threadId,
            operation: workerData.operation, wasDirectory: observed.isDirectory() }))
          return observed
        } finally { fs.rmdirSync(target) }
      }
      return Reflect.apply(stat, this, [file, ...args])
    }
    catch (error) {
      if (path.resolve(String(file)) === firstLeaf && error.code === "ENOENT") firstNativeAbsence = true
      throw error
    }
    finally {
      if (path.resolve(String(file)) === target) {
        if (++sequence > 4096) throw new Error("private module resolution observation capacity exceeded")
        fs.appendFileSync(output, JSON.stringify({ pid: process.pid, threadId, sequence, job,
          entryFile: path.basename(process.argv[1] ?? ""),
          path: target, timestamp: Date.now(), kind: "native-directory-stat-attempt" }) + "\n")
      }
    }
  }
}
