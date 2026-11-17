const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private relative fixture required")
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "  relativeCandidate(base, find) {"
      if (source.split(signature).length !== 2) throw Error("unique relative resolution observation required")
      source = source.replace(signature, signature + `
        if (base.includes('/Shared')) globalThis.__relativeScopeState = {
          candidateBytes: this.active?.candidateBytes, entries: this.active?.candidates.size,
          first: this.active?.candidates.keys().next().value
        };
      `)
    }
    return Reflect.apply(compile, this, [source, file])
  }
  const stat = fs.statSync
  fs.statSync = function(file, ...args) {
    try { return Reflect.apply(stat, this, [file, ...args]) }
    finally {
      if (typeof file === "string" && /^Shared(?:_h+)?\.ets$/.test(path.basename(file))) {
        fs.appendFileSync(path.join(directory, "relative-candidate.jsonl"), JSON.stringify({ file, threadId, scope: globalThis.__relativeScopeState }) + "\n")
      }
    }
  }
}
