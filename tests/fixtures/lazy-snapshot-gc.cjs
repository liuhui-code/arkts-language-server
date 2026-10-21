const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private GC fixture required")
  require("node:v8").setFlagsFromString("--expose_gc")
  const collect = require("node:vm").runInNewContext("gc")
  const marker = path.join(directory, "collect-lazy-snapshot-gc")
  let collected = false
  setInterval(async () => {
    if (collected || !fs.existsSync(marker)) return
    collected = true
    collect()
    await new Promise(resolve => setImmediate(resolve))
    collect()
    fs.writeFileSync(path.join(directory, "lazy-snapshot-gc.json"),
      JSON.stringify({ pid: process.pid, threadId, collections: 2 }))
  }, 10).unref()
}
