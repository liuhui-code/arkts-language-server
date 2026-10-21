const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw new Error("private group fixture required")
  globalThis.__observeGroupProgramCheck = roots => fs.appendFileSync(path.join(directory, "group-program-checks.jsonl"),
    JSON.stringify({ pid: process.pid, threadId, roots: roots.map(file => path.resolve(file)) }) + "\n")
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      if (process.env.ARKTS_TEST_GROUP_INPUT_OVERFLOW === "1") {
        const capacity = /var MAX_COMPILER_INPUT_PATHS = \d+;/g
        if ([...source.matchAll(capacity)].length !== 1) throw new Error("expected one compiler input path capacity")
        source = source.replace(capacity, "var MAX_COMPILER_INPUT_PATHS = 1;")
      }
      const marker = "function isProgramUptoDate(program, rootFileNames, newOptions,"
      const start = source.indexOf(marker)
      if (start < 0 || source.indexOf(marker, start + 1) >= 0) throw new Error("expected one compiler Program check")
      const body = source.indexOf("{", start)
      if (body < 0) throw new Error("compiler Program check body missing")
      source = source.slice(0, body + 1) + "\nglobalThis.__observeGroupProgramCheck(rootFileNames);" + source.slice(body + 1)
    }
    return Reflect.apply(compile, this, [source, file])
  }
}
