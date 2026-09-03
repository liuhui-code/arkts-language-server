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

test("routes interleaved queued progress by token and predicate", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        const messages = [
          {
            jsonrpc: "2.0",
            method: "$/progress",
            params: { token: "alpha", value: { kind: "begin", sequence: 1 } },
          },
          {
            jsonrpc: "2.0",
            method: "$/progress",
            params: { token: "beta", value: { kind: "begin", sequence: 2 } },
          },
          {
            jsonrpc: "2.0",
            method: "$/progress",
            params: { token: "alpha", value: { kind: "report", sequence: 3 } },
          },
          {
            jsonrpc: "2.0",
            method: "$/progress",
            params: { token: "beta", value: { kind: "report", sequence: 4 } },
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

    const betaBegin = await lsp.progress("beta", undefined, 500)
    const alphaReport = await lsp.progress(
      "alpha",
      (message) => message.params.value.kind === "report",
      500,
    )
    const betaReport = await lsp.progress(
      "beta",
      (message) => message.params.value.kind === "report",
      500,
    )
    const alphaBegin = await lsp.progress(
      "alpha",
      (message) => message.params.value.kind === "begin",
      500,
    )

    assert.deepEqual(
      [betaBegin, alphaReport, betaReport, alphaBegin]
        .map((message) => [message.params.token, message.params.value.sequence]),
      [["beta", 2], ["alpha", 3], ["beta", 4], ["alpha", 1]],
    )
  } finally {
    await lsp.close()
  }
})

test("rejects Content-Length values with trailing garbage", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        process.stdin.once("data", () => {
          const body = JSON.stringify({ jsonrpc: "2.0", id: 96, result: "invalid-frame" })
          process.stdout.write(
            "Content-Length: " + Buffer.byteLength(body) + "garbage\\r\\n\\r\\n" + body,
          )
        })
        setInterval(() => {}, 1_000)
      `,
    ],
  })

  try {
    const pending = lsp.response(96, 5_000)
    lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })

    await assert.rejects(
      withTimeout(pending, 1_000, "trailing Content-Length garbage was accepted"),
      (error) => {
        assert.equal(error.code, "LSP_INVALID_HEADER")
        assert.match(error.message, /invalid Content-Length/)
        return true
      },
    )
  } finally {
    await lsp.close()
  }
})

test("enforces configurable and default header limits", async () => {
  const cases = [
    { limit: 64, received: 65, options: { maxHeaderBytes: 64 } },
    { limit: 8 * 1_024, received: (8 * 1_024) + 1, options: {} },
  ]

  for (const fixture of cases) {
    const lsp = new LspProcess({
      command: process.execPath,
      args: [
        "-e",
        `
          process.stdin.once("data", () => {
            process.stdout.write("x".repeat(${fixture.received}))
          })
          setInterval(() => {}, 1_000)
        `,
      ],
      ...fixture.options,
    })

    try {
      const pending = lsp.response(97, 5_000)
      lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })

      await assert.rejects(
        withTimeout(pending, 1_000, "oversized LSP header was not rejected"),
        (error) => {
          assert.equal(error.code, "LSP_HEADER_TOO_LARGE")
          assert.equal(error.limit, fixture.limit)
          assert.ok(error.received > error.limit)
          return true
        },
      )
    } finally {
      await lsp.close()
    }
  }
})

test("enforces configurable and default frame limits before reading a body", async () => {
  const cases = [
    { limit: 128, declared: 129, options: { maxFrameBytes: 128 } },
    {
      limit: 16 * 1_024 * 1_024,
      declared: (16 * 1_024 * 1_024) + 1,
      options: {},
    },
  ]

  for (const fixture of cases) {
    const lsp = new LspProcess({
      command: process.execPath,
      args: [
        "-e",
        `
          process.stdin.once("data", () => {
            process.stdout.write("Content-Length: ${fixture.declared}\\r\\n\\r\\n")
          })
          setInterval(() => {}, 1_000)
        `,
      ],
      ...fixture.options,
    })

    try {
      const pending = lsp.response(98, 5_000)
      lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })

      await assert.rejects(
        withTimeout(pending, 1_000, "oversized LSP frame was not rejected"),
        (error) => {
          assert.equal(error.code, "LSP_FRAME_TOO_LARGE")
          assert.equal(error.limit, fixture.limit)
          assert.equal(error.received, fixture.declared)
          return true
        },
      )
    } finally {
      await lsp.close()
    }
  }
})

test("reports structured truncated frames when stdout ends mid-body or mid-header", async () => {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 99, result: "truncated" })
  const partialBody = body.slice(0, 13)
  const partialHeader = "Content-Length: 42\r\nContent-Ty"
  const cases = [
    {
      phase: "body",
      expected: Buffer.byteLength(body),
      received: Buffer.byteLength(partialBody),
      output: `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${partialBody}`,
    },
    {
      phase: "header",
      expected: "\\r\\n\\r\\n",
      received: Buffer.byteLength(partialHeader),
      output: partialHeader,
    },
  ]

  for (const fixture of cases) {
    const encodedOutput = Buffer.from(fixture.output).toString("base64")
    const lsp = new LspProcess({
      command: process.execPath,
      args: [
        "-e",
        `
          process.stdin.once("data", () => {
            process.stdout.end(Buffer.from("${encodedOutput}", "base64"))
          })
          setInterval(() => {}, 1_000)
        `,
      ],
    })

    try {
      const pending = lsp.response(99, 5_000)
      lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })

      await assert.rejects(
        withTimeout(pending, 1_000, `truncated ${fixture.phase} was not rejected`),
        (error) => {
          assert.equal(error.code, "LSP_TRUNCATED_FRAME")
          assert.equal(error.phase, fixture.phase)
          assert.equal(error.expected, fixture.expected)
          assert.equal(error.received, fixture.received)
          return true
        },
      )
    } finally {
      await lsp.close()
    }
  }
})

test("reuses a terminal protocol failure for existing and future waiters", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        process.stdin.once("data", () => {
          process.stdout.write("Content-Length: 1oops\\r\\n\\r\\n{")
        })
        setInterval(() => {}, 1_000)
      `,
    ],
  })

  try {
    const existing = Promise.allSettled([
      lsp.response(100, 5_000),
      lsp.notification("fixture/never", undefined, 5_000),
    ])
    lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })

    const existingResults = await withTimeout(
      existing,
      1_000,
      "existing waiters did not receive the terminal protocol failure",
    )
    assert.ok(existingResults.every((result) => result.status === "rejected"))
    const terminalFailure = existingResults[0].reason
    assert.equal(terminalFailure.code, "LSP_INVALID_HEADER")
    assert.equal(existingResults[1].reason, terminalFailure)

    const [futureResult] = await withTimeout(
      Promise.allSettled([lsp.response(101, 5_000)]),
      500,
      "future waiter did not immediately receive the terminal protocol failure",
    )
    assert.equal(futureResult.status, "rejected")
    assert.equal(futureResult.reason, terminalFailure)
  } finally {
    await lsp.close()
  }
})
