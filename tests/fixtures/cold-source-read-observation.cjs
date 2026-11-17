const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private source-read fixture required")
  const open = fs.openSync
  fs.openSync = function(file, ...args) {
    if (typeof file === "string" && file.startsWith(path.join(directory, "workspace") + path.sep)) {
      const caller = new Error().stack.split("\n").slice(2, 14)
      const kind = caller.some(line => line.includes("loadRecord")) ? "lazy-read"
        : caller.some(line => line.includes("TypeScriptResidentReferenceState.observe")) ? "proof-read" : undefined
      if (kind) fs.appendFileSync(path.join(directory, "cold-source-read-provenance.jsonl"),
        JSON.stringify({ kind, file, threadId, caller }) + "\n")
    }
    return Reflect.apply(open, this, [file, ...args])
  }
  const original = fs.realpathSync.native
  fs.realpathSync.native = function(file, ...args) {
    try { return Reflect.apply(original, this, [file, ...args]) }
    finally {
      if (typeof file === "string" && file.includes(path.join(directory, "workspace"))) {
        const caller = new Error().stack.split("\n").slice(2, 10)
        if (caller.some(line => line.includes("diskIdentity"))
          && caller.some(line => line.includes("loadRecord"))
          && !caller.some(line => line.includes("compilerOwned"))) {
          fs.appendFileSync(path.join(directory, "cold-source-read-guards.jsonl"),
            JSON.stringify({ file, threadId, caller }) + "\n")
        }
      }
    }
  }
}
