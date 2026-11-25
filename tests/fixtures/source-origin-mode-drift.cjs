const fs = require("node:fs"), path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const descriptors = new Map(), open = fs.openSync, close = fs.closeSync, fstat = fs.fstatSync
  let fired = false
  fs.openSync = function(file, ...args) {
    const fd = Reflect.apply(open, this, [file, ...args])
    if (typeof file === "string" && file.endsWith(path.sep + "Unused350.ts")) descriptors.set(fd, { file, calls: 0 })
    return fd
  }
  fs.closeSync = function(fd, ...args) { descriptors.delete(fd); return Reflect.apply(close, this, [fd, ...args]) }
  fs.fstatSync = function(fd, ...args) {
    const stat = Reflect.apply(fstat, this, [fd, ...args]), record = descriptors.get(fd)
    if (!record || fired || ++record.calls !== 2) return stat
    fired = true
    const mode = stat.mode ^ 0o100
    fs.writeFileSync(path.join(directory, "source-origin-mode-drift.json"), JSON.stringify({
      pid: process.pid, threadId, file: record.file, actualMode: stat.mode, returnedMode: mode,
      caller: new Error().stack }))
    return Object.defineProperty(Object.create(stat), "mode", { value: mode })
  }
}
