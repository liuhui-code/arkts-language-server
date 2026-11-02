const fs = require("node:fs")
const path = require("node:path")
const cp = require("node:child_process")

// Model the late-signal window after the sampler has flushed and is exiting.
// Native Linux evidence is separate; never fabricate RSS or semantic answers.
const marker = process.env.ARKTS_TEST_RSS_CLOSE_RACE ?? process.env.RSS_TEST_CLOSE_RACE
if (marker && ["arkts-prepared-suite-", "arkts-cancel-fixture-"]
  .some(prefix => path.basename(path.dirname(marker)).startsWith(prefix))) {
  const script = path.basename(process.argv[1] ?? "")
  if (script === "sample-process-tree-rss.mjs") {
    process.once("beforeExit", () => {
      process.removeAllListeners("SIGINT")
      const outcome = process.env.RSS_TEST_CLOSE_OUTCOME
      if (outcome === "hang") process.removeAllListeners("SIGTERM")
      if (outcome === "error") process.exitCode = 9
      fs.writeFileSync(marker, JSON.stringify({ pid: process.pid, phase: "flushed-exiting" }))
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, outcome === "hang" ? 10_000 : outcome === "interval" ? 100 : 1000)
    })
  } else if (["measure-query-layer.mjs", "replay-settings-cancel-control.mjs"].includes(script)) {
    const kill = cp.ChildProcess.prototype.kill
    cp.ChildProcess.prototype.kill = function(signal, ...args) {
      if (this.spawnargs.some(arg => path.basename(arg) === "sample-process-tree-rss.mjs")) {
        fs.appendFileSync(`${marker}.signals`, `${signal}\n`)
      }
      if (signal === "SIGINT" && this.spawnargs.some(arg =>
        path.basename(arg) === "sample-process-tree-rss.mjs")) {
        const deadline = performance.now() + 5000
        while (!fs.existsSync(marker) && performance.now() < deadline) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
        }
      }
      if (this.spawnargs.some(arg => path.basename(arg) === "sample-process-tree-rss.mjs")) {
        fs.appendFileSync(`${marker}.signal-times`, `${JSON.stringify({
          signal, monotonicNs: process.hrtime.bigint().toString(),
        })}\n`)
      }
      return kill.call(this, signal, ...args)
    }
  }
}
