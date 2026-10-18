const path = require("node:path")
const cp = require("node:child_process")
const { syncBuiltinESMExports } = require("node:module")

if (process.env.ARKTS_TEST_COLLECTOR_POSTFLIGHT_GIT_ERROR === "1"
  && path.basename(process.argv[1] ?? "") === "run-retained-regression.mjs") {
  const original = cp.execFileSync
  let inventories = 0
  cp.execFileSync = function (command, args, options) {
    if (command === "git" && args[0] === "ls-files" && ++inventories === 2) {
      // A real nonzero external process at the Git inventory boundary.
      return original.call(this, process.execPath, ["-e", "process.exit(42)"], options)
    }
    return original.call(this, command, args, options)
  }
  syncBuiltinESMExports()
}
