const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId, workerData } = require("node:worker_threads")

// Real private-file mutation after the completed native read, not a compiler mock.
if (!isMainThread && workerData?.runtimeConfig && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private dependency-read fixture required")
  const file = path.join(directory, "workspace", "Unopened.ets"), physical = fs.realpathSync(file)
  const control = path.join(directory, "mutate-read-dependency.json"), witness = path.join(directory, "read-dependency-mutated.json")
  const open = fs.openSync, close = fs.closeSync, fstat = fs.fstatSync, descriptors = new Map()
  fs.openSync = function (name, ...args) {
    const fd = Reflect.apply(open, this, [name, ...args])
    if ([file, physical].includes(String(name))) descriptors.set(fd, 0)
    return fd
  }
  fs.closeSync = function (fd) {
    try { return Reflect.apply(close, this, [fd]) } finally { descriptors.delete(fd) }
  }
  fs.fstatSync = function (fd, ...args) {
    const stat = Reflect.apply(fstat, this, [fd, ...args])
    if (!descriptors.has(fd)) return stat
    const count = descriptors.get(fd) + 1
    descriptors.set(fd, count)
    if (count === 2 && fs.existsSync(control) && !fs.existsSync(witness)) {
      const { text, finalVerificationOnly } = JSON.parse(fs.readFileSync(control, "utf8"))
      const caller = new Error().stack.split("\n").slice(2, 12)
      if (finalVerificationOnly && !caller.some(line => line.includes("assertCurrentWorkspaceSources"))) return stat
      if (typeof text !== "string" || Buffer.byteLength(text) !== stat.size) throw Error("private mutation must preserve byte length")
      fs.writeFileSync(file, text)
      fs.utimesSync(file, stat.atime, stat.mtime)
      fs.writeFileSync(witness, JSON.stringify({ pid: process.pid, threadId, boundary: "native-read-final-fstat-return",
        originalSize: stat.size, currentSize: fs.statSync(file).size, currentText: fs.readFileSync(file, "utf8"),
        caller }), { flag: "wx" })
    }
    return stat
  }
}
