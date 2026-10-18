const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Model a coarse/colliding filesystem identity at the native I/O boundary only.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (path.basename(directory).startsWith("arkts-semantic-ready-")) {
    const target = path.join(directory, "workspace", "Unopened.ets")
    const targets = new Set([target, fs.realpathSync(target)])
    const armFile = path.join(directory, "disk-stat-collision.json")
    const witnessFile = path.join(directory, "disk-stat-collision.jsonl")
    const originals = Object.fromEntries(["statSync", "lstatSync", "openSync", "closeSync", "fstatSync",
      "readSync", "readFileSync", "appendFileSync"].map(key => [key, fs[key].bind(fs)]))
    const descriptors = new Set()
    const armed = () => {
      try { return JSON.parse(originals.readFileSync(armFile, "utf8")) } catch { return null }
    }
    const masked = stat => {
      const arm = armed()
      if (arm) Object.assign(stat, { mtimeMs: arm.mtimeMs, ctimeMs: arm.ctimeMs,
        mtime: new Date(arm.mtimeMs), ctime: new Date(arm.ctimeMs) })
      return stat
    }
    for (const key of ["statSync", "lstatSync"]) {
      fs[key] = (file, ...args) => {
        const stat = originals[key](file, ...args)
        return targets.has(String(file)) ? masked(stat) : stat
      }
    }
    fs.openSync = (file, ...args) => {
      const fd = originals.openSync(file, ...args)
      if (targets.has(String(file))) descriptors.add(fd)
      return fd
    }
    fs.closeSync = fd => {
      try { return originals.closeSync(fd) } finally { descriptors.delete(fd) }
    }
    fs.fstatSync = (fd, ...args) => {
      const stat = originals.fstatSync(fd, ...args)
      return descriptors.has(fd) ? masked(stat) : stat
    }
    fs.readSync = (fd, ...args) => {
      const bytes = originals.readSync(fd, ...args)
      if (descriptors.has(fd) && armed()) originals.appendFileSync(witnessFile,
        JSON.stringify({ threadId, bytes, stack: new Error().stack }) + "\n")
      return bytes
    }
  }
}
