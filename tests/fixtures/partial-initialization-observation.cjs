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
    const directory = Reflect.apply(openDirectory, this, [file, ...args])
    const first = process.env.ARKTS_TEST_MEMBERSHIP_FIRST_SOURCE
    if (first && typeof file === "string" && path.basename(file) === "workspace") {
      // Directory order is unspecified: exercise both an available and an unavailable first member.
      const entries = []
      for (let entry; (entry = directory.readSync()) !== null;) entries.push(entry)
      if (!entries.some(entry => entry.name === first)) throw Error("required membership-order fixture missing")
      entries.sort((a, b) => Number(b.name === first) - Number(a.name === first))
      directory.readSync = () => entries.shift() ?? null
      globalThis.__partialInitialObservation("forced-first-source", first)
    }
    return directory
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
