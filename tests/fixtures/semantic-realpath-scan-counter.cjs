const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Actual filesystem observation in an explicitly armed private LSP fixture.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR && process.env.ARKLINE_HARMONY_SDK_PATH) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) {
    throw new Error("realpath counter requires its private readiness fixture")
  }
  const sdk = path.resolve(process.env.ARKLINE_HARMONY_SDK_PATH) + path.sep
  const marker = path.join(directory, "arm-realpath-counter")
  const output = path.join(directory, `realpath-scan-${threadId}.json`)
  const state = { pid: process.pid, threadId, sdkLeafStats: 0, retargeted: false }
  const stat = fs.lstatSync
  fs.lstatSync = function (filePath, ...rest) {
    const result = stat.call(this, filePath, ...rest)
    const candidate = path.resolve(String(filePath))
    if (candidate.startsWith(sdk) && candidate.endsWith(".d.ts") && fs.existsSync(marker)) {
      state.sdkLeafStats += 1
      const action = fs.readFileSync(marker, "utf8")
      if (!state.retargeted && state.sdkLeafStats >= 90 && candidate.endsWith("@ohos.scan94.d.ts")
        && action === "retarget") {
        const api = path.join(sdk, "ets", "api")
        fs.renameSync(api, api + "-observed")
        fs.symlinkSync(path.join(directory, "replacement-api"), api, "dir")
        state.retargeted = true
        fs.writeFileSync(output, JSON.stringify(state))
      }
      if (state.sdkLeafStats % 32 === 0) fs.writeFileSync(output, JSON.stringify(state))
    }
    return result
  }
  fs.writeFileSync(output, JSON.stringify(state))
}
