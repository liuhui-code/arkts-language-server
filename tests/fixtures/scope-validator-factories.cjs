const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("isolated fixture required")
  let factories = 0
  globalThis.__scopeValidatorFactory = (witness, checkpoint) => {
    factories++
    return witness.freshness(checkpoint, "capture")
  }
  globalThis.__scopeValidatorRequest = async (request, run) => {
    const before = factories
    try { return await run() } finally {
      fs.appendFileSync(path.join(directory, "scope-validator-factories.ndjson"),
        JSON.stringify({ id: request.id, method: request.method, factories: factories - before }) + "\n")
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const needle = 'witness.freshness(this.checkpoint, "capture")'
      if (source.split(needle).length !== 5) throw Error("four scope factory sites required")
      source = source.split(needle).join("globalThis.__scopeValidatorFactory(witness,this.checkpoint)")
      const answer = "async function answerRequest(request) {"
      if (source.split(answer).length !== 2) throw Error("unique Worker request required")
      source = source.replace(answer, "async function answerRequest(request) {return globalThis.__scopeValidatorRequest(request,()=>validatorAnswer(request))} async function validatorAnswer(request) {")
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
