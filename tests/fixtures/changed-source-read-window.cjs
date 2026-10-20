const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private source-read fixture required")
  const file = path.join(directory, "workspace", "ZZModel.ets")
  const marker = path.join(directory, "arm-changed-source-read.json")
  const witness = path.join(directory, "changed-source-read-mutated.json")
  const open = fs.openSync, close = fs.closeSync, fstat = fs.fstatSync, descriptors = new Map()
  fs.openSync = function(name, ...args) {
    const fd = Reflect.apply(open, this, [name, ...args])
    if (path.resolve(String(name)) === file) descriptors.set(fd, 0)
    return fd
  }
  fs.closeSync = function(fd) {
    try { return Reflect.apply(close, this, [fd]) } finally { descriptors.delete(fd) }
  }
  fs.fstatSync = function(fd, ...args) {
    const stat = Reflect.apply(fstat, this, [fd, ...args])
    if (!descriptors.has(fd)) return stat
    descriptors.set(fd, descriptors.get(fd) + 1)
    if (descriptors.get(fd) === 2 && fs.existsSync(marker) && !fs.existsSync(witness)) {
      const caller = new Error().stack
      if (!caller.includes("observeChangedSourceRead")) return stat
      const { text } = JSON.parse(fs.readFileSync(marker, "utf8"))
      if (Buffer.byteLength(text) !== stat.size) throw Error("equal-byte fixture required")
      fs.writeFileSync(file, text); fs.utimesSync(file, stat.atime, stat.mtime)
      fs.writeFileSync(witness, JSON.stringify({ pid: process.pid, threadId, caller,
        originalSize: stat.size, currentSize: fs.statSync(file).size }), { flag: "wx" })
    }
    return stat
  }
}
