const fs = require("node:fs")
const path = require("node:path")
const { isMainThread } = require("node:worker_threads")

// A real, split filesystem write exposes publication races; GC bytes are unchanged.
if (!isMainThread) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR ?? "")
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("slow GC receipt write requires its private fixture")
  }
  const write = fs.writeFileSync
  fs.writeFileSync = function (file, data, options) {
    if (typeof file !== "string" || !path.basename(file).startsWith("resident-gc-result.json")) {
      return Reflect.apply(write, this, [file, data, options])
    }
    const bytes = Buffer.from(data)
    const middle = Math.floor(bytes.length / 2)
    const fd = fs.openSync(file, options?.flag ?? "w")
    try {
      write(fd, bytes.subarray(0, middle))
      write(path.join(directory, "resident-gc-write-entered"), "half-written", { flag: "wx" })
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
      write(fd, bytes.subarray(middle))
    } finally { fs.closeSync(fd) }
  }
}
