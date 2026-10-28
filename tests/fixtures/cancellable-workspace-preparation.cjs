const fs = require("node:fs"), path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// A finite delay in a real dependency read, before compiler synchronization.
// No cancellation/heartbeat behavior is supplied by this fixture.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private workspace fixture required")
  const open = fs.openSync
  fs.openSync = function(file, ...args) {
    if (typeof file === "string" && path.basename(path.dirname(file)) === "cancel-graph"
      && fs.existsSync(path.join(directory, "arm-workspace-read"))) {
      fs.appendFileSync(path.join(directory, "workspace-reads.ndjson"), JSON.stringify({
        file, threadId, at: Date.now(), stack: new Error().stack,
      }) + "\n")
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40)
    }
    return open.call(this, file, ...args)
  }
}
