"use strict"
const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Observe only the real import regex input; preserve the native iterator unchanged.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private import fixture required")
  const output = path.join(directory, "import-specifier-inputs.jsonl")
  const source = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g.source
  const prefix = "// import-specifier-work-bound Graph.ts\n"
  const matchAll = String.prototype.matchAll
  String.prototype.matchAll = function (regex) {
    if (typeof this === "string" && this.startsWith(prefix)
      && regex instanceof RegExp && regex.source === source && regex.flags === "g") {
      fs.appendFileSync(output, JSON.stringify({ pid: process.pid, threadId, codeUnits: this.length }) + "\n")
    }
    return Reflect.apply(matchAll, this, arguments)
  }
}
