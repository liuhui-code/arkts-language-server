const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { isMainThread, parentPort } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private navigation fixture required")
  let active
  parentPort.on("message", request => {
    if (request?.method === "define") active = { id: request.id, counts: {} }
  })
  globalThis.__navigationValidationLookup = (file, mode) => {
    if (!active) return
    const key = JSON.stringify([file, mode])
    active.counts[key] = (active.counts[key] || 0) + 1
  }
  globalThis.__navigationValidationAfterLookup = result => {
    const armed = path.join(directory, "navigation-mutate-after-lookup.json")
    if (fs.existsSync(armed)) {
      const input = JSON.parse(fs.readFileSync(armed, "utf8"))
      if (!path.resolve(input.file).startsWith(path.resolve(directory, "sdk") + path.sep)) throw Error("only private SDK input")
      fs.unlinkSync(armed)
      fs.writeFileSync(input.file, input.text)
      fs.writeFileSync(path.join(directory, "navigation-mutation-applied.json"), JSON.stringify({ file: input.file }))
    }
    return result
  }
  const post = parentPort.postMessage.bind(parentPort)
  parentPort.postMessage = (message, ...args) => {
    if (active && message?.id === active.id && typeof message.ok === "boolean") {
      fs.appendFileSync(path.join(directory, "navigation-validation.ndjson"), JSON.stringify(active) + "\n")
      active = undefined
    }
    return post(message, ...args)
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const signature = "function lookupIdentity(filePath, directoryIdentityOnly = false) {"
      if (source.split(signature).length !== 2) throw Error("one real input-identity observer required")
      source = source.replace(signature, signature +
        'globalThis.__navigationValidationLookup(filePath, directoryIdentityOnly);')
      const lookup = "return ts_GoToDefinition_exports.getDefinitionAtPosition(program, getValidSourceFile(fileName), position, searchOtherFilesOnly, stopAtAlias);"
      if (source.split(lookup).length !== 2) throw Error("one actual compiler definition return required")
      source = source.replace(lookup, "return globalThis.__navigationValidationAfterLookup(" + lookup.slice(7, -1) + ");")
    }
    return compile.call(this, source, file)
  }
}
