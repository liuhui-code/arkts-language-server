const fs = require("node:fs")
const path = require("node:path")
const { performance } = require("node:perf_hooks")

// Only the collector's timer callback is early; clocks, server and sampler stay real.
if (path.basename(process.argv[1] ?? "") === "replay-references.mjs") {
  const requestedMs = Number(process.env.ARKTS_TEST_OBSERVATION_TIMER_MS)
  const receipt = process.env.ARKTS_TEST_OBSERVATION_TIMER_RECEIPT
  const original = globalThis.setTimeout
  let injected = false
  globalThis.setTimeout = function (callback, delay, ...args) {
    if (!injected && receipt && requestedMs > 0 && typeof callback === "function"
      && Math.ceil(Number(delay)) === requestedMs) {
      injected = true
      const started = performance.now()
      return original(function (...values) {
        fs.writeFileSync(receipt, JSON.stringify({ requestedMs: delay,
          actualScheduledMs: 1, callbackElapsedMs: performance.now() - started }))
        return Reflect.apply(callback, this, values)
      }, 1, ...args)
    }
    return Reflect.apply(original, this, [callback, delay, ...args])
  }
}
