const fs = require("node:fs"), path = require("node:path")
if (require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private readiness fixture required")
  const logPath = path.join(process.env.ARKTS_LSP_LOG_DIR, "server.log")
  const original = fs.appendFileSync
  let writes = 0, events = 0
  fs.appendFileSync = function(file, value, ...args) {
    if (file === logPath && typeof value === "string") {
      const count = value.split('"event":"semantic.readiness.input-check.').length - 1
      if (count) { writes++; events += count }
    }
    return Reflect.apply(original, this, [file, value, ...args])
  }
  process.once("exit", () => fs.writeFileSync(path.join(directory, "readiness-log-writes.json"),
    JSON.stringify({ writes, events, pid: process.pid })))
}
