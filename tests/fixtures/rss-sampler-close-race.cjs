const fs = require("node:fs")
const path = require("node:path")
const cp = require("node:child_process")

// Model the late-signal window after the sampler has flushed and is exiting.
// Native Linux evidence is separate; never fabricate RSS or semantic answers.
const marker = process.env.ARKTS_TEST_RSS_CLOSE_RACE
if (marker && path.basename(path.dirname(marker)).startsWith("arkts-prepared-suite-")) {
  const script = path.basename(process.argv[1] ?? "")
  if (script === "sample-process-tree-rss.mjs") {
    process.once("beforeExit", () => {
      process.removeAllListeners("SIGINT")
      fs.writeFileSync(marker, JSON.stringify({ pid: process.pid, phase: "flushed-exiting" }))
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)
    })
  } else if (script === "measure-query-layer.mjs") {
    const kill = cp.ChildProcess.prototype.kill
    cp.ChildProcess.prototype.kill = function(signal, ...args) {
      if (signal === "SIGINT" && this.spawnargs.some(arg =>
        path.basename(arg) === "sample-process-tree-rss.mjs")) {
        const deadline = performance.now() + 5000
        while (!fs.existsSync(marker) && performance.now() < deadline) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
        }
      }
      return kill.call(this, signal, ...args)
    }
  }
}
