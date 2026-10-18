const path = require("node:path")
const fs = require("node:fs")
const cp = require("node:child_process")
const { syncBuiltinESMExports } = require("node:module")

// Fault only the real server's OS exit inside its private benchmark process segment.
if (path.basename(process.argv[1] ?? "") === "server.cjs"
  && process.env.ARKTS_TEST_PREPARED_EXIT_SEGMENT) {
  const segment = process.env.ARKTS_TEST_PREPARED_EXIT_SEGMENT
  const parts = (process.env.ARKTS_INDEX_CACHE_DIR ?? "").split(path.sep)
  if (!/^process-\d+$/u.test(segment) || !parts.some(part => part.startsWith("arkts-prepared-query-"))) {
    throw new Error("restart exit probe requires a private prepared-suite process segment")
  }
  if (parts.includes(segment)) process.once("exit", () => { process.exitCode = 17 })
}

if (path.basename(process.argv[1] ?? "") === "replay-references.mjs"
  && process.env.ARKTS_TEST_PREPARED_POSTFLIGHT_RAW) {
  const raw = process.env.ARKTS_TEST_PREPARED_POSTFLIGHT_RAW
  if (!path.basename(path.dirname(raw)).startsWith("arkts-prepared-suite-")
    || !path.basename(raw).endsWith(".process-1.json.rss.jsonl")) {
    throw new Error("postflight probe requires a private prepared-suite raw artifact")
  }
  const original = cp.execFileSync
  cp.execFileSync = function (command, args, options) {
    if (command === "git" && args.includes("ls-files") && fs.existsSync(raw)) {
      return original.call(this, process.execPath, ["-e", "process.exit(42)"], options)
    }
    return original.call(this, command, args, options)
  }
  syncBuiltinESMExports()
}
