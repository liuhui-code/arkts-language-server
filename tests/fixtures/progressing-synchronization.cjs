const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private synchronization fixture required")
  globalThis.__progressingSynchronization = host => {
    const original = host.getScriptSnapshot
    host.getScriptSnapshot = function(file, ...args) {
      if (path.basename(path.dirname(file)) === "graph" && fs.existsSync(path.join(directory, "arm-progressing-sync"))) {
        fs.writeFileSync(path.join(directory, "progressing-sync-entered.json"), JSON.stringify({ file, threadId }))
        if (fs.readFileSync(path.join(directory, "arm-progressing-sync"), "utf8") === "endless") {
          for (;;) {
            host.getCancellationToken?.().isCancellationRequested()
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
          }
        }
        // A bounded delay per real SDK source, not a fabricated heartbeat.
        // The product's normal Host checkpoints run between successive sources.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40)
      }
      return original.call(this, file, ...args)
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "function createLanguageService(host, documentRegistry = createDocumentRegistry(host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames(), host.getCurrentDirectory()), syntaxOnlyOrLanguageServiceMode) {"
      if (source.split(signature).length !== 2) throw Error("one real language service required")
      source = source.replace(signature, signature + "globalThis.__progressingSynchronization(host);")
    }
    return compile.call(this, source, file)
  }
}
