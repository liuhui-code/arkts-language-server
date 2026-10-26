// Test-only startup boundary; production code is not changed or queried privately.
const fs = require("node:fs"), path = require("node:path"), Module = require("node:module")
const { isMainThread } = require("node:worker_threads")
const gate = process.env.ARKTS_EDITOR_INIT_GATE_DIR
if (isMainThread && gate) {
  process.stdin.on("data", bytes => fs.appendFileSync(path.join(gate, "inbound.bin"), bytes))
}
if (!isMainThread && gate) {
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      fs.writeFileSync(path.join(gate, "entered"), "entered")
      while (!fs.existsSync(path.join(gate, "release"))) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
      }
      if (fs.existsSync(path.join(gate, "fail"))) throw new Error("test: editor initialization failed")
    }
    return compile.call(this, source, file)
  }
}
