import assert from "node:assert/strict"
import test from "node:test"

import { LspProcess, withTimeout } from "./support/lsp-process.mjs"

test("rejects a pending response immediately when the LSP child exits", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      'process.stderr.write("fixture-stderr\\n", () => { process.exitCode = 23 })',
    ],
  })

  try {
    await assert.rejects(
      withTimeout(
        lsp.response(41, 5_000),
        1_000,
        "pending response did not reject after the child exited",
      ),
      (error) => {
        assert.match(error.message, /LSP process exited before LSP response 41/)
        assert.match(error.message, /code=23/)
        assert.match(error.message, /signal=null/)
        assert.match(error.message, /stderr: fixture-stderr/)
        return true
      },
    )
  } finally {
    await lsp.close()
  }
})

test("routes a late response after its original waiter times out", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        const body = JSON.stringify({ jsonrpc: "2.0", id: 52, result: { late: true } })
        setTimeout(() => {
          process.stdout.write(
            "Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body,
          )
        }, 75)
        setInterval(() => {}, 1_000)
      `,
    ],
  })

  try {
    await assert.rejects(
      lsp.response(52, 20),
      /Timed out waiting for LSP response 52/,
    )

    assert.deepEqual(
      await lsp.response(52, 500),
      { jsonrpc: "2.0", id: 52, result: { late: true } },
    )
  } finally {
    await lsp.close()
  }
})

test("rejects a pending response when the child emits invalid JSON", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        const body = '{"jsonrpc":"2.0","id":63,"result":INVALID-START-'
          + "x".repeat(400)
          + "-END-SHOULD-NOT-APPEAR"
        setTimeout(() => {
          process.stdout.write(
            "Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body,
          )
        }, 50)
        setInterval(() => {}, 1_000)
      `,
    ],
  })

  try {
    await assert.rejects(
      withTimeout(
        lsp.response(63, 5_000),
        1_000,
        "pending response did not reject after invalid JSON",
      ),
      (error) => {
        assert.match(error.message, /LSP protocol failure: invalid JSON/)
        assert.match(error.message, /INVALID-START-/)
        assert.doesNotMatch(error.message, /END-SHOULD-NOT-APPEAR/)
        assert.ok(error.message.length < 350, "protocol failure excerpt must be bounded")
        return true
      },
    )
  } finally {
    await lsp.close()
  }
})
