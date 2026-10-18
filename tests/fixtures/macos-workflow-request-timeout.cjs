const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const childProcess = require("node:child_process")
const { syncBuiltinESMExports } = require("node:module")

// Real SIGSTOP until the original request deadline; shutdown resumes the same child.
if (path.basename(process.argv[1] ?? "") === "run-macos-e2e.mjs"
  && process.env.ARKTS_TEST_WORKFLOW_TIMED_REQUEST_FILE) {
  const record = path.resolve(process.env.ARKTS_TEST_WORKFLOW_TIMED_REQUEST_FILE)
  if (!record.split(path.sep).some(part => part.startsWith("arkts-product-sdk-identity-"))
    || path.basename(record) !== "timed-request.json") throw new Error("timeout probe requires its private fixture")
  const spawn = childProcess.spawn
  let server, cacheRoot, metricsPath, paused = false, armed = true
  childProcess.spawn = function (command, args, options, ...rest) {
    const privateServer = armed && args?.[0]?.endsWith(path.join("dist", "server.cjs"))
    if (privateServer) {
      cacheRoot = path.dirname(options?.env?.ARKTS_INDEX_CACHE_DIR ?? "")
      metricsPath = options?.env?.ARKTS_MEMORY_METRICS_FILE
      if (path.dirname(cacheRoot) !== os.tmpdir() || !path.basename(cacheRoot).startsWith("arkts-macos-e2e-")
        || metricsPath !== path.join(os.tmpdir(), `arkts-macos-metrics-${process.pid}-cold-0.jsonl`)) {
        throw new Error("timeout probe process is outside its private cold workflow")
      }
    }
    const child = spawn.call(this, command, args, options, ...rest)
    if (privateServer) {
      server = child
      const write = child.stdin.write
      child.stdin.write = function (chunk, ...rest) {
        const written = write.call(this, chunk, ...rest)
        if (!Buffer.isBuffer(chunk)) return written
        const request = JSON.parse(chunk.toString("utf8"))
        if (armed && request.method === "textDocument/completion") {
          armed = false
          if (child.exitCode !== null || child.signalCode !== null || !child.kill("SIGSTOP")) {
            throw new Error("private timeout child was not live")
          }
          paused = true
          const state = childProcess.execFileSync("/bin/ps", ["-p", String(child.pid), "-o", "stat="], { encoding: "utf8" }).trim()
          if (!state.includes("T")) throw new Error("private timeout child was not actually stopped")
          fs.writeFileSync(record, JSON.stringify({ pid: child.pid, request, nativeStoppedState: state }), { flag: "wx" })
        } else if (paused && request.method === "shutdown") {
          if (!child.kill("SIGCONT")) throw new Error("private timeout child could not resume")
          paused = false
        }
        return written
      }
    }
    return child
  }
  process.once("exit", () => {
    if (!server) return
    if (server.exitCode === null && server.signalCode === null) {
      if (paused) server.kill("SIGCONT")
      server.kill("SIGKILL")
    }
    if (fs.existsSync(metricsPath)) fs.renameSync(metricsPath, path.join(path.dirname(record), "timeout-native-metrics.jsonl"))
    fs.rmSync(cacheRoot, { recursive: true, force: true })
  })
  syncBuiltinESMExports()
}
