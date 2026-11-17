const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  let changed = false
  globalThis.__changeAfterColdAcquire = source => {
    if (changed || path.basename(source.fileName) !== "Dep299.ets") return
    changed = true
    const file = path.join(directory, "workspace", "Dep299.ets")
    if (fs.realpathSync.native(file) !== fs.realpathSync.native(source.fileName)) throw Error("source mismatch")
    fs.writeFileSync(file, "// changed after original read\n" + source.text)
    fs.writeFileSync(path.join(directory, "cold-provenance-window.json"), JSON.stringify({
      stage: "after-registry-acquire-before-read-provenance", file, threadId,
      originalCompilerText: source.text, currentDiskText: fs.readFileSync(file, "utf8"),
    }))
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const hook = "  adoptCompilerSourceFile(source) {"
      if (source.split(hook).length !== 2) throw Error("one actual source adoption required")
      source = source.replace(hook, hook + "\nglobalThis.__changeAfterColdAcquire(source);")
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
