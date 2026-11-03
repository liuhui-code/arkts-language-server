const fs = require("node:fs")
const Module = require("node:module")
const { createHash } = require("node:crypto")
const { isMainThread } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_CLOSURE_WORKER) {
  const compile = Module.prototype._compile
  Module.prototype._compile = function (source, filename) {
    if (filename === process.env.ARKTS_CLOSURE_WORKER) {
      if (createHash("sha256").update(source).digest("hex") !== process.env.ARKTS_CLOSURE_WORKER_SHA256) {
        throw Error("CLOSURE_OBSERVER_ARTIFACT_CHANGED")
      }
      source = fs.readFileSync(process.env.ARKTS_CLOSURE_OBSERVED_WORKER, "utf8")
      if (createHash("sha256").update(source).digest("hex") !== process.env.ARKTS_CLOSURE_OBSERVED_SHA256
        || createHash("sha256").update(fs.readFileSync(process.env.ARKTS_CLOSURE_OBSERVER)).digest("hex") !== process.env.ARKTS_CLOSURE_OBSERVER_SHA256) {
        throw Error("CLOSURE_OBSERVER_DIAGNOSTIC_CHANGED")
      }
    }
    return compile.call(this, source, filename)
  }
}
