const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { isMainThread } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private scope identity fixture required")
  const observe = (file, kind) => {
    if (typeof file === "string" && file.endsWith("/LateTarget.ts")
      && fs.existsSync(path.join(directory, "arm-scope-identity-count"))) {
      fs.appendFileSync(path.join(directory, "scope-input-identities.jsonl"), JSON.stringify({ file, kind }) + "\n")
    }
  }
  globalThis.__scopeInputIdentity = file => observe(file, "source-identity")
  const original = fs.realpathSync.native
  fs.realpathSync.native = function(file, ...args) {
    observe(file, "native-realpath")
    return Reflect.apply(original, this, [file, ...args])
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const headers = [...source.matchAll(/function configurationSourceIdentity\([^)]*\) \{/g)]
      if (headers.length !== 1) throw Error("one actual regular-source configuration identity observer required")
      const header = headers[0][0]
      source = source.replace(header, header + "globalThis.__scopeInputIdentity(arguments[0]);")
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
