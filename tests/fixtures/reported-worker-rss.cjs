const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Controlled pressure input only: do not allocate the reported bytes or patch a user session.
if (!isMainThread) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR || "")
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) throw Error("private readiness fixture required")
  const mib = Number(process.env.ARKTS_TEST_REPORTED_RSS_MIB)
  if (!Number.isSafeInteger(mib) || mib < 1) throw Error("positive reported RSS required")
  const read = process.memoryUsage.bind(process)
  const actualRss = read().rss
  const rss = mib * 1024 * 1024
  const reported = () => ({ ...read(), rss })
  reported.rss = () => rss
  process.memoryUsage = reported
  fs.appendFileSync(path.join(directory, "reported-rss.jsonl"), JSON.stringify({
    pid: process.pid, threadId, actualRss, reportedRss: rss,
    budget: process.env.ARKTS_MEMORY_BUDGET_MB ?? null,
  }) + "\n")
}
