const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Observe real SDK leaf I/O only inside the explicitly armed private LSP fixture.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR && process.env.ARKLINE_HARMONY_SDK_PATH) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("resident admission observer requires its private fixture")
  }
  const sdk = path.resolve(process.env.ARKLINE_HARMONY_SDK_PATH) + path.sep
  const marker = path.join(directory, "arm-resident-admission-io")
  const output = path.join(directory, "resident-admission-io.jsonl")
  const lstat = fs.lstatSync
  fs.lstatSync = function (filePath, ...rest) {
    const result = lstat.call(this, filePath, ...rest)
    const candidate = path.resolve(String(filePath))
    if (candidate.startsWith(sdk) && candidate.endsWith(".d.ts") && fs.existsSync(marker)) {
      fs.appendFileSync(output, JSON.stringify({ timestamp: Date.now(), threadId, path: candidate }) + "\n")
    }
    return result
  }
}
