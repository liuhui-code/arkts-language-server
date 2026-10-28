// Bounded transport timing only: actual compiler, cancellation cell and terminal envelope are unchanged.
require("./progressing-synchronization.cjs")
const fs = require("node:fs"), path = require("node:path")
const { isMainThread, parentPort, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR), requests = new Map()
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private handoff fixture required")
  const record = row => fs.appendFileSync(path.join(directory, "terminal-handoff.ndjson"),
    JSON.stringify({ at: Date.now(), threadId, ...row }) + "\n")
  parentPort.on("message", message => {
    if (message?.method && message.id !== undefined) requests.set(message.id, message)
  })
  const post = parentPort.postMessage
  let delayed = false
  parentPort.postMessage = function(message, ...rest) {
    const request = requests.get(message?.id)
    if (!delayed && Object.hasOwn(message ?? {}, "ok") && request?.method === "diagnose"
      && request.expectedDocumentVersion === 0 && request.uri.endsWith("/Main.ets")) {
      delayed = true
      record({ event: "terminal-produced", id: message.id, ok: message.ok })
      if (fs.existsSync(path.join(directory, "drop-handoff-terminal"))) {
        record({ event: "terminal-dropped", id: message.id })
        return
      }
      setTimeout(() => {
        record({ event: "terminal-posted", id: message.id, ok: message.ok })
        post.call(this, message, ...rest)
      }, 50)
      return
    }
    return post.call(this, message, ...rest)
  }
}
