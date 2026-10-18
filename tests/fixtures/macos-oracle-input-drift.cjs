const fs = require("node:fs")
const path = require("node:path")
const childProcess = require("node:child_process")
const { syncBuiltinESMExports } = require("node:module")

// External file mutation only: every LSP child and compiler response remains real.
if (path.basename(process.argv[1] ?? "") === "run-macos-e2e.mjs"
  && process.env.ARKTS_TEST_WORKFLOW_ORACLE_DRIFT_FILE) {
  const target = path.resolve(process.env.ARKTS_TEST_WORKFLOW_ORACLE_DRIFT_FILE)
  if (!target.split(path.sep).some(part => part.startsWith("arkts-product-sdk-identity-"))
    || !target.endsWith(path.join("workspace", "unrelated", "000", "Unused000000.ets"))) {
    throw new Error("oracle drift probe requires its private generated fixture")
  }
  const spawn = childProcess.spawn
  let changed = false
  childProcess.spawn = function (command, args, ...rest) {
    if (!changed && args?.[0]?.endsWith(path.join("dist", "server.cjs"))) {
      changed = true
      fs.appendFileSync(target, "// changed after oracle admission\n")
    }
    return spawn.call(this, command, args, ...rest)
  }
  syncBuiltinESMExports()
}
