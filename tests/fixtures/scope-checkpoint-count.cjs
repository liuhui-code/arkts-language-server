const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const threads = require("node:worker_threads")
const directory = process.env.ARKTS_LSP_LOG_DIR && path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if (directory && path.basename(directory).startsWith("arkts-semantic-ready-")) {
  const root = path.join(directory, "workspace"), arm = path.join(directory, "arm-scope-checkpoint")
  const compile = Module.prototype._compile
  if (threads.isMainThread) {
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "server.cjs") {
        if (source.split("function cancelSemanticWorkerRequest(").length !== 2) throw Error("unique cancellation setter required")
        source += `\n{const original=cancelSemanticWorkerRequest;cancelSemanticWorkerRequest=function(...args){const result=Reflect.apply(original,this,args);if(require('node:fs').existsSync(${JSON.stringify(arm)}))require('node:fs').writeFileSync(${JSON.stringify(path.join(directory, "scope-checkpoint-cancel-observed"))},String(result));return result}}\n`
      }
      return Reflect.apply(compile, this, [source, file])
    }
  } else {
    let rootOverlayLookups = 0, directCheckpoints = 0, armedCheckpoints = 0
    const checkpoint = () => {
      if (!fs.existsSync(arm) || fs.existsSync(path.join(directory, "scope-checkpoint-paused")) || ++armedCheckpoints !== 100) return
      fs.writeFileSync(path.join(directory, "scope-checkpoint-paused"), "actual checkpoint reached")
      const until = Date.now() + 5000, cell = new Int32Array(new SharedArrayBuffer(4))
      while (!fs.existsSync(path.join(directory, "resume-scope-checkpoint"))) {
        if (Date.now() > until) throw Error("controlled checkpoint cancellation was not acknowledged")
        Atomics.wait(cell, 0, 0, 5)
      }
    }
    globalThis.__scopeCheckpointCounters = {
      overlay(file) { if (path.resolve(file) === root) { rootOverlayLookups++; checkpoint() } },
      checkpoint() { directCheckpoints++; checkpoint() },
    }
    Module.prototype._compile = function(source, file) {
      if (path.basename(file) === "semantic-worker.cjs") {
        if (source.split("var SemanticDocumentStore = class").length !== 2) throw Error("unique store boundary required")
        source += `\n{const original=SemanticDocumentStore.prototype.overlayFor;SemanticDocumentStore.prototype.overlayFor=function(file){globalThis.__scopeCheckpointCounters.overlay(file);return Reflect.apply(original,this,[file])};const check=SemanticDocumentStore.prototype.checkpoint;if(check)SemanticDocumentStore.prototype.checkpoint=function(){globalThis.__scopeCheckpointCounters.checkpoint();return Reflect.apply(check,this,[])}}\n`
      }
      return Reflect.apply(compile, this, [source, file])
    }
    const post = threads.parentPort.postMessage
    threads.parentPort.postMessage = function(message, ...args) {
      if (message?.protocol && typeof message.id === "number" && typeof message.ok === "boolean") {
        fs.writeFileSync(path.join(directory, "scope-checkpoint-count.json"), JSON.stringify({ rootOverlayLookups, directCheckpoints }))
      }
      return Reflect.apply(post, this, [message, ...args])
    }
  }
}
