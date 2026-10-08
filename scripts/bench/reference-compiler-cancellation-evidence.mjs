import { delay, readStructuredLogs } from "./reference-replay-evidence.mjs"

const queryComplete = "references.compiler-query.complete"
const queryCancelled = "references.compiler-query.cancelled"
const findStart = "references.find-references.start"
const findComplete = "references.find-references.complete"
const findThrow = "references.find-references.throw"

function findReferencesOutcome(events, traceId, cancelSentAt) {
  const calls = events.filter(event => event.traceId === traceId
    && [findStart, findComplete, findThrow].includes(event.event))
  const thrown = calls.findLast(event => event.event === findThrow)
  if (thrown) {
    const started = calls.find(event => event.event === findStart
      && event.callIndex === thrown.callIndex)
    const completed = calls.some(event => event.event === findComplete
      && event.callIndex === thrown.callIndex)
    const startAt = Date.parse(started?.ts)
    const throwAt = Date.parse(thrown.ts)
    const verified = thrown.cancelled === true && !completed
      && Number.isFinite(startAt) && startAt <= cancelSentAt
      && Number.isFinite(throwAt) && throwAt > cancelSentAt
    return { outcome: verified ? "threw-cancellation" : "unverified-throw", event: thrown }
  }
  const completed = calls.findLast(event => event.event === findComplete)
  return { outcome: completed ? "completed" : "unobserved", event: completed ?? null }
}

export async function waitForScheduledCancellationStage(logDir, priorTraceIds,
  strategy, terminal, responseReceived, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (terminal() || responseReceived()) return { state: "terminal" }
    const events = readStructuredLogs(logDir)
    if (events.some(event => event.event === "request.completed"
      && event.method === "textDocument/references")) return { state: "terminal" }
    const queueStarts = events.filter(event => event.event === "references.queue.start"
      && event.traceId && !priorTraceIds.has(event.traceId))
    if (strategy === "legacy" && queueStarts.length) {
      return { state: "queue-start", event: queueStarts.at(-1) }
    }
    const queueTraceIds = new Set(queueStarts.map(event => event.traceId))
    const completed = events.filter(event => event.event === "references.batch.complete")
    const active = events.filter(event => event.event === "references.batch.start")
      .findLast(start => queueTraceIds.has(start.traceId)
        && !completed.some(end => end.referenceSession === start.referenceSession
        && end.batchIndex === start.batchIndex))
    if (active) return { state: "batch-scheduled", event: active }
    await delay(10)
  }
  return { state: "missing", reason: "NO_OBSERVED_IN_FLIGHT_BATCH" }
}

export async function waitForFindReferencesStart(logDir, priorTraceIds, terminal,
  responseReceived, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (terminal() || responseReceived()) return { state: "terminal" }
    const events = readStructuredLogs(logDir)
    const queueTraceIds = new Set(events.filter(event => event.event === "references.queue.start"
      && event.traceId && !priorTraceIds.has(event.traceId)).map(event => event.traceId))
    const started = events.findLast(event => event.event === findStart
      && queueTraceIds.has(event.traceId))
    if (started) {
      const finished = events.some(event => event.traceId === started.traceId
        && event.callIndex === started.callIndex
        && (event.event === findComplete || event.event === findThrow))
      return finished ? { state: "query-finished", event: started }
        : { state: "find-references-start", event: started }
    }
    await delay(10)
  }
  return { state: "missing", reason: "NO_OBSERVED_COMPILER_QUERY" }
}

export async function observeCompilerQueryOutcome(logDir, traceId, cancelSentAt, timeoutMs) {
  if (!traceId || !Number.isSafeInteger(cancelSentAt)) return { outcome: "unobserved" }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = readStructuredLogs(logDir)
    const cancelled = events.findLast(event => event.event === queryCancelled
      && event.traceId === traceId)
    const completed = events.findLast(event => event.event === queryComplete
      && event.traceId === traceId)
    if (cancelled || completed) {
      const findReferences = findReferencesOutcome(events, traceId, cancelSentAt)
      if (completed) return { outcome: "completed", event: completed, findReferences }
      const cancelledAt = Date.parse(cancelled.ts)
      return { outcome: Number.isFinite(cancelledAt) && cancelledAt > cancelSentAt
        ? "cancelled-in-flight" : "cancelled-before-client", event: cancelled,
      findReferences }
    }
    await delay(10)
  }
  return { outcome: "unobserved", reason: "NO_COMPILER_QUERY_TERMINAL_EVENT" }
}
