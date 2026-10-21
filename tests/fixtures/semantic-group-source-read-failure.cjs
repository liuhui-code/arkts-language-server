const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw new Error("private group recovery fixture required")
  const open = fs.openSync
  let failed = false
  fs.openSync = function (file, ...args) {
    const stack = new Error().stack ?? ""
    if (!failed && String(file).endsWith("/a/src/main/ets/ZRecovered.ets")
      && stack.includes("TypeScriptLazySnapshots.load")) {
      failed = true
      fs.writeFileSync(path.join(directory, "group-source-read-failure.json"), JSON.stringify({
        file: String(file), pid: process.pid, threadId, stack }))
      throw Object.assign(new Error("private fixture transient source read failure"), { code: "EIO" })
    }
    return open.call(this, file, ...args)
  }
}
