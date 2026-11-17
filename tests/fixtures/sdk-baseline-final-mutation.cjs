const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private SDK fixture required")
  globalThis.__sdkBaselineMutation = () => {
    const plan = path.join(directory, "sdk-baseline-mutation.json")
    if (!fs.existsSync(plan)) return
    const { text } = JSON.parse(fs.readFileSync(plan, "utf8"))
    fs.renameSync(plan, plan + ".fired")
    fs.writeFileSync(path.join(directory, "sdk/ets/component/common.d.ts"), text)
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "function createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {"
      if (source.split(signature).length !== 2) throw Error("unique pinned compiler entry required")
      source = source.replace(signature, signature + "globalThis.__sdkBaselineMutation();")
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
