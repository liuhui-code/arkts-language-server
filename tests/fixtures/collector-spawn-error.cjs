const path = require("node:path")
const cp = require("node:child_process")
const { syncBuiltinESMExports } = require("node:module")

// Exercise a real OS spawn failure, not a synthetic ChildProcess event.
const missing = process.env.ARKTS_TEST_COLLECTOR_MISSING_EXECUTABLE
if (missing && path.basename(process.argv[1] ?? "") === "run-retained-regression.mjs") {
  const original = cp.spawn
  cp.spawn = function (command, args, options) {
    return original.call(this, missing, args, options)
  }
  syncBuiltinESMExports()
}
