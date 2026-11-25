const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR), root = path.join(directory, "workspace")
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const physical = fs.realpathSync.native(root)
  const normalize = file => typeof file === "string" && file.startsWith(root + path.sep)
    ? physical + file.slice(root.length) : file
  let active, sources = new Map()
  const source = () => active && /Unused\d+\.ts$/.test(active) ? active : undefined
  const lstat = fs.lstatSync, realpath = fs.realpathSync.native
  fs.lstatSync = function(file, ...args) {
    const key = source()
    if (key && normalize(file) === key) sources.get(key).lstat++
    return Reflect.apply(lstat, this, [file, ...args])
  }
  fs.realpathSync.native = function(file, ...args) {
    const key = source()
    if (key && normalize(file) === key) sources.get(key).realpath++
    return Reflect.apply(realpath, this, [file, ...args])
  }
  globalThis.__bindingContaining = (owner, file, run) => {
    const before = active
    active = normalize(file)
    if (source() && !sources.has(active)) {
      const origin = owner.sourceOrigin?.(file)
      sources.set(active, { lstat: 0, realpath: 0, qualified: origin?.file === file
        && origin.root === owner.env.boundary.workspacePhysicalRoot })
    }
    try { return run() } finally { active = before }
  }
  globalThis.__bindingContainingRequest = async (request, run) => {
    sources = new Map()
    try { return await run() } finally {
      fs.appendFileSync(path.join(directory, "binding-containing-inputs.jsonl"), JSON.stringify({
        id: request.id, method: request.method, sources: [...sources.values()] }) + "\n")
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const answer = "async function answerRequest(request) {"
      if (source.split(answer).length !== 2) throw Error("unique Worker request required")
      source = source.replace(answer, "async function answerRequest(request) {return globalThis.__bindingContainingRequest(request,()=>bindingAnswer(request))} async function bindingAnswer(request) {")
      source += `\n{
        const resolve = ScopeModuleBindings.prototype.resolve;
        ScopeModuleBindings.prototype.resolve = function(name, file, ...args) {
          return globalThis.__bindingContaining(this,file,()=>Reflect.apply(resolve,this,[name,file,...args]))
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
