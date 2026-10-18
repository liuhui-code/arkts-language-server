const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Private diagnostic checkpoint, never a product pressure/eviction policy.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("resident GC observer requires its private fixture")
  }
  const request = path.join(directory, "collect-resident-gc")
  const output = path.join(directory, "resident-gc-result.json")
  const metrics = process.env.ARKTS_MEMORY_METRICS_FILE
  let started = false
  const stats = () => {
    const last = fs.readFileSync(metrics, "utf8").trim().split("\n").at(-1)
    const row = JSON.parse(last)
    if (row.processId !== process.pid || row.heapScope !== "semantic-worker-isolate") {
      throw new Error("resident GC metrics identity mismatch")
    }
    return row
  }
  const idle = row => row.leaseCount === 0 && row.transientVerifierCount === 0 && row.activeVerifierJobCount === 0
  const pause = () => new Promise(resolve => setTimeout(resolve, 20))
  const wait = async predicate => {
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline) {
      const row = stats()
      if (predicate(row)) return row
      await pause()
    }
    throw new Error("resident GC checkpoint fence timed out")
  }
  async function collect() {
    const result = { schema: 1, kind: "diagnostic-not-performance", status: "INCONCLUSIVE",
      pid: process.pid, threadId, gcCalls: 0, startedAt: Date.now(),
      rssScope: "node-process", heapScope: "semantic-worker-isolate" }
    try {
      if (typeof global.gc !== "function") throw new Error("GC was not exposed in this diagnostic launch")
      result.beforeStats = await wait(idle)
      if (result.beforeStats.residentContextCount !== 1) throw new Error("one resident context required")
      result.before = process.memoryUsage()
      const begin = performance.now()
      global.gc()
      result.gcCalls++
      await new Promise(resolve => setImmediate(resolve))
      global.gc()
      result.gcCalls++
      result.gcElapsedMs = performance.now() - begin
      result.after = process.memoryUsage()
      const gcEnd = Date.now()
      result.afterStats = await wait(row => row.epochMs >= gcEnd && idle(row))
      for (const key of ["residentContextCount", "projectFiles", "openDocuments"]) {
        if (result.afterStats[key] !== result.beforeStats[key]) throw new Error("resident state changed during GC")
      }
      result.status = "COMPLETE"
    } catch (error) { result.reason = String(error) }
    result.finishedAt = Date.now()
    const pending = `${output}.pending-${threadId}`
    fs.writeFileSync(pending, JSON.stringify(result) + "\n", { flag: "wx" })
    fs.linkSync(pending, output)
    fs.unlinkSync(pending)
  }
  setInterval(() => {
    // Worker preloads run before argv contains the actual entry filename.
    if (path.basename(process.argv[1] ?? "") !== "semantic-worker.cjs") return
    if (started || !fs.existsSync(request)) return
    started = true
    void collect()
  }, 100).unref()
}
