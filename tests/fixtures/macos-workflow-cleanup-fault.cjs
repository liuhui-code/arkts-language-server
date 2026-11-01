const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { syncBuiltinESMExports } = require("node:module")

if (path.basename(process.argv[1] ?? "") === "run-macos-e2e.mjs"
  && process.env.ARKTS_TEST_WORKFLOW_CLEANUP_FAULT_FILE) {
  const record = path.resolve(process.env.ARKTS_TEST_WORKFLOW_CLEANUP_FAULT_FILE)
  if (!record.split(path.sep).some(part => part.startsWith("arkts-product-sdk-identity-"))
    || path.basename(record) !== "cleanup-fault.json") throw new Error("cleanup probe requires its private fixture")
  const fault = (directory, options) => {
    const candidate = path.resolve(String(directory))
    if (path.dirname(candidate) !== path.resolve(os.tmpdir())
      || !path.basename(candidate).startsWith("arkts-macos-e2e-")) return
    fs.writeFileSync(record, JSON.stringify({ directory: candidate, options }))
    const error = new Error("private workflow cleanup ENOTEMPTY")
    error.code = "ENOTEMPTY"
    throw error
  }
  const remove = fs.rmSync
  fs.rmSync = function (directory, options) {
    fault(directory, options)
    return remove.call(this, directory, options)
  }
  const removeAsync = fs.promises.rm
  fs.promises.rm = async function (directory, options) {
    fault(directory, options)
    return removeAsync.call(this, directory, options)
  }
  syncBuiltinESMExports()
}
