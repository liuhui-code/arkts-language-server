// A protocol-complete replay fixture that intentionally omits publishDiagnostics.
let pending = Buffer.alloc(0)

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

function receive(message) {
  if (message.method === "initialize") {
    send({ id: message.id, result: { capabilities: { referencesProvider: true } } })
  } else if (message.method === "initialized") {
    send({ id: 99, method: "window/workDoneProgress/create", params: { token: "catalog" } })
  } else if (message.id === 99 && !message.method) {
    send({ method: "$/progress", params: { token: "catalog", value: { kind: "begin", title: "catalog" } } })
    send({ method: "$/progress", params: { token: "catalog", value: { kind: "end", message: "ready" } } })
  } else if (message.method === "textDocument/references") {
    send({ id: message.id, result: [] })
  } else if (message.method === "shutdown") {
    send({ id: message.id, result: null })
  } else if (message.method === "exit") {
    process.exit(0)
  }
}
