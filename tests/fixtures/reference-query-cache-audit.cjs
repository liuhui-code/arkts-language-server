// Public-session observation only: count real Program calls and Worker creation.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const wt = require("node:worker_threads")
const directory = process.env.ARKTS_LSP_LOG_DIR && path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if (!directory || !path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private cache audit fixture required")
const emit = data => fs.appendFileSync(path.join(directory, "reference-query-work.ndjson"),
  JSON.stringify({ threadId: wt.threadId, ...data }) + "\n")
const Worker = wt.Worker
wt.Worker = class extends Worker {
  constructor(file, options) { super(file, options); emit({ event: "worker-created", worker: this.threadId, file: String(file) }) }
}
globalThis.__referenceCacheProgramCreated = () => emit({ event: "program-created" })
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  if (["semantic-worker.cjs", "reference-verifier-worker.cjs", "diagnostic-verifier-worker.cjs"].includes(path.basename(file))) {
    const signature = "function __arktsObserved_createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {"
    if (source.split(signature).length !== 2) throw Error("actual compiler Program audit seam changed")
    source = source.replace(signature, signature + "globalThis.__referenceCacheProgramCreated();")
  }
  return compile.call(this, source, file)
}
