const fs = require("node:fs")
const path = require("node:path")

// Stop a real probe at its native IPC boundary, never fabricate query results.
if (path.basename(process.argv[1] ?? "") === "query-layer-probe.mjs" && typeof process.send === "function") {
  const controlPath = process.env.ARKTS_QUERY_LAYER_TEST_CONTROL_PATH
  if (!controlPath || !path.basename(path.dirname(controlPath)).startsWith("arkts-prepared-suite-")) {
    throw new Error("query layer interruption requires its private fixture")
  }
  const control = JSON.parse(fs.readFileSync(controlPath, "utf8"))
  if (path.dirname(control.marker) !== path.dirname(controlPath)) throw new Error("invalid private interruption marker")
  const send = process.send
  let completed = 0
  let interrupted = false
  process.send = function (message, ...args) {
    const sent = Reflect.apply(send, this, [message, ...args])
    if (message?.channel === "arkts-query-layer-phase") {
      if (message.phase === "query-complete") completed++
      if (message.phase === "query-start" && completed === 1 && !interrupted) {
        interrupted = true
        fs.writeFileSync(control.marker, JSON.stringify({ pid: process.pid, completed,
          scenarioId: message.scenarioId, targetId: message.targetId }), { flag: "wx" })
        if (control.exitSignal === "SIGKILL") process.kill(process.pid, "SIGKILL")
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 45_000)
      }
    }
    return sent
  }
}
