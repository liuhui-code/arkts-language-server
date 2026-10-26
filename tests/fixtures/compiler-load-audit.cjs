// Observe actual compiler initialization, never private server state.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { threadId } = require("node:worker_threads")
require("./worker-lifecycle-audit.cjs")
const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
globalThis.__compilerLoadAudit = () => fs.appendFileSync(path.join(directory, "compiler-load.ndjson"),
  JSON.stringify({ event: "compiler-initialized", threadId }) + "\n")
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  if (["server.cjs", "semantic-worker.cjs"].includes(path.basename(file))) {
    const needle = "function createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {"
    const count = source.split(needle).length - 1
    if (count > 1 || path.basename(file) === "semantic-worker.cjs" && count !== 1) throw Error("compiler initialization seam changed")
    if (count) source = source.replace(needle, "globalThis.__compilerLoadAudit(); " + needle)
  }
  return compile.call(this, source, file)
}
