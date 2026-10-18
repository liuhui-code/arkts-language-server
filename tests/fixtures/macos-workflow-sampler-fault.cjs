const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const childProcess = require("node:child_process")
const { promisify } = require("node:util")
const { syncBuiltinESMExports } = require("node:module")

// Execute a genuinely failing native ps command; never substitute its output.
if (path.basename(process.argv[1] ?? "") === "run-macos-e2e.mjs"
  && process.env.ARKTS_TEST_WORKFLOW_SAMPLER_FAULT_FILE) {
  const record = path.resolve(process.env.ARKTS_TEST_WORKFLOW_SAMPLER_FAULT_FILE)
  if (!record.split(path.sep).some(part => part.startsWith("arkts-product-sdk-identity-"))
    || path.basename(record) !== "sampler-fault.json") throw new Error("sampler probe requires its private fixture")
  let server, cacheRoot, metricsPath, calls = 0
  const spawn = childProcess.spawn
  childProcess.spawn = function (command, args, options, ...rest) {
    if (args?.[0]?.endsWith(path.join("dist", "server.cjs"))) {
      cacheRoot = path.dirname(options?.env?.ARKTS_INDEX_CACHE_DIR ?? "")
      metricsPath = options?.env?.ARKTS_MEMORY_METRICS_FILE
      if (path.dirname(cacheRoot) !== os.tmpdir() || !path.basename(cacheRoot).startsWith("arkts-macos-e2e-")
        || metricsPath !== path.join(os.tmpdir(), `arkts-macos-metrics-${process.pid}-cold-0.jsonl`)) {
        throw new Error("sampler probe process is outside its private cold workflow")
      }
      server = spawn.call(this, command, args, options, ...rest)
      return server
    }
    return spawn.call(this, command, args, options, ...rest)
  }
  const faultyArgs = (command, args) => {
    if (command !== "/bin/ps" || args?.[0] !== "-axo" || ++calls !== 3) return args
    const failed = [...args, "--arkts-sampler-fault"]
    fs.writeFileSync(record, JSON.stringify({ targetPid: server.pid, command, args: failed, calls }), { flag: "wx" })
    return failed
  }
  const execFile = childProcess.execFile
  childProcess.execFile = function (command, args, ...rest) {
    return execFile.call(this, command, faultyArgs(command, args), ...rest)
  }
  childProcess.execFile[promisify.custom] = (command, args, ...rest) =>
    execFile[promisify.custom](command, faultyArgs(command, args), ...rest)
  process.once("exit", () => {
    if (!server) return
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL")
    if (fs.existsSync(metricsPath)) fs.renameSync(metricsPath, path.join(path.dirname(record), "sampler-native-metrics.jsonl"))
    fs.rmSync(cacheRoot, { recursive: true, force: true })
  })
  syncBuiltinESMExports()
}
