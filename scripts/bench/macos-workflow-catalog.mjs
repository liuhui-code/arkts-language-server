/** Consume native work-done terminal frames within the existing bounded catalog window. */
export async function readWorkflowCatalog(session, evidence, timeoutMs) {
  const startedAt = performance.now()
  const deadline = startedAt + timeoutMs
  Object.assign(evidence, { status: "PENDING", timeoutMs, events: [] })
  const remaining = () => {
    const left = deadline - performance.now()
    if (left <= 0) throw new Error("Timed out waiting for LSP catalog terminal")
    return left
  }
  try {
    const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, remaining())
    evidence.createRequest = create
    evidence.createResponse = { jsonrpc: "2.0", id: create.id, result: null }
    session.transport.send(evidence.createResponse)
    const token = create.params.token
    const begin = await session.transport.progress(token, message => message.params.value.kind === "begin", remaining())
    evidence.events.push(begin)
    let terminalReport
    while (true) {
      const event = await session.transport.progress(token, message => (
        ["report", "end"].includes(message.params.value.kind)
      ), remaining())
      evidence.events.push(event)
      if (event.params.value.kind === "end") break
      terminalReport = event
    }
    evidence.terminalReport = terminalReport ?? null
    const message = terminalReport?.params.value.message ?? ""
    if (message.startsWith("Indexing degraded after ")) {
      evidence.status = "DEGRADED"
      throw new Error(`MACOS_CATALOG_DEGRADED=${message}`)
    }
    if (message.startsWith("Indexing cancelled after ")) {
      evidence.status = "CANCELLED"
      throw new Error(`MACOS_CATALOG_CANCELLED=${message}`)
    }
    const match = /^Indexed (\d+)\/(\d+) files; skipped (\d+) entries$/u.exec(message)
    if (!match || match[1] !== match[2] || terminalReport.params.value.percentage !== 100) {
      throw new Error(`MACOS_CATALOG_INCOMPLETE=${message}`)
    }
    evidence.status = "READY"
    return Number(match[1])
  } catch (error) {
    if (evidence.status === "PENDING") {
      evidence.status = error.message.startsWith("Timed out waiting for LSP ") ? "TIMEOUT" : "FAILED"
    }
    evidence.failure = { name: error.name, message: error.message, code: error.code ?? null }
    throw error
  } finally { evidence.elapsedMs = performance.now() - startedAt }
}
