const fs = require("node:fs")
const path = require("node:path")
const { fileURLToPath } = require("node:url")
const { Worker, isMainThread } = require("node:worker_threads")

// Change real private disk bytes only after the original Worker send succeeds.
if (isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private disk-source fixture required")
  const control = path.join(directory, "mutate-sent-disk-source.json")
  const witness = path.join(directory, "sent-disk-source-mutated.json")
  const post = Worker.prototype.postMessage
  Worker.prototype.postMessage = function (message, ...rest) {
    const result = Reflect.apply(post, this, [message, ...rest])
    if (message?.method === "define" && message.diskSource && fs.existsSync(control) && !fs.existsSync(witness)) {
      const file = fileURLToPath(message.uri), changed = JSON.parse(fs.readFileSync(control, "utf8"))
      if (file !== path.join(directory, "workspace", "Main.ets") || typeof changed.text !== "string") throw Error("invalid private source")
      const before = fs.statSync(file)
      if (Buffer.byteLength(changed.text) !== before.size) throw Error("private source mutation must preserve size")
      fs.writeFileSync(file, changed.text)
      fs.utimesSync(file, before.atime, before.mtime)
      fs.writeFileSync(witness, JSON.stringify({ pid: process.pid, requestId: message.id,
        boundary: "original-worker-postMessage-return", sentText: message.diskSource.text,
        currentText: fs.readFileSync(file, "utf8") }), { flag: "wx" })
    }
    return result
  }
}
