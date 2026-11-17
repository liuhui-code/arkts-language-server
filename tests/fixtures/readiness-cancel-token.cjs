// Test-only rendezvous at a real compiler CancellationToken callback. No product
// timeout or algorithm changes: the original token owns cancellation and throw.
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")
const { isMainThread } = require("node:worker_threads")
if (!isMainThread && process.env.ARKTS_TEST_READY_CANCEL_GATE) {
  const gate = process.env.ARKTS_TEST_READY_CANCEL_GATE
  globalThis.__arktsReadinessCancelToken = (source, token) => {
    if (!token || path.basename(source.fileName) !== "Heavy.ets" || !fs.existsSync(gate + ".armed")) return token
    let entered = false
    const enter = () => {
      if (entered) return
      entered = true
      fs.writeFileSync(gate + ".entering", JSON.stringify({ source: source.fileName,
        qualification: "CONTROLLED_REAL_COMPILER_TOKEN_CALLBACK", pid: process.pid }))
      fs.renameSync(gate + ".entering", gate + ".entered")
      const deadline = performance.now() + 20_000
      const cell = new Int32Array(new SharedArrayBuffer(4))
      while (!token.isCancellationRequested() && !fs.existsSync(gate + ".release")
        && performance.now() < deadline) Atomics.wait(cell, 0, 0, 2)
    }
    return {
      isCancellationRequested() { enter(); return token.isCancellationRequested() },
      throwIfCancellationRequested() { enter(); return token.throwIfCancellationRequested() },
    }
  }
  const compile = Module.prototype._compile
  Module.prototype._compile = function(source, file) {
    if (path.basename(file) === "semantic-worker.cjs") {
      const declaration = /function checkInput\(program, (\w+), (\w+), (\w+)\) \{/g
      const matches = [...source.matchAll(declaration)]
      if (matches.length !== 1) throw Error("readiness compiler-check test hook must be unique")
      const [signature, input, token] = matches[0]
      source = source.replace(signature, signature
        + ` ${token} = globalThis.__arktsReadinessCancelToken(${input}, ${token});`)
    }
    return compile.call(this, source, file)
  }
}
