const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  let request, active, seenByPhase
  globalThis.__bindingProofSelected = file => typeof file === "string"
    && file.replace(/\\/g, "/").split("/").at(-1) === "Box.ets"
  globalThis.__bindingProofRequest = async (input, run) => {
    seenByPhase = new Map()
    request = { id: input.id, method: input.method, phases: {} }
    try { return await run() } finally {
      fs.appendFileSync(path.join(directory, "binding-proof-composition.jsonl"), JSON.stringify(request) + "\n")
      request = undefined
    }
  }
  globalThis.__bindingProofCall = (phase, owner, run) => {
    if (!request) return run()
    const before = active
    active = request.phases[phase] ||= { calls: 0, freshness: 0, unique: 0 }
    active.calls++
    if (!seenByPhase.has(phase)) seenByPhase.set(phase, new WeakSet())
    if (!seenByPhase.get(phase).has(owner)) { seenByPhase.get(phase).add(owner); active.unique++ }
    try { return run() } finally { active = before }
  }
  globalThis.__bindingProofFreshness = run => {
    if (active) active.freshness++
    return run()
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const answer = "async function answerRequest(request) {"
      if (source.split(answer).length !== 2) throw Error("unique Worker request required")
      source = source.replace(answer, "async function answerRequest(request) {return globalThis.__bindingProofRequest(request,()=>bindingProofAnswer(request))} async function bindingProofAnswer(request) {")
      source += `\n{
        const resolve = ScopeModuleBindings.prototype.resolve;
        ScopeModuleBindings.prototype.resolve = function(...args) {
          const value = Reflect.apply(resolve,this,args);
          if (globalThis.__bindingProofSelected(value?.file) && !seenBindingProofs.has(value)) {
            seenBindingProofs.add(value); const current = value.current;
            value.current = function(...values) {return globalThis.__bindingProofCall(
              finalizing ? "final" : preparation ? "prepare" : "query",value,()=>Reflect.apply(current,this,values))};
          }
          return value;
        };
        const freshness = LoadedConfigurationWitness.prototype.freshness;
        LoadedConfigurationWitness.prototype.freshness = function(...args) {
          const current = Reflect.apply(freshness,this,args);
          // Observe actual validation, including validators retained by owners.
          return current && function(...values) {
            return globalThis.__bindingProofFreshness(()=>Reflect.apply(current,this,values))
          }
        };
      }\n`;
      source = source.replace("const resolve = ScopeModuleBindings.prototype.resolve;", "const seenBindingProofs = new WeakSet(); const resolve = ScopeModuleBindings.prototype.resolve;")
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
