import { createHash } from "node:crypto"

const MAX_EVENTS = 80
const MAX_STRING_LENGTH = 160
const EVENT = /^(?:semantic\.context\.(?:create|evict)|semantic\.prepare\.[a-z.-]+|references\.resident\.proof\.[a-z.-]+|semantic\.[a-z.-]*(?:proof|witness)[a-z.-]*)$/
const WORKER_FIELDS = new Map([
  ["semantic.worker.started", ["semanticWorkerCount", "threadId"]],
  ["semantic.worker.recovery.retired", ["oldThreadId"]],
  ["semantic.worker.recovery.complete", ["oldThreadId", "newThreadId", "documents"]],
])
const FIELDS = ["ts", "reason", "resetReason", "stage", "contextSequence", "leaseCount",
  "residentContextCount", "newEntry", "documentVersion", "retainedPaths", "pid", "monotonicNs",
  "residentScriptsBefore", "residentScriptsAfter", "newResidentScripts", "generationBefore", "generationAfter"]

/** Keep the original synchronous assertion/error; diagnostic collection is best effort. */
export function withContextFailureEvidence(t, events, assertion) {
  try { return assertion() }
  catch (original) {
    let report = { event: "test.context-retention.failure", evidence: "unavailable" }
    try { report = summarize(events()) } catch { /* Never replace the assertion with a collection error. */ }
    try { t.diagnostic(JSON.stringify(report)) } catch { /* Never replace the assertion with an output error. */ }
    throw original
  }
}

function summarize(events) {
  const selected = []
  let matchedEvents = 0
  for (const event of events) {
    if (typeof event?.event !== "string" || event.event.length > MAX_STRING_LENGTH) continue
    const workerFields = WORKER_FIELDS.get(event.event)
    if (!workerFields && !EVENT.test(event.event)) continue
    const row = { event: event.event }
    for (const field of workerFields ? ["ts", "pid", ...workerFields] : FIELDS) {
      const value = event[field]
      if (workerFields && field !== "ts" && !(typeof value === "number" && Number.isFinite(value))) continue
      if (typeof value === "string") row[field] = value.slice(0, MAX_STRING_LENGTH)
      else if (typeof value === "boolean" || value === null || typeof value === "number" && Number.isFinite(value)) row[field] = value
    }
    if (event.event === "references.resident.proof.rejected" && typeof event.sourcePath === "string"
      && event.sourcePath.length <= 4096) row.sourcePathSha256 = createHash("sha256").update(event.sourcePath).digest("hex")
    matchedEvents += 1
    selected.push(row)
    if (selected.length > MAX_EVENTS) selected.shift()
  }
  return { event: "test.context-retention.failure", matchedEvents,
    omittedEvents: matchedEvents - selected.length, events: selected }
}
