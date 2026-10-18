const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, Worker } = require("node:worker_threads")

// Private transport fault; all other real compiler/Worker messages are forwarded.
if (isMainThread) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR ?? "")
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("queue send fault requires its private fixture")
  }
  const send = Worker.prototype.postMessage
  let injected = false
  Worker.prototype.postMessage = function (message, ...args) {
    if (!injected && message?.method === "complete") {
      injected = true
      fs.writeFileSync(path.join(directory, "send-failure.json"), JSON.stringify({
        pid: process.pid, epoch: message.epoch, workerRequestId: message.id,
        method: message.method, uri: message.uri,
      }), { flag: "wx" })
      throw new Error("private queue send failure")
    }
    return Reflect.apply(send, this, [message, ...args])
  }
}
