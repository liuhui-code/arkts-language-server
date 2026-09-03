import assert from "node:assert/strict"
import { once } from "node:events"
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

test("rejects every pending waiter when a notification matcher throws", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        const body = JSON.stringify({
          jsonrpc: "2.0",
          method: "fixture/matcher",
          params: { ready: true },
        })
        setTimeout(() => {
          process.stdout.write(
            "Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body,
          )
        }, 50)
        setInterval(() => {}, 1_000)
      `,
    ],
  })
  const matcherFailure = new Error(
    `MATCHER-START-${"x".repeat(400)}-END-SHOULD-NOT-APPEAR`,
  )

  try {
    const matched = lsp.notification("fixture/matcher", () => {
      throw matcherFailure
    }, 5_000)
    const unrelated = lsp.response(74, 5_000)
    const results = await withTimeout(
      Promise.allSettled([matched, unrelated]),
      1_000,
      "pending waiters did not reject after matcher failure",
    )

    for (const result of results) {
      assert.equal(result.status, "rejected")
      assert.match(result.reason.message, /LSP transport failure: accept handler threw/)
      assert.match(result.reason.message, /MATCHER-START-/)
      assert.doesNotMatch(result.reason.message, /END-SHOULD-NOT-APPEAR/)
      assert.ok(result.reason.message.length < 350, "transport failure must be bounded")
      assert.equal(result.reason.cause, matcherFailure)
    }
    assert.equal(results[0].reason, results[1].reason)
  } finally {
    await lsp.close()
  }
})

test("bounds concurrent close calls when the child ignores SIGTERM", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        process.on("SIGTERM", () => {
          process.stderr.write("fixture ignored SIGTERM\\n")
        })
        const body = JSON.stringify({ jsonrpc: "2.0", method: "fixture/ready" })
        process.stdout.write(
          "Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body,
        )
        setInterval(() => {}, 1_000)
      `,
    ],
  })

  try {
    await lsp.notification("fixture/ready", undefined, 1_000)

    const firstClose = lsp.close({ graceMs: 40 })
    const secondClose = lsp.close({ graceMs: 500 })
    const sharesCloseResult = firstClose === secondClose
    const result = await withTimeout(
      firstClose,
      1_000,
      "close did not escalate after its grace deadline",
    )

    assert.equal(sharesCloseResult, true)
    assert.deepEqual(result, { code: null, signal: "SIGKILL" })
    assert.equal(lsp.close({ graceMs: 1 }), firstClose)
  } finally {
    if (lsp.child.exitCode === null && lsp.child.signalCode === null) {
      const exited = once(lsp.child, "exit")
      lsp.child.kill("SIGKILL")
      await withTimeout(exited, 1_000, "fixture child did not exit after test cleanup")
    }
  }
})

test("routes responses, server requests, and notifications by JSON-RPC shape", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        const messages = [
          {
            jsonrpc: "2.0",
            id: 85,
            method: "fixture/route",
            params: { kind: "server-request" },
          },
          { jsonrpc: "2.0", id: 85, result: { kind: "client-response" } },
          {
            jsonrpc: "2.0",
            method: "fixture/route",
            params: { kind: "notification" },
          },
          { jsonrpc: "2.0", method: "fixture/ready" },
        ]
        const frame = (message) => {
          const body = JSON.stringify(message)
          return "Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body
        }
        process.stdout.write(messages.map(frame).join(""))
        setInterval(() => {}, 1_000)
      `,
    ],
  })

  try {
    await lsp.notification("fixture/ready", undefined, 1_000)

    assert.deepEqual(
      await lsp.response(85, 500),
      { jsonrpc: "2.0", id: 85, result: { kind: "client-response" } },
    )
    assert.deepEqual(
      await lsp.notification("fixture/route", undefined, 500),
      {
        jsonrpc: "2.0",
        method: "fixture/route",
        params: { kind: "notification" },
      },
    )
    assert.deepEqual(
      await lsp.serverRequest("fixture/route", undefined, 500),
      {
        jsonrpc: "2.0",
        id: 85,
        method: "fixture/route",
        params: { kind: "server-request" },
      },
    )
  } finally {
    await lsp.close()
  }
})
