// Observe real compiler construction during a public child-LSP transcript only.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { threadId } = require("node:worker_threads")
const directory = process.env.ARKTS_LSP_LOG_DIR && path.dirname(process.env.ARKTS_LSP_LOG_DIR)
if (!directory || !path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
const emit = data => fs.appendFileSync(path.join(directory, "partial-reference-work.ndjson"),
  JSON.stringify({ threadId, ...data }) + "\n")
globalThis.__partialReferenceService = runtime => emit({ event: "service-created", runtime })
globalThis.__partialReferenceProgram = (runtime, roots, old) => emit({ event: "program-created", runtime,
  oldProgramProvided: Boolean(Array.isArray(roots) ? old : roots.oldProgram) })
const compile = Module.prototype._compile
Module.prototype._compile = function(source, file) {
  const runtime = path.basename(file)
  if (["semantic-worker.cjs", "reference-verifier-worker.cjs", "diagnostic-verifier-worker.cjs"].includes(runtime)) {
    const hooks = [
      ["function createLanguageService(host, documentRegistry = createDocumentRegistry(host.useCaseSensitiveFileNames && host.useCaseSensitiveFileNames(), host.getCurrentDirectory()), syntaxOnlyOrLanguageServiceMode) {",
        `globalThis.__partialReferenceService(${JSON.stringify(runtime)});`],
      ["function __arktsObserved_createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {",
        `globalThis.__partialReferenceProgram(${JSON.stringify(runtime)},rootNamesOrOptions,_oldProgram);`],
    ]
    for (const [from, addition] of hooks) {
      if (source.split(from).length !== 2) throw Error("actual compiler audit seam changed: " + from)
      source = source.replace(from, from + addition)
    }
  }
  return compile.call(this, source, file)
}
