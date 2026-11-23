const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const arm = path.join(directory, "arm-reference-dispatch.json")
  const output = path.join(directory, "reference-dispatch-events.jsonl")
  let command = false, prepared = false, done = false
  const event = value => fs.appendFileSync(output, JSON.stringify(value) + "\n")
  const mutate = stage => {
    if (!command || done || !fs.existsSync(arm)) return
    const value = JSON.parse(fs.readFileSync(arm, "utf8"))
    if (value.stage !== stage) return
    done = true
    fs.writeFileSync(value.file, "class NewDispatchGlobal {}\n")
    event({ event: "mutated", stage })
  }
  globalThis.__referenceDispatchFinal = () => { if (prepared) mutate("before-dispatch") }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const answer = "async function answerRequest(request) {"
      if (source.split(answer).length !== 2) throw Error("unique answer boundary required")
      source = source.replace(answer, `async function answerRequest(request) {
        globalThis.__dispatchCommand(request.method==='references');
        try{return await dispatchObservedAnswer(request)}finally{globalThis.__dispatchCommand(false)}
      } async function dispatchObservedAnswer(request) {`)
      const boundary = "finalizing = true;"
      if (source.split(boundary).length !== 2) throw Error("unique final boundary required")
      source = source.replace(boundary, boundary + " globalThis.__referenceDispatchFinal();")
      source += `\n{
        globalThis.__dispatchCommand=value=>{commandForDispatch(value)};
        const prepare=SemanticTypeEngineRegistry.prototype.prepareReferenceQuery;
        SemanticTypeEngineRegistry.prototype.prepareReferenceQuery=function(...args){
          const dispatch=Reflect.apply(prepare,this,args); markDispatchPrepared(); return dispatch
        };
        const run=ReferenceVerifierClient.prototype.run;
        ReferenceVerifierClient.prototype.run=async function(input,...args){
          recordDispatch(input.operation);
          const result=await Reflect.apply(run,this,[input,...args]);
          afterDispatch(input.operation); return result
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
  // Compile-time hooks are closure-safe globals: no replacement result or fake worker.
  globalThis.commandForDispatch = value => { command = value; if (value) prepared = false }
  globalThis.markDispatchPrepared = () => { if (command) prepared = true }
  globalThis.recordDispatch = operation => { if (command && fs.existsSync(arm)) event({ event: "dispatched", operation }) }
  globalThis.afterDispatch = operation => { if (operation === "references") mutate("after-verifier") }
}
