const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId, parentPort } = require("node:worker_threads")

// Observe physical metadata reads reached through the real request-sharing path.
// Direct read-before/read-after guards remain independent and are counted apart.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private input budget fixture required")
  const marker = path.join(directory, "arm-input-identity-budget")
  const output = path.join(directory, `input-identity-budget-${threadId}.json`)
  const shared = new Map(), actual = new Map(), identityBytes = new Map()
  const count = (values, file) => {
    if (!/^Filler\d+\.ets$/.test(path.basename(file)) || !fs.existsSync(marker)) return
    values.set(file, (values.get(file) ?? 0) + 1)
  }
  globalThis.__observeSharedIdentityRead = (file, identity) => {
    count(shared, file)
    if (shared.has(file) && identity) identityBytes.set(file,
      128 + 2 * (file.length + identity.physicalPath.length + identity.stamp.length))
  }
  globalThis.__observeActualIdentityRead = file => count(actual, file)
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const sharedHook = "function requestFileIdentity(filePath, read) {"
      const actualHook = "function diskIdentity(filePath) {"
      if (source.split(sharedHook).length !== 2 || source.split(actualHook).length !== 2) {
        throw Error("one actual request sharing and physical identity function required")
      }
      source = source.replace(sharedHook, sharedHook + `
        const observedRead = read;
        read = () => { const value = observedRead(); globalThis.__observeSharedIdentityRead(filePath, value); return value; };`)
      source = source.replace(actualHook, actualHook + "\nglobalThis.__observeActualIdentityRead(filePath);")
    }
    return Reflect.apply(compile, this, [source, file])
  }
  const post = parentPort.postMessage
  parentPort.postMessage = function (message, ...args) {
    if (message?.workerEvent !== "log") fs.writeFileSync(output, JSON.stringify({
      pid: process.pid, threadId, shared: Object.fromEntries(shared), actual: Object.fromEntries(actual),
      observedIdentityBytes: [...identityBytes.values()].reduce((sum, bytes) => sum + bytes, 0) }))
    return post.call(this, message, ...args)
  }
}
