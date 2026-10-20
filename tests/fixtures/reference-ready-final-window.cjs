const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private readiness fixture required")
  const control = path.join(directory, "arm-reference-ready-final.json")
  const witness = path.join(directory, "reference-ready-final-mutated.json")
  const createHash = crypto.createHash
  crypto.createHash = function(...args) {
    const hash = Reflect.apply(createHash, this, args), update = hash.update
    hash.update = function(data, ...rest) {
      const result = Reflect.apply(update, this, [data, ...rest])
      if (typeof data === "string" && fs.existsSync(control) && !fs.existsSync(witness)) {
        const change = JSON.parse(fs.readFileSync(control, "utf8"))
        if (data === change.triggerText) {
          const file = path.join(directory, "workspace", "ZZCaller.ets"), stat = fs.statSync(file)
          if (Buffer.byteLength(change.text) !== stat.size) throw Error("equal-width mutation required")
          fs.writeFileSync(file, change.text); fs.utimesSync(file, stat.atime, stat.mtime)
          fs.writeFileSync(witness, JSON.stringify({ pid: process.pid, threadId,
            caller: new Error().stack.split("\n").slice(2), originalSize: stat.size, currentSize: fs.statSync(file).size }))
        }
      }
      return result
    }
    return hash
  }
}
