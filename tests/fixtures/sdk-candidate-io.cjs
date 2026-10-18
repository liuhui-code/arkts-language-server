const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Private fixture observation, never a fake filesystem result or timing benchmark.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("SDK candidate observer requires its private fixture")
  }
  const target = path.join(directory, "sdk", "ets", "api", "SharedBase.ets")
  const output = path.join(directory, "sdk-candidate-io.jsonl")
  const native = fs.lstatSync
  let sequence = 0
  fs.lstatSync = function (file, ...args) {
    if (typeof file === "string" && path.resolve(file) === target) {
      if (++sequence > 4096) throw new Error("private SDK candidate observation capacity exceeded")
      fs.appendFileSync(output, JSON.stringify({ pid: process.pid, threadId, sequence,
        path: target, timestamp: Date.now(), kind: "native-sdk-candidate-lstat-attempt" }) + "\n")
    }
    return Reflect.apply(native, this, [file, ...args])
  }
}
