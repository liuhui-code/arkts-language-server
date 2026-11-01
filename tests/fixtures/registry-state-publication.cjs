const fs = require("node:fs"), path = require("node:path")
const { isMainThread } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private audit fixture required")
  const armed = path.join(directory, "arm-build-state-publication")
  const entered = path.join(directory, "build-state-publication-entered")
  const release = path.join(directory, "release-build-state-publication")
  const write = fs.writeFileSync
  fs.writeFileSync = function(file, data, options) {
    if (path.basename(String(file)).startsWith("build-state.json") && fs.existsSync(armed)) {
      fs.unlinkSync(armed)
      write.call(this, file, "", options)
      write.call(this, entered, "entered after truncation")
      const deadline = Date.now() + 5000
      while (!fs.existsSync(release)) {
        if (Date.now() > deadline) throw Error("private state publication barrier timed out")
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
    }
    return write.call(this, file, data, options)
  }
}
require("./registry-release-audit.cjs")
