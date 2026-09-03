import assert from "node:assert/strict"
import { once } from "node:events"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { LspProcess, withTimeout } from "./support/lsp-process.mjs"
import { withTestEvidence } from "./support/test-evidence.mjs"

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

test("bounds stderr as head and tail with byte accounting on process exit", async () => {
  const cases = [
    {
      label: "custom",
      maxStderrBytes: 96,
      maxDiagnosticTextBytes: 256,
      fillerBytes: 2 * 1_024,
      options: { maxStderrBytes: 96, maxDiagnosticTextBytes: 256 },
    },
    {
      label: "default",
      maxStderrBytes: 64 * 1_024,
      maxDiagnosticTextBytes: 4 * 1_024,
      fillerBytes: 35 * 1_024,
      options: {},
    },
  ]

  for (const fixture of cases) {
    const head = `HEAD-${fixture.label}\n`
    const sensitive = `SENSITIVE-MIDDLE-${fixture.label}`
    const tail = `TAIL-${fixture.label}\n`
    const totalBytes = Buffer.byteLength(head)
      + fixture.fillerBytes
      + Buffer.byteLength(sensitive)
      + fixture.fillerBytes
      + Buffer.byteLength(tail)
    const lsp = new LspProcess({
      command: process.execPath,
      args: [
        "-e",
        `
          process.stdin.once("data", () => {
            process.stderr.write(${JSON.stringify(head)}, () => {
              process.stderr.write("a".repeat(${fixture.fillerBytes}), () => {
                process.stderr.write(${JSON.stringify(sensitive)}, () => {
                  process.stderr.write("b".repeat(${fixture.fillerBytes}), () => {
                    process.stderr.write(${JSON.stringify(tail)}, () => process.exit(23))
                  })
                })
              })
            })
          })
        `,
      ],
      ...fixture.options,
    })

    try {
      const pending = lsp.response(110, 5_000)
      lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })
      const [result] = await withTimeout(
        Promise.allSettled([pending]),
        1_000,
        "child did not exit after its stderr write callbacks",
      )

      assert.equal(result.status, "rejected")
      assert.equal(lsp.stderrTotalBytes, totalBytes)
      assert.equal(lsp.stderrRetainedBytes, fixture.maxStderrBytes)
      assert.equal(lsp.stderrDroppedBytes, totalBytes - fixture.maxStderrBytes)
      assert.match(lsp.stderr, new RegExp(`HEAD-${fixture.label}`))
      assert.match(lsp.stderr, new RegExp(`TAIL-${fixture.label}`))
      assert.doesNotMatch(lsp.stderr, new RegExp(sensitive))
      assert.ok(
        Buffer.byteLength(result.reason.message) <= fixture.maxDiagnosticTextBytes,
        "exit diagnostic exceeded its hard byte limit",
      )
      assert.match(result.reason.message, new RegExp(`HEAD-${fixture.label}`))
      assert.match(result.reason.message, new RegExp(`TAIL-${fixture.label}`))
      assert.doesNotMatch(result.reason.message, new RegExp(sensitive))
    } finally {
      await lsp.close()
    }
  }
})

test("hard-bounds timeout diagnostic text", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: ["-e", "process.stdin.resume()"],
    maxDiagnosticTextBytes: 128,
  })

  try {
    await assert.rejects(
      lsp.notification(`fixture/${"x".repeat(2_048)}`, undefined, 20),
      (error) => {
        assert.match(error.message, /^Timed out waiting for LSP notification/)
        assert.ok(Buffer.byteLength(error.message) <= 128)
        return true
      },
    )
  } finally {
    await lsp.close()
  }
})

test("hard-bounds protocol failure text without losing its structured code", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        process.stdin.once("data", () => {
          process.stdout.write("Content-Length: 1" + "x".repeat(400) + "\\r\\n\\r\\n{")
        })
        process.stdin.resume()
      `,
    ],
    maxDiagnosticTextBytes: 96,
  })

  try {
    const pending = lsp.response(111, 5_000)
    lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })
    await assert.rejects(
      withTimeout(pending, 1_000, "protocol failure was not delivered"),
      (error) => {
        assert.equal(error.code, "LSP_INVALID_HEADER")
        assert.match(error.message, /^LSP protocol failure:/)
        assert.ok(Buffer.byteLength(error.message) <= 96)
        return true
      },
    )
  } finally {
    await lsp.close()
  }
})

test("captures redacted send and receive envelopes in a diagnostic snapshot", async () => {
  const request = {
    jsonrpc: "2.0",
    id: 120,
    method: "fixture/secret",
    params: { source: "SENSITIVE-SEND-SOURCE" },
  }
  const response = {
    jsonrpc: "2.0",
    id: 120,
    result: { source: "SENSITIVE-RECEIVE-RESULT" },
  }
  const ready = {
    jsonrpc: "2.0",
    method: "fixture/ready",
    params: { source: "SENSITIVE-RECEIVE-PARAMS" },
  }
  const encodedFrames = [response, ready].map((message) => {
    const body = JSON.stringify(message)
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
  }).join("")
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        process.stdin.once("data", () => {
          process.stdout.write(Buffer.from("${Buffer.from(encodedFrames).toString("base64")}", "base64"))
        })
        process.stdin.resume()
      `,
    ],
  })

  try {
    lsp.send(request)
    await lsp.response(120, 1_000)
    await lsp.notification("fixture/ready", undefined, 1_000)

    const snapshot = lsp.diagnosticSnapshot()
    assert.equal(snapshot.pid, lsp.child.pid)
    assert.equal(snapshot.terminal.state, "running")
    assert.deepEqual(snapshot.pendingDescriptions, [])
    assert.deepEqual(snapshot.parser, {
      phase: "header",
      bufferedBytes: 0,
      expectedBytes: null,
      receivedBytes: 0,
    })
    assert.deepEqual(snapshot.stderr, {
      text: "",
      totalBytes: 0,
      retainedBytes: 0,
      droppedBytes: 0,
    })
    assert.deepEqual(snapshot.transcript.entries, [
      {
        direction: "send",
        sequence: 1,
        kind: "request",
        method: "fixture/secret",
        id: 120,
        byteSize: Buffer.byteLength(JSON.stringify(request)),
      },
      {
        direction: "receive",
        sequence: 2,
        kind: "response",
        method: null,
        id: 120,
        byteSize: Buffer.byteLength(JSON.stringify(response)),
      },
      {
        direction: "receive",
        sequence: 3,
        kind: "notification",
        method: "fixture/ready",
        id: null,
        byteSize: Buffer.byteLength(JSON.stringify(ready)),
      },
    ])
    assert.equal(snapshot.transcript.totalEntries, 3)
    assert.equal(snapshot.transcript.droppedEntries, 0)
    assert.doesNotMatch(JSON.stringify(snapshot), /SENSITIVE-/)
  } finally {
    await lsp.close()
  }
})

test("evicts oldest transcript envelopes by configurable entry and byte limits", async () => {
  const notifications = Array.from({ length: 6 }, (_, index) => ({
    jsonrpc: "2.0",
    method: index === 5
      ? "fixture/ready"
      : `fixture/event-${index}-${"m".repeat(80)}`,
    params: { source: `SENSITIVE-${index}` },
  }))
  const encodedFrames = notifications.map((message) => {
    const body = JSON.stringify(message)
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
  }).join("")
  const cases = [
    { maxTranscriptEntries: 3, maxTranscriptBytes: 10_000, exactEntries: 3 },
    { maxTranscriptEntries: 100, maxTranscriptBytes: 220 },
  ]

  for (const limits of cases) {
    const lsp = new LspProcess({
      command: process.execPath,
      args: [
        "-e",
        `
          process.stdin.once("data", () => {
            process.stdout.write(Buffer.from("${Buffer.from(encodedFrames).toString("base64")}", "base64"))
          })
          process.stdin.resume()
        `,
      ],
      ...limits,
    })

    try {
      lsp.send({
        jsonrpc: "2.0",
        id: 121,
        method: "fixture/start",
        params: { source: "SENSITIVE-SEND" },
      })
      await lsp.notification("fixture/ready", undefined, 1_000)
      const transcript = lsp.diagnosticSnapshot().transcript

      assert.equal(transcript.totalEntries, 7)
      assert.ok(transcript.entries.length <= limits.maxTranscriptEntries)
      assert.ok(transcript.retainedBytes <= limits.maxTranscriptBytes)
      assert.ok(transcript.droppedEntries > 0)
      if (limits.exactEntries !== undefined) {
        assert.equal(transcript.entries.length, limits.exactEntries)
        assert.deepEqual(transcript.entries.map((entry) => entry.sequence), [5, 6, 7])
      }
    } finally {
      await lsp.close()
    }
  }
})

test("returns a deeply immutable snapshot of pending and terminal transport state", async () => {
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        process.stdin.once("data", () => {
          process.stdout.write("Content-Length: nope\\r\\n\\r\\n{")
        })
        process.stdin.resume()
      `,
    ],
  })

  try {
    const pending = lsp.response(130, 5_000)
    const pendingResult = Promise.allSettled([pending])
    const running = lsp.diagnosticSnapshot()
    assert.equal(running.pid, lsp.child.pid)
    assert.equal(running.terminal.state, "running")
    assert.deepEqual(running.pendingDescriptions, ["LSP response 130"])
    assert.equal(running.parser.phase, "header")
    assert.equal(running.parser.bufferedBytes, 0)
    assert.equal(Object.isFrozen(running), true)
    assert.equal(Object.isFrozen(running.terminal), true)
    assert.equal(Object.isFrozen(running.pendingDescriptions), true)
    assert.equal(Object.isFrozen(running.stderr), true)
    assert.equal(Object.isFrozen(running.transcript), true)
    assert.equal(Object.isFrozen(running.transcript.entries), true)
    assert.throws(() => {
      running.terminal.state = "tampered"
    }, TypeError)

    lsp.send({ jsonrpc: "2.0", method: "fixture/trigger" })
    const [result] = await withTimeout(
      pendingResult,
      1_000,
      "terminal protocol failure was not delivered",
    )
    assert.equal(result.status, "rejected")

    const failed = lsp.diagnosticSnapshot()
    assert.notEqual(failed, running)
    assert.equal(failed.terminal.state, "failed")
    assert.equal(failed.terminal.failureCode, "LSP_INVALID_HEADER")
    assert.deepEqual(failed.pendingDescriptions, [])
    assert.equal(Object.isFrozen(failed.transcript.entries[0]), true)
  } finally {
    await lsp.close()
  }
})

test("retains a bounded redacted LSP process evidence bundle after a real child failure", async (t) => {
  const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-lsp-failure-evidence-"))
  t.after(() => fs.rm(evidenceRoot, { recursive: true, force: true }))

  const sourceCanary = "PRIVATE-SOURCE-CANARY"
  const stderrCanary = "PRIVATE-STDERR-CANARY"
  const request = {
    jsonrpc: "2.0",
    id: 140,
    method: "fixture/secret",
    params: { source: sourceCanary },
  }
  const response = {
    jsonrpc: "2.0",
    id: 140,
    result: { source: sourceCanary },
  }
  const notification = {
    jsonrpc: "2.0",
    method: "fixture/secret-notification",
    params: { source: sourceCanary },
  }
  const stdoutPayload = [response, notification].map((message) => {
    const body = JSON.stringify(message)
    return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
  }).join("") + "Content-Length: nope\r\n\r\n{"
  const stderrPayload = `STDERR-HEAD\n${"x".repeat(512)}${stderrCanary}${"y".repeat(512)}\nSTDERR-TAIL\n`
  const lsp = new LspProcess({
    command: process.execPath,
    args: [
      "-e",
      `
        const stderr = Buffer.from("${Buffer.from(stderrPayload).toString("base64")}", "base64")
        const stdout = Buffer.from("${Buffer.from(stdoutPayload).toString("base64")}", "base64")
        process.stdin.once("data", () => {
          process.stderr.write(stderr, () => process.stdout.write(stdout))
        })
        process.stdin.resume()
      `,
    ],
    maxStderrBytes: 96,
    maxTranscriptEntries: 8,
    maxTranscriptBytes: 1_024,
  })
  let retainedDirectory

  try {
    await assert.rejects(
      withTestEvidence({
        root: evidenceRoot,
        caseId: "lsp/real-child-failure",
        captureFailure: ({ evidenceDirectory }) => {
          retainedDirectory = evidenceDirectory
          return lsp.writeFailureEvidence(evidenceDirectory, { name: "lsp-failure" })
        },
      }, async () => {
        const childClosed = once(lsp.child, "close")
        const pending = lsp.response(141, 5_000)
        const pendingResult = Promise.allSettled([pending])
        lsp.send(request)
        const [result] = await withTimeout(
          pendingResult,
          1_000,
          "real child protocol failure was not delivered",
        )
        await withTimeout(childClosed, 1_000, "real child did not close after protocol failure")
        assert.equal(result.status, "rejected")
        throw result.reason
      }),
      (error) => error.code === "LSP_INVALID_HEADER",
    )

    assert.ok(retainedDirectory)
    assert.deepEqual((await fs.readdir(retainedDirectory)).sort(), [
      "failure.json",
      "lsp-failure.process.json",
      "lsp-failure.stderr.log",
      "lsp-failure.transcript.ndjson",
    ])

    const processPath = path.join(retainedDirectory, "lsp-failure.process.json")
    const transcriptPath = path.join(retainedDirectory, "lsp-failure.transcript.ndjson")
    const stderrPath = path.join(retainedDirectory, "lsp-failure.stderr.log")
    const [processText, transcriptText, stderrText] = await Promise.all([
      fs.readFile(processPath, "utf8"),
      fs.readFile(transcriptPath, "utf8"),
      fs.readFile(stderrPath, "utf8"),
    ])
    const processEvidence = JSON.parse(processText)
    assert.equal(processEvidence.schema, "arkts-language-server.lsp-process-failure")
    assert.equal(processEvidence.schemaVersion, 1)
    assert.equal(processEvidence.terminal.state, "failed")
    assert.equal(processEvidence.terminal.failureCode, "LSP_INVALID_HEADER")
    assert.deepEqual(processEvidence.pendingDescriptions, [])
    assert.deepEqual(Object.keys(processEvidence.parser).sort(), [
      "bufferedBytes",
      "expectedBytes",
      "phase",
      "receivedBytes",
    ])
    assert.deepEqual(processEvidence.stderr, {
      totalBytes: Buffer.byteLength(stderrPayload),
      retainedBytes: 96,
      droppedBytes: Buffer.byteLength(stderrPayload) - 96,
    })

    const transcript = transcriptText.trimEnd().split("\n").map((line) => JSON.parse(line))
    assert.deepEqual(transcript.map(({ direction, kind, method, id }) => ({
      direction,
      kind,
      method,
      id,
    })), [
      { direction: "send", kind: "request", method: "fixture/secret", id: 140 },
      { direction: "receive", kind: "response", method: null, id: 140 },
      {
        direction: "receive",
        kind: "notification",
        method: "fixture/secret-notification",
        id: null,
      },
    ])
    for (const entry of transcript) {
      assert.deepEqual(Object.keys(entry).sort(), [
        "byteSize",
        "direction",
        "id",
        "kind",
        "method",
        "sequence",
      ])
    }
    assert.match(stderrText, /STDERR-HEAD/)
    assert.match(stderrText, /STDERR-TAIL/)

    const retainedEvidence = `${processText}\n${transcriptText}\n${stderrText}`
    assert.doesNotMatch(retainedEvidence, /PRIVATE-(?:SOURCE|STDERR)-CANARY/)
    assert.doesNotMatch(retainedEvidence, /"(?:params|result|source)"\s*:/)
    const [processStat, transcriptStat, stderrStat] = await Promise.all([
      fs.stat(processPath),
      fs.stat(transcriptPath),
      fs.stat(stderrPath),
    ])
    assert.ok(processStat.size < 2_048)
    assert.ok(transcriptStat.size < 1_024)
    assert.ok(stderrStat.size < 160)
  } finally {
    await lsp.close()
  }
})

test("rejects unsafe LSP failure evidence names before writing outside the case directory", async (t) => {
  const evidenceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-lsp-safe-evidence-"))
  const evidenceDirectory = path.join(evidenceRoot, "case")
  await fs.mkdir(evidenceDirectory)
  t.after(() => fs.rm(evidenceRoot, { recursive: true, force: true }))
  const lsp = new LspProcess({
    command: process.execPath,
    args: ["-e", "process.stdin.resume()"],
  })

  try {
    await assert.rejects(
      lsp.writeFailureEvidence(evidenceDirectory, { name: "../escaped" }),
      (error) => error instanceof TypeError && /safe evidence name/.test(error.message),
    )
    assert.deepEqual(await fs.readdir(evidenceRoot), ["case"])
  } finally {
    await lsp.close()
  }
})
