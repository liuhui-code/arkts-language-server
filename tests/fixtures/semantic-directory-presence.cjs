const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// A real false directoryExists result, with only its private parent's stamp changed.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const fixtureRoot = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(fixtureRoot).startsWith("arkts-resident-interactive-")) {
    throw new Error("directory-presence fixture requires its private interactive root")
  }
  const targets = [fixtureRoot, fs.realpathSync.native(fixtureRoot)]
    .map(root => path.join(root, "node_modules", "@types"))
  const transient = fs.existsSync(path.join(fixtureRoot, "presence-window.json"))
  const original = fs.statSync
  let changed = false
  fs.statSync = function (filePath, ...rest) {
    if (!changed && targets.includes(path.resolve(String(filePath)))) {
      changed = true
      const before = original.call(this, fixtureRoot)
      fs.writeFileSync(path.join(fixtureRoot, `presence-sibling-${threadId}.json`),
        JSON.stringify({ pid: process.pid, threadId, directory: String(filePath), transient }))
      fs.utimesSync(fixtureRoot, before.atime, new Date(before.mtimeMs + 1000))
      if (transient) {
        const directory = path.join(fixtureRoot, "node_modules", "@types")
        fs.mkdirSync(directory, { recursive: true })
        const result = original.call(this, directory, ...rest)
        fs.rmdirSync(directory)
        fs.rmdirSync(path.join(fixtureRoot, "node_modules"))
        return result
      }
    }
    return original.call(this, filePath, ...rest)
  }
}
