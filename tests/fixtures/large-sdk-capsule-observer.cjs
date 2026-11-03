const fs = require("node:fs")
const path = require("node:path")
const { threadId } = require("node:worker_threads")

// Observe the existing immutable capture result, without calling its proof,
// loading inputs or changing compiler behavior. No private object is retained.
const originalFreeze = Object.freeze
Object.freeze = function (value) {
  const result = originalFreeze(value)
  if (value && typeof value.factCount === "number" && typeof value.current === "function") {
    const caller = new Error().stack ?? ""
    if (caller.includes("captureConfigurationBeforeSourceReset")) {
      const logDirectory = process.env.ARKTS_LSP_LOG_DIR
      if (logDirectory) fs.appendFileSync(path.join(path.dirname(logDirectory), "large-sdk-capsules.ndjson"),
        JSON.stringify({ pid: process.pid, threadId, factCount: value.factCount, accountedBytes: value.accountedBytes, caller }) + "\n")
    }
  }
  return result
}
