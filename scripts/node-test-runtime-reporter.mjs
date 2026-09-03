const TERMINAL_EVENTS = new Set(["test:pass", "test:fail"])

export default async function* nodeTestRuntimeReporter(source) {
  const counts = { skipped: 0, todo: 0, cancelled: 0 }

  for await (const event of source) {
    if (!TERMINAL_EVENTS.has(event.type)) continue
    if (hasAnnotation(event.data?.skip)) counts.skipped += 1
    if (hasAnnotation(event.data?.todo)) counts.todo += 1
    if (event.type === "test:fail" && isCancellation(event.data)) counts.cancelled += 1
  }

  yield `${JSON.stringify({
    schema: "arkts-language-server.node-test-runtime",
    schemaVersion: 1,
    counts,
  })}\n`
}

function hasAnnotation(value) {
  return value !== undefined && value !== false
}

function isCancellation(data) {
  let error = data?.details?.error ?? data?.error
  for (let depth = 0; error && depth < 8; depth += 1) {
    if (error.failureType === "cancelledByParent") return true
    error = error.cause
  }
  return false
}
