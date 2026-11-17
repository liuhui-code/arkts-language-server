const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private SDK fixture required")
  const exists = fs.existsSync
  fs.existsSync = function(file, ...args) {
    const result = Reflect.apply(exists, this, [file, ...args])
    if (typeof file === "string" && path.basename(file) === "@ohos.shared.d.ts"
      && file.startsWith(path.join(directory, "sdk") + path.sep)) {
      fs.appendFileSync(path.join(directory, "sdk-module-candidates.jsonl"),
        JSON.stringify({ file, result, threadId }) + "\n")
    }
    return result
  }
}
