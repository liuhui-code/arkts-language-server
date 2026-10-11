const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Observe the real filesystem boundary, never compiler/server private internals.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR && process.env.ARKLINE_HARMONY_SDK_PATH) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) {
    throw new Error("lstat counter requires its private readiness fixture")
  }
  const sdk = process.env.ARKLINE_HARMONY_SDK_PATH
  const roots = [sdk, fs.realpathSync.native(sdk)].map(root => path.resolve(root) + path.sep)
  const output = path.join(directory, `lstat-absence-${threadId}.json`)
  const state = { pid: process.pid, threadId, sdkCalls: 0, enoentExceptions: 0 }
  const flush = () => {
    const temporary = output + ".tmp"
    fs.writeFileSync(temporary, JSON.stringify(state))
    fs.renameSync(temporary, output)
  }
  flush()
  const original = fs.lstatSync
  fs.lstatSync = function (filePath, ...rest) {
    const resolved = path.resolve(String(filePath))
    const observed = roots.some(root => resolved.startsWith(root))
    let expectedMissing = false
    try {
      return original.call(this, filePath, ...rest)
    } catch (error) {
      if (observed && error.code === "ENOENT") {
        state.enoentExceptions += 1
        expectedMissing = true
      }
      throw error
    } finally {
      if (observed) {
        state.sdkCalls += 1
        if (expectedMissing || state.sdkCalls % 128 === 0) flush()
      }
    }
  }
}
