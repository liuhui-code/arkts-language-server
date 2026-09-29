// The catalog only completes after references is requested, so a replay that
// waits for catalog readiness first cannot reach the exact reference result.
let pending = Buffer.alloc(0)
let catalogToken = null
let catalogAcknowledged = false
let referenceRequested = false

process.stdin.on("data", (chunk) => {
  pending = Buffer.concat([pending, chunk])
  while (true) {
    const headerEnd = pending.indexOf("\r\n\r\n")
    if (headerEnd < 0) return
    const match = /^Content-Length:\s*(\d+)$/mi.exec(pending.subarray(0, headerEnd).toString("ascii"))
    if (!match) process.exit(2)
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + Number(match[1])
    if (pending.length < bodyEnd) return
    const message = JSON.parse(pending.subarray(bodyStart, bodyEnd).toString("utf8"))
    pending = pending.subarray(bodyEnd)
    receive(message)
  }
})

function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }))
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}

function completeCatalogIfReady() {
  if (!catalogAcknowledged || !referenceRequested || process.env.ARKTS_TEST_CATALOG_NEVER_END) return
  send({ method: "$/progress", params: { token: catalogToken, value: { kind: "end", message: "ready" } } })
}

function receive(message) {
  if (message.method === "initialize") {
    send({ id: message.id, result: { capabilities: { referencesProvider: true } } })
  } else if (message.method === "initialized") {
    send({ id: 99, method: "window/workDoneProgress/create", params: { token: "catalog" } })
  } else if (message.id === 99 && !message.method) {
    catalogToken = "catalog"
    catalogAcknowledged = true
    send({ method: "$/progress", params: { token: catalogToken, value: { kind: "begin", title: "catalog" } } })
    completeCatalogIfReady()
  } else if (message.method === "textDocument/didOpen") {
    send({ method: "textDocument/publishDiagnostics", params: {
      uri: message.params.textDocument.uri, version: 1, diagnostics: [],
    } })
  } else if (message.method === "textDocument/references") {
    referenceRequested = true
    const uri = message.params.textDocument.uri
    send({ id: message.id, result: [{ uri, range: {
      start: { line: 0, character: 0 }, end: { line: 0, character: 5 },
    } }] })
    completeCatalogIfReady()
  } else if (message.method === "shutdown") {
    send({ id: message.id, result: null })
  } else if (message.method === "exit") {
    process.exit(0)
  }
}
