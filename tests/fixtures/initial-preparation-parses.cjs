const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw new Error("private initialization fixture required")
  globalThis.__observeInitialParse = file => fs.appendFileSync(path.join(directory, "initial-parses.jsonl"),
    JSON.stringify({ pid: process.pid, threadId, file: path.resolve(file) }) + "\n")
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, file) {
    if (["semantic-worker.cjs", "reference-verifier-worker.cjs"].includes(path.basename(file))) {
      if (process.env.ARKTS_TEST_CASE_SENSITIVE_FS === "1") {
        const probe = "const useCaseSensitiveFileNames = isFileSystemCaseSensitive();"
        if (!source.includes(probe)) throw new Error("case sensitivity probe not found")
        source = source.replace(probe, "const useCaseSensitiveFileNames = true;")
      }
      let count = 0
      source = source.replace(/(function createLanguageServiceSourceFile\(fileName[^\n]*\) \{)/g,
        match => { count++; return match + "\nglobalThis.__observeInitialParse(fileName);" })
      if (count !== 1) throw new Error(`expected one compiler parser, got ${count}`)
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
