const fs = require("node:fs")
const path = require("node:path")
const { isMainThread } = require("node:worker_threads")

// Widen the real create-before-write window; the public witness must appear complete.
if (!isMainThread) {
  const write = fs.writeFileSync
  fs.writeFileSync = function (file, data, options) {
    const name = path.basename(String(file))
    if (name.startsWith("resident-input-proof-entered.json")
      && path.basename(path.dirname(String(file))).startsWith("arkts-prepared-suite-")) {
      write.call(this, file, "", options)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)
      return write.call(this, file, data, typeof options === "object"
        ? { ...options, flag: "w" } : { encoding: options, flag: "w" })
    }
    return write.call(this, file, data, options)
  }
}
