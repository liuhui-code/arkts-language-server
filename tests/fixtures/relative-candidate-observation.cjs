const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private relative fixture required")
  const stat = fs.statSync
  fs.statSync = function(file, ...args) {
    try { return Reflect.apply(stat, this, [file, ...args]) }
    finally {
      if (typeof file === "string" && path.basename(file) === "Shared.ets") {
        fs.appendFileSync(path.join(directory, "relative-candidate.jsonl"), JSON.stringify({ file, threadId }) + "\n")
      }
    }
  }
}
