const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, parentPort, workerData, threadId } = require("node:worker_threads")

// Observe genuine production Registry receipts at the actual verifier publication.
if (!isMainThread && parentPort && ["definition", "references"].includes(workerData?.operation)) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR ?? "")
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("transient release observer requires its private fixture")
  }
  const probe = path.join(directory, "registry.jsonl")
  const output = path.join(directory, "verifier-publications.jsonl")
  let lastSampleId = 0
  const post = parentPort.postMessage
  parentPort.postMessage = function (message, ...args) {
    if (typeof message?.ok === "boolean") {
      const records = fs.existsSync(probe) ? fs.readFileSync(probe, "utf8").trim().split("\n")
        .filter(Boolean).map(JSON.parse).filter(row => row.pid === process.pid && row.threadId === threadId && row.sampleId > lastSampleId) : []
      lastSampleId = Math.max(lastSampleId, ...records.map(row => row.sampleId))
      fs.appendFileSync(output, JSON.stringify({ pid: process.pid, threadId, operation: workerData.operation,
        responseOk: message.ok, timestamp: Date.now(), records }) + "\n")
    }
    return Reflect.apply(post, this, [message, ...args])
  }
}
