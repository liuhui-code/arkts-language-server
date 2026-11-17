const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
if (!require("node:worker_threads").isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR), root = path.join(directory, "workspace")
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private fixture required")
  const physicalRoot = fs.realpathSync.native(root)
  let influenceBuilds = 0, cumulativeGraphRebuilds = 0, graphRebuilds = 0, graphTraversals = 0, leafStats = 0, count = 0, sourceReads = 0, firstRead, firstResolution, callers = {}, statCallers = {}
  const isNoise = file => typeof file === "string" && (file.startsWith(root + path.sep)
    || file.startsWith(physicalRoot + path.sep)) && /Unused\d+\.ts$/.test(file)
  const lstat = fs.lstatSync
  fs.lstatSync = function(file, ...args) { if (isNoise(file)) { leafStats++; if (process.env.ARKTS_TEST_DIRECTORY_LSTAT_STACKS === "1") { const key = new Error().stack.split("\n").slice(2, 7).map(line => line.replace(/ \(.*/, "")).join(" / "); statCallers[key] = (statCallers[key] ?? 0) + 1 } } return Reflect.apply(lstat, this, [file, ...args]) }
  const open = fs.openSync
  fs.openSync = function(file, ...args) {
    if (isNoise(file)) { sourceReads++; firstRead ??= new Error().stack }
    return Reflect.apply(open, this, [file, ...args])
  }
  const native = fs.realpathSync.native
  fs.realpathSync.native = function(file, ...args) {
    if (typeof file === "string" && (file.startsWith(root + path.sep) || file.startsWith(physicalRoot + path.sep)) && /Unused\d+\.ts$/.test(file)) { count++; const stack = new Error().stack; firstResolution ??= stack; const caller = stack.split("\n").slice(2, 5).map(line => line.replace(/ \(.*/, "")).join(" / "); callers[caller] = (callers[caller] ?? 0) + 1 }
    return Reflect.apply(native, this, [file, ...args])
  }
  globalThis.__scopeGraphRebuild = () => { graphRebuilds++; cumulativeGraphRebuilds++ }
  globalThis.__scopeInfluenceBuild = () => { influenceBuilds++ }
  globalThis.__scopeGraphTraversal = () => { graphTraversals++ }
  globalThis.__directoryResolutionCount = async (request, run) => {
    influenceBuilds = 0; graphRebuilds = 0; graphTraversals = 0; leafStats = 0; count = 0; sourceReads = 0; firstRead = undefined; firstResolution = undefined; callers = {}; statCallers = {}
    try { return await run() }
    finally { fs.appendFileSync(path.join(directory, "directory-resolution-count.jsonl"),
      JSON.stringify({ method: request.method, id: request.id, graphRebuilds, cumulativeGraphRebuilds, influenceBuilds, graphTraversals, count, sourceReads, leafStats, firstRead, firstResolution, callers, statCallers }) + "\n") }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "async function answerRequest(request) {"
      if (source.split(signature).length !== 2) throw Error("unique request observation required")
      source = source.replace(signature, "async function answerRequest(request) { return globalThis.__directoryResolutionCount(request, () => observedDirectoryRequest(request)) } async function observedDirectoryRequest(request) {")
      source += `\n{
        const effects = ScopeDependencyGraph.prototype.effects;
        ScopeDependencyGraph.prototype.effects = function(...args) { globalThis.__scopeInfluenceBuild(); return Reflect.apply(effects, this, args) };
        const begin = ScopeModuleBindings.prototype.begin;
        ScopeModuleBindings.prototype.begin = function(...args) { globalThis.__scopeGraphRebuild(); return Reflect.apply(begin, this, args) };
        const current = ScopeDependencyGraph.prototype.currentNodes;
        ScopeDependencyGraph.prototype.currentNodes = function(...args) {
          const nodes = this.nodes, original = Object.getOwnPropertyDescriptor(nodes, "values"), values = nodes.values;
          nodes.values = function(...inner) { globalThis.__scopeGraphTraversal(); return Reflect.apply(values, this, inner) };
          try { return Reflect.apply(current, this, args) }
          finally { if (original) Object.defineProperty(nodes, "values", original); else delete nodes.values }
        };
      }\n`
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
