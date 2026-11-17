const fs = require("node:fs")
const path = require("node:path")
const { isMainThread } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private scope fixture required")
  const realpath = fs.realpathSync
  const observed = function(file, ...args) {
    if (typeof file === "string" && file.endsWith("/Unused0.ts")
      && new Error().stack.includes("relativeModuleBoundary")) {
      fs.appendFileSync(path.join(directory, "scope-boundaries.jsonl"), JSON.stringify({ file }) + "\n")
    }
    return Reflect.apply(realpath, this, [file, ...args])
  }
  observed.native = function(file, ...args) {
    if (typeof file === "string" && /\/(Main|Augment|Unused0)\.(ets|ts)$/.test(file)) {
      const limit = Error.stackTraceLimit
      Error.stackTraceLimit = 40
      const stack = new Error().stack
      Error.stackTraceLimit = limit
      if (stack.includes("ScopeDependencyGraph.update") && stack.includes("scan")
        && stack.includes("withRequestInputValidation") && !stack.includes("validateRequestInput")) {
        fs.appendFileSync(path.join(directory, "scope-early-unions.jsonl"), JSON.stringify({ file, stack }) + "\n")
      }
    }
    return Reflect.apply(realpath.native, this, [file, ...args])
  }
  fs.realpathSync = observed
}
