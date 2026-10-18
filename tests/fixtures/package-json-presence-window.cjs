const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// A real, private, unrelated directory change around an actual absent-package lookup.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("package presence window requires its private fixture")
  }
  const target = path.join(directory, "package.json")
  const marker = path.join(process.env.ARKTS_LSP_LOG_DIR, "package-presence-window.json")
  const native = fs.statSync
  fs.statSync = function (file, ...args) {
    try { return Reflect.apply(native, this, [file, ...args]) }
    catch (error) {
      if (typeof file === "string" && path.resolve(file) === target && error.code === "ENOENT"
        && new Error().stack.includes("isRegularBoundedFile") && !fs.existsSync(marker)) {
        const unrelated = fs.mkdtempSync(path.join(directory, "owned-unrelated-"))
        fs.rmdirSync(unrelated)
        fs.mkdirSync(process.env.ARKTS_LSP_LOG_DIR, { recursive: true })
        fs.writeFileSync(marker, JSON.stringify({ pid: process.pid, threadId, target,
          genuineNativeError: error.code, unrelatedDirectory: unrelated, remainsAbsent: !fs.existsSync(target) }))
      }
      throw error
    }
  }
}
