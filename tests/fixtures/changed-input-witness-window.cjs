const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private changed-input fixture required")
  const workspace = path.join(directory, "workspace"), physicalRoot = fs.realpathSync(workspace)
  const control = path.join(directory, "arm-changed-input.json"), witness = path.join(directory, "changed-input-mutated.json")
  const open = fs.openSync, close = fs.closeSync, fstat = fs.fstatSync, descriptors = new Map()
  fs.openSync = function(file, ...args) {
    const fd = Reflect.apply(open, this, [file, ...args]), name = String(file)
    if (path.basename(name) === "Filler0000.ets" && [workspace, physicalRoot].some(root => name.startsWith(root + path.sep))) descriptors.set(fd, 0)
    return fd
  }
  fs.closeSync = function(fd) {
    try { return Reflect.apply(close, this, [fd]) } finally { descriptors.delete(fd) }
  }
  fs.fstatSync = function(fd, ...args) {
    const result = Reflect.apply(fstat, this, [fd, ...args])
    if (!descriptors.has(fd)) return result
    descriptors.set(fd, descriptors.get(fd) + 1)
    if (descriptors.get(fd) !== 2 || !fs.existsSync(control) || fs.existsSync(witness)) return result
    const caller = new Error().stack.split("\n").slice(2, 14)
    if (!caller.some(line => line.includes("assertCurrentWorkspaceSources"))) return result
    const change = JSON.parse(fs.readFileSync(control, "utf8"))
    const target = path.join(workspace, "b/src/main/ets/Globals.d.ts")
    const before = fs.statSync(target), beforePhysicalPath = fs.realpathSync(target)
    if (change.mode === "rewrite") {
      if (Buffer.byteLength(change.text) !== before.size) throw Error("equal-width mutation required")
      fs.writeFileSync(target, change.text); fs.utimesSync(target, before.atime, before.mtime)
    } else if (change.mode === "parent-retarget") {
      const parent = path.dirname(target), moved = parent + ".moved"
      if (fs.existsSync(moved)) throw Error("fresh private parent required")
      fs.renameSync(parent, moved); fs.symlinkSync(path.basename(moved), parent, "dir")
    } else throw Error("unknown private mutation")
    const identity = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]
    fs.writeFileSync(witness, JSON.stringify({ mode: change.mode, pid: process.pid, threadId, caller,
      beforeIdentity: identity(before), afterIdentity: identity(fs.statSync(target)),
      beforePhysicalPath, afterPhysicalPath: fs.realpathSync(target) }), { flag: "wx" })
    return result
  }
}
