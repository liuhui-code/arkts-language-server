// Controlled finite compiler work, never imported by product or installed servers.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { isMainThread, threadId, parentPort } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("isolated save fixture required")
  globalThis.__finiteSaveSynchronization = () => {
    const arm = path.join(directory, "finite-save-sync.json")
    if (!fs.existsSync(arm)) return
    const control = JSON.parse(fs.readFileSync(arm, "utf8"))
    if (control.remaining !== 1) return
    fs.writeFileSync(arm, JSON.stringify({ ...control, remaining: 0 }))
    fs.writeFileSync(path.join(directory, "finite-save-entered.json"), JSON.stringify({ threadId, at: Date.now() }))
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, control.endless ? undefined : control.holdMs)
    fs.writeFileSync(path.join(directory, "finite-save-returned.json"), JSON.stringify({ threadId, at: Date.now() }))
  }
  const post = parentPort.postMessage.bind(parentPort)
  parentPort.postMessage = function(message, ...args) {
    const arm = path.join(directory, "finite-save-sync.json")
    if (message?.ok === false && message.error?.code === "content-modified" && fs.existsSync(arm)) {
      const control = JSON.parse(fs.readFileSync(arm, "utf8"))
      if (control.dropTerminal && !control.dropped) {
        fs.writeFileSync(arm, JSON.stringify({ ...control, dropped: true }))
        fs.writeFileSync(path.join(directory, "finite-save-terminal-dropped.json"), JSON.stringify({ threadId, at: Date.now() }))
        return
      }
    }
    return post(message, ...args)
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "function __arktsObserved_createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {"
      if (source.split(signature).length !== 2) throw Error("one real observed compiler Program required")
      source = source.replace(signature, signature + "globalThis.__finiteSaveSynchronization();")
    }
    return compile.call(this, source, file)
  }
}
