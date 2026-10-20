const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId, parentPort } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw new Error("private input-validation fixture required")
  const marker = path.join(directory, "arm-input-validation")
  const output = path.join(directory, `input-validation-${threadId}.json`)
  const paths = new Map()
  globalThis.__observeInputValidation = file => {
    if (!/^@ohos\.inputcheck\d+\.d\.ts$/.test(path.basename(file)) || !fs.existsSync(marker)) return
    paths.set(file, (paths.get(file) ?? 0) + 1)
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const hook = "function lookupIdentity(filePath, directoryIdentityOnly = false) {"
      if (source.split(hook).length !== 2) throw new Error("one actual witness identity function required")
      source = source.replace(hook, hook + "\nglobalThis.__observeInputValidation(filePath);")
    }
    return Reflect.apply(compile, this, [source, file])
  }
  const post = parentPort.postMessage
  parentPort.postMessage = function(message, ...args) {
    if (message?.workerEvent !== "log") fs.writeFileSync(output, JSON.stringify({
      pid: process.pid, threadId, paths: Object.fromEntries(paths) }))
    return post.call(this, message, ...args)
  }
}
