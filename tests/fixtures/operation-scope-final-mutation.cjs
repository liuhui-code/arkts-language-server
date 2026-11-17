const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private scope fixture required")
  globalThis.__operationScopeMutation = () => {
    const plan = path.join(directory, "operation-scope-mutation.json")
    if (!fs.existsSync(plan)) return
    const input = JSON.parse(fs.readFileSync(plan, "utf8"))
    const root = path.join(directory, "workspace"), file = path.resolve(root, input.file)
    if (!file.startsWith(root + path.sep)) throw Error("private workspace mutation required")
    fs.renameSync(plan, plan + ".fired")
    fs.writeFileSync(file, input.text)
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "function createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {"
      if (source.split(signature).length !== 2) throw Error("unique pinned compiler query entry required")
      source = source.replace(signature, signature + "globalThis.__operationScopeMutation();")
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
