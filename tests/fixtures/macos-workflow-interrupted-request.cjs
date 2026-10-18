const fs = require("node:fs")
const path = require("node:path")
const childProcess = require("node:child_process")
const { syncBuiltinESMExports } = require("node:module")

// Observe the actual outgoing frame, then stop only this live private child.
if (path.basename(process.argv[1] ?? "") === "run-macos-e2e.mjs"
  && process.env.ARKTS_TEST_WORKFLOW_INTERRUPTED_REQUEST_FILE) {
  const record = path.resolve(process.env.ARKTS_TEST_WORKFLOW_INTERRUPTED_REQUEST_FILE)
  if (!record.split(path.sep).some(part => part.startsWith("arkts-product-sdk-identity-"))
    || path.basename(record) !== "interrupted-request.json") {
    throw new Error("interrupted request probe requires its private fixture")
  }
  const spawn = childProcess.spawn
  const interruptedMethod = process.env.ARKTS_TEST_WORKFLOW_INTERRUPTED_METHOD ?? "textDocument/completion"
  if (!["initialize", "textDocument/completion"].includes(interruptedMethod)) throw new Error("unknown private interrupted method")
  let armed = true
  childProcess.spawn = function (command, args, options, ...rest) {
    const child = spawn.call(this, command, args, options, ...rest)
    if (armed && args?.[0]?.endsWith(path.join("dist", "server.cjs"))) {
      if (!options?.env?.ARKTS_INDEX_CACHE_DIR?.split(path.sep)
        .some(part => part.startsWith("arkts-macos-e2e-"))) throw new Error("interruption cache is not private")
      const write = child.stdin.write
      child.stdin.write = function (chunk, ...writeArgs) {
        const written = write.call(this, chunk, ...writeArgs)
        if (armed && Buffer.isBuffer(chunk)) {
          const request = JSON.parse(chunk.toString("utf8"))
          if (request.method === interruptedMethod) {
            armed = false
            fs.writeFileSync(record, JSON.stringify({ pid: child.pid, request }), { flag: "wx" })
            if (child.exitCode !== null || child.signalCode !== null || !child.kill("SIGKILL")) {
              throw new Error("private request child was not live when interrupted")
            }
          }
        }
        return written
      }
    }
    return child
  }
  syncBuiltinESMExports()
}
