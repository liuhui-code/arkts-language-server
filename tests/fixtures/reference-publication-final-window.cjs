const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Mutate a different, unpreloaded private input during the real publication fence.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private publication fixture required")
  const file = path.join(directory, "workspace", "Filler0000.ets"), physical = fs.realpathSync(file)
  const control = path.join(directory, "arm-reference-publication.json")
  const witness = path.join(directory, "reference-publication-mutated.json")
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
    descriptors.set(fd, descriptors.get(fd) + 1)
    if (descriptors.get(fd) !== 2 || !fs.existsSync(control) || fs.existsSync(witness)) return stat
    const caller = new Error().stack.split("\n").slice(2, 14)
    if (!caller.some(line => line.includes("assertCurrentWorkspaceSources"))) return stat
    const { text } = JSON.parse(fs.readFileSync(control, "utf8"))
    const changed = path.join(directory, "workspace", "ZZCaller.ets"), before = fs.statSync(changed)
    if (Buffer.byteLength(text) !== before.size) throw Error("equal-width mutation required")
    fs.writeFileSync(changed, text); fs.utimesSync(changed, before.atime, before.mtime)
    fs.writeFileSync(witness, JSON.stringify({ pid: process.pid, threadId, caller,
      originalSize: before.size, currentSize: fs.statSync(changed).size }), { flag: "wx" })
    return stat
  }
}
