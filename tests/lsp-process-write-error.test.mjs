import assert from "node:assert/strict"
import test from "node:test"
import { LspProcess, withTimeout } from "./support/lsp-process.mjs"

test("a real closed child input pipe rejects pending LSP requests without an uncaught error", async () => {
  const lsp = new LspProcess({ command: process.execPath, args: ["-e", `
    require('node:fs').closeSync(0)
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'ready' })
    process.stdout.write('Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body)
    setInterval(() => {}, 1000)
  `] })
  try {
    await lsp.response(1)
    const pending = lsp.response(2, 5000)
    const rejected = assert.rejects(withTimeout(pending, 1500, "write failure did not reject pending request"), /EPIPE|write failure/)
    lsp.send({ jsonrpc: "2.0", id: 2, method: "test/closed-input", params: {} })
    await rejected
  } finally { await lsp.close() }
})
