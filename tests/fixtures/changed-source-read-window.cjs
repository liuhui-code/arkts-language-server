const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private source-read fixture required")
  const file = path.join(directory, "workspace", "ZZModel.ets")
  const marker = path.join(directory, "arm-changed-source-read.json")
  const witness = path.join(directory, "changed-source-read-mutated.json")
  const open = fs.openSync, close = fs.closeSync, fstat = fs.fstatSync, statSync = fs.statSync, descriptors = new Map()
  const pendingNamespaces = new Map()
  const record = (stat, caller) => {
    const current = fs.statSync(file)
    fs.writeFileSync(witness, JSON.stringify({ pid: process.pid, threadId, caller,
      originalSize: stat.size, currentSize: current.size, currentDirectory: current.isDirectory(), originalMtimeMs: stat.mtimeMs,
      currentMtimeMs: current.mtimeMs, originalCtimeMs: stat.ctimeMs, currentCtimeMs: current.ctimeMs }), { flag: "wx" })
  }
  fs.statSync = function(name, ...args) {
    const stat = Reflect.apply(statSync, this, [name, ...args])
    if (path.resolve(String(name)) === file && stat.isDirectory()) {
      const caller = new Error().stack
      if (caller.includes("lookupIdentity")) fs.appendFileSync(path.join(directory, "changed-source-namespace-observed.jsonl"),
        JSON.stringify({ pid: process.pid, threadId, caller }) + "\n")
    }
    return stat
  }
  fs.openSync = function(name, ...args) {
    const fd = Reflect.apply(open, this, [name, ...args])
    if (path.resolve(String(name)) === file) descriptors.set(fd, 0)
    return fd
  }
  fs.closeSync = function(fd) {
    try {
      const result = Reflect.apply(close, this, [fd]), pending = pendingNamespaces.get(fd)
      // Mutator I/O can immediately reuse the closed descriptor number.
      descriptors.delete(fd); pendingNamespaces.delete(fd)
      if (pending) {
        // Windows permits replacement after the real descriptor closes. This is
        // still inside the witnessed read, before its outer namespace recheck.
        fs.unlinkSync(file); fs.mkdirSync(file); record(pending.stat, pending.caller)
      }
      return result
    } finally { descriptors.delete(fd); pendingNamespaces.delete(fd) }
  }
  fs.fstatSync = function(fd, ...args) {
    const stat = Reflect.apply(fstat, this, [fd, ...args])
    if (!descriptors.has(fd)) return stat
    descriptors.set(fd, descriptors.get(fd) + 1)
    if (descriptors.get(fd) === 2 && fs.existsSync(marker) && !fs.existsSync(witness)) {
      const caller = new Error().stack
      if (!caller.includes("observeChangedSourceRead")) return stat
      const { text, mtimeOffsetMs = 0, namespace } = JSON.parse(fs.readFileSync(marker, "utf8"))
      if (Buffer.byteLength(text) !== stat.size) throw Error("equal-byte fixture required")
      if (namespace) { pendingNamespaces.set(fd, { stat, caller }); return stat }
      else {
        fs.writeFileSync(file, text)
        if (mtimeOffsetMs) fs.utimesSync(file, stat.atimeMs / 1000, (stat.mtimeMs + mtimeOffsetMs) / 1000)
        else fs.utimesSync(file, stat.atime, stat.mtime)
      }
      record(stat, caller)
    }
    return stat
  }
}
