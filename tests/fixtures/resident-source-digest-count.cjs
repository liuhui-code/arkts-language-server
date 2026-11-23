const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  let current, hashing = false, serial = 0
  const ids = new WeakMap()
  const noise = file => /Unused\d+\.ts$/.test(file)
  const hash = crypto.createHash
  crypto.createHash = function(...args) {
    if (current && hashing) current.hashes++
    return Reflect.apply(hash, this, args)
  }
  globalThis.__digestRequest = async (request, run) => {
    const row = current = { id: request.id, method: request.method, hashes: 0, calls: 0,
      evidenceReplaced: 0, bytesChanged: 0, sources: new Set() }
    try { return await run() } finally {
      current = undefined
      fs.appendFileSync(path.join(directory, "resident-source-digests.jsonl"), JSON.stringify({
        ...row, sources: [...row.sources] }) + "\n")
    }
  }
  globalThis.__digestCall = (program, file, run) => {
    const previous = hashing
    hashing = !!current && noise(file)
    if (hashing) {
      current.calls++
      const source = program.getSourceFile(file)
      if (!source) throw Error("actual source required")
      if (!ids.has(source)) ids.set(source, ++serial)
      current.sources.add(ids.get(source))
    }
    try { return run() } finally { hashing = previous }
  }
  globalThis.__rememberDigest = (before, after, source) => {
    if (!current || !noise(source.fileName) || !before || before === after) return
    current.evidenceReplaced++
    if (before.text !== after.text) current.bytesChanged++
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const answer = "async function answerRequest(request) {"
      if (source.split(answer).length !== 2) throw Error("unique request boundary required")
      source = source.replace(answer, "async function answerRequest(request) {return globalThis.__digestRequest(request,()=>digestAnswer(request))} async function digestAnswer(request) {")
      source += `\n{
        const digest=TypeScriptResidentReferenceState.prototype.diskSourceDigest;
        TypeScriptResidentReferenceState.prototype.diskSourceDigest=function(program,file,...args) {
          return globalThis.__digestCall(program,file,()=>Reflect.apply(digest,this,[program,file,...args]))
        };
        const remember=CompilerSourceReadFacts.prototype.remember;
        CompilerSourceReadFacts.prototype.remember=function(source,...args) {
          const before=this.text.get(source), result=Reflect.apply(remember,this,[source,...args]);
          globalThis.__rememberDigest(before,this.text.get(source),source);return result
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
