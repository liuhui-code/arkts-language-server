const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private package fixture required")
  const original = fs.realpathSync.native
  fs.realpathSync.native = function(file, ...args) {
    try { return Reflect.apply(original, this, [file, ...args]) }
    finally {
      if (typeof file === "string" && file === path.join(directory, "workspace", "shared")) {
        const caller = new Error().stack.split("\n").slice(2, 14)
        // Count actual resolution value loads, separately from independent
        // before/after witness guards and final request identity verification.
        if (caller.some(line => line.includes("LocalPackageResolver.resolve ("))
          && !caller.some(line => /lookupIdentity|lookupPathIdentity/.test(line))) {
          fs.appendFileSync(path.join(directory, "package-root-loads.jsonl"),
            JSON.stringify({ file, threadId, caller }) + "\n")
        }
      }
    }
  }
}
