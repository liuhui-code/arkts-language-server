const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  globalThis.__partialInitialObservation = (kind, value) => fs.appendFileSync(
    path.join(directory, "partial-initialization.jsonl"), JSON.stringify({ kind, value, threadId }) + "\n")
  const open = fs.openSync
  const openDirectory = fs.opendirSync
  fs.opendirSync = function(file, ...args) {
    if (typeof file === "string" && /[\\/]workspace[\\/]noise$/.test(file)) {
      globalThis.__partialInitialObservation("noise-directory-open", file)
    }
    return Reflect.apply(openDirectory, this, [file, ...args])
  }
  fs.openSync = function(file, ...args) {
    if (typeof file === "string" && /[\\/]workspace[\\/]noise[\\/]Unused\d+\.ts$/.test(file)) {
      globalThis.__partialInitialObservation("noise-read", file)
    }
    return Reflect.apply(open, this, [file, ...args])
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      for (const [signature, body] of [
        ["function createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {",
          'globalThis.__partialInitialObservation("roots", Array.isArray(rootNamesOrOptions) ? rootNamesOrOptions : rootNamesOrOptions.rootNames);'],
        ["function createLanguageServiceSourceFile(fileName, scriptSnapshot, scriptTargetOrOptions, version2, setNodeParents, scriptKind, option) {",
          'globalThis.__partialInitialObservation("parse", fileName);'],
      ]) {
        if (source.split(signature).length !== 2) throw Error("unique compiler observation required")
        source = source.replace(signature, signature + body)
      }
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
