const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread) {
  const out = process.env.ARKTS_LSP_LOG_DIR && path.join(path.dirname(process.env.ARKTS_LSP_LOG_DIR), "resident-final.jsonl")
  let samples
  const lstat = fs.lstatSync
  fs.lstatSync = function(file, ...args) {
    if (samples && typeof file === "string" && /Unused\d+\.ts$/.test(file)) samples.set(file, (samples.get(file) ?? 0) + 1)
    return Reflect.apply(lstat, this, [file, ...args])
  }
  globalThis.__residentFinal = run => {
    const previous = samples
    samples = new Map()
    try { return run() } finally {
      if (out) fs.appendFileSync(out, JSON.stringify({ files: samples.size, calls: [...samples.values()].reduce((a,b)=>a+b,0) }) + "\n")
      samples = previous
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") source += `\n{
      const original = TypeScriptResidentReferenceState.prototype.diskInputsCurrent;
      TypeScriptResidentReferenceState.prototype.diskInputsCurrent = function(...args) {
        const run = ()=>Reflect.apply(original,this,args);
        return finalizing ? globalThis.__residentFinal(run) : run()
      };
    }\n`
    return Reflect.apply(compile, this, [source, file])
  }
}
