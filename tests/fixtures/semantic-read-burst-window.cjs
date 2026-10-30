// Controlled compiler query window for public LSP mutation/close burst tests only.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-completion-lifetime-")) throw Error("isolated burst fixture required")
  globalThis.__semanticReadBurstWindow = () => {
    const armed = path.join(directory, "burst-window-arm")
    if (!fs.existsSync(armed)) return
    fs.unlinkSync(armed)
    fs.writeFileSync(path.join(directory, "burst-window-entered.json"), JSON.stringify({ threadId, pid: process.pid }))
    const stop = performance.now() + 1000, release = path.join(directory, "burst-window-release")
    while (!fs.existsSync(release)) {
      if (performance.now() >= stop) throw Error("controlled read window was not released")
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "function getDefinitionAtPosition2(fileName, position, searchOtherFilesOnly, stopAtAlias) {"
      if (source.split(signature).length !== 2) throw Error("one actual compiler definition entry required")
      source = source.replace(signature, signature + "globalThis.__semanticReadBurstWindow();")
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
