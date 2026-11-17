const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fallback fixture required")
  const stat = fs.statSync
  fs.statSync = function(file, ...args) {
    try { return Reflect.apply(stat, this, [file, ...args]) }
    finally {
      if (typeof file === "string" && file.startsWith(path.join(directory, "workspace", "node_modules") + path.sep)
        && file.includes("@ohos.fixtureMissing")) {
        fs.appendFileSync(path.join(directory, "fallback-candidate-probes.jsonl"),
          JSON.stringify({ file, threadId, caller: new Error().stack.split("\n").slice(2, 8) }) + "\n")
      }
    }
  }
}
