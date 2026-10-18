import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"

test("queue trace off and on preserve complete public payloads and latest overlay diagnostics",
  { timeout: 60_000 }, async t => {
    const files = {
      "Base.ets": fs.readFileSync("fixtures/semantic/inherited-this/Base.ets", "utf8"),
      "Derived.ets": fs.readFileSync("fixtures/semantic/inherited-this/Derived.ets", "utf8"),
    }
    const changed = files["Derived.ets"].replace("build(): void", 'currentTitle: string = ""\n  build(): void')
    const fixture = await makeQueryLayerFixture(t, { files,
      target: { kind: "references", file: "Base.ets", symbol: "BasePanel",
        position: { line: 0, character: 15 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [0, 2].map(line => ({ file: "Derived.ets", range: {
        start: { line, character: line === 0 ? 9 : 27 }, end: { line, character: line === 0 ? 18 : 36 },
      } })) },
    })
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const observations = []
    for (const trace of ["0", "1"]) {
      const logDirectory = path.join(fixture.directory, `logs-${trace}`)
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_LSP_LOG_DIR: logDirectory, ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, `index-${trace}`),
          ARKTS_SEMANTIC_QUEUE_TRACE: trace, NODE_OPTIONS: "",
          ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "0", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "0" },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      const diagnostics = []
      for (const [file, text] of Object.entries(files)) {
        session.openDocument({ uri: uri(file), version: 1, text })
        diagnostics.push((await session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === uri(file) && message.params.version === 1, 10_000)).params)
      }
      const timings = []
      const complete = async line => {
        const started = performance.now()
        const response = await session.request("textDocument/completion", {
          textDocument: { uri: uri("Derived.ets") }, position: { line, character: 9 },
        })
        assert.equal(response.error, undefined, JSON.stringify(response))
        timings.push({ documentVersion: line === 4 ? 1 : 2, clientCompleteResponseMs: performance.now() - started })
        return withoutResolutionIds(response.result)
      }
      const before = await complete(4)
      assert.deepEqual(before.items.map(({ label }) => label).sort(), ["build", "inheritedRefresh", "inheritedTitle"])
      const latest = session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Derived.ets") && message.params.version === 2, 10_000)
      session.changeDocument({ uri: uri("Derived.ets"), version: 2, text: changed })
      const after = await complete(5)
      assert.deepEqual(after.items.map(({ label }) => label).sort(),
        ["build", "currentTitle", "inheritedRefresh", "inheritedTitle"])
      diagnostics.push((await latest).params)
      assert.ok(diagnostics.at(-1).diagnostics.some(({ code }) => code === 1003))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
      assert.equal(events.some(({ event }) => event.startsWith("semantic.queue.")), trace === "1")
      const queueEvents = events.filter(({ event, method }) => event.startsWith("semantic.queue.") && method === "complete")
      const certifications = events.filter(({ event }) => event === "semantic.readiness.query.certification.complete")
      assert.equal(certifications.length, trace === "1" ? 2 : 0)
      assert.ok(certifications.every(receipt => receipt.outcome === "complete" && receipt.queryScopeSemanticState === "ready"),
        "ordinary queries certify the already initialized owner against their current inputs")
      const initializedAt = events.findIndex(({ event }) => event === "semantic.initialization.complete")
      assert.ok(initializedAt >= 0)
      assert.equal(events.slice(initializedAt + 1).some(({ event }) => event === "semantic.context.create"), false,
        "ordinary queries refresh the prepared owner without constructing another LS")
      if (trace === "1") {
        assert.equal(queueEvents.length, 6, "two ordinary completions retain all three queue boundary events")
        for (const receipt of queueEvents.filter(({ event }) => event === "semantic.queue.send.returned")) {
          assert.equal(queueEvents.filter(entry => entry.event === "semantic.queue.worker.dispatch.started"
            && entry.epoch === receipt.epoch && entry.workerRequestId === receipt.workerRequestId).length, 1)
        }
      }
      t.diagnostic(JSON.stringify({ qualification: "ORDINARY_PRIVATE_FIXTURE_QUEUE_SEGMENTS_NOT_PRODUCT_SLO_OR_NET_BENEFIT",
        trace, pid: session.transport.child.pid, timings, queueEvents, certifications,
        payloads: { before, after }, diagnostics }))
      observations.push({ before, after, diagnostics })
    }
    assert.deepEqual(observations[1], observations[0], "retain every semantic field, not just labels or counts")
  })

test("a real semantic transport send failure never records successful queue send return",
  { timeout: 30_000 }, async t => {
    const files = {
      "Base.ets": fs.readFileSync("fixtures/semantic/inherited-this/Base.ets", "utf8"),
      "Derived.ets": fs.readFileSync("fixtures/semantic/inherited-this/Derived.ets", "utf8"),
    }
    const fixture = await makeQueryLayerFixture(t, { files,
      target: { kind: "references", file: "Base.ets", symbol: "BasePanel",
        position: { line: 0, character: 15 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [0, 2].map(line => ({ file: "Derived.ets", range: {
        start: { line, character: line === 0 ? 9 : 27 }, end: { line, character: line === 0 ? 18 : 36 },
      } })) },
    })
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const logDirectory = path.join(fixture.directory, "logs")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_LSP_LOG_DIR: logDirectory, ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
        ARKTS_SEMANTIC_QUEUE_TRACE: "1",
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/semantic-queue-send-failure.cjs"))}` },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    for (const [file, text] of Object.entries(files)) {
      session.openDocument({ uri: uri(file), version: 1, text })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
      assert.equal(diagnostic.params.version, 1)
    }
    const response = await session.request("textDocument/completion", {
      textDocument: { uri: uri("Derived.ets") }, position: { line: 4, character: 9 },
    })
    assert.equal(response.error?.code, -32603, JSON.stringify(response))
    assert.equal(response.result, undefined)
    const fault = JSON.parse(fs.readFileSync(path.join(fixture.directory, "send-failure.json"), "utf8"))
    assert.equal(fault.pid, session.transport.child.pid)
    assert.equal(fault.uri, uri("Derived.ets"))
    const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
    const admissions = events.filter(entry => entry.event === "semantic.queue.enqueued" && entry.method === "complete")
    assert.equal(admissions.length, 1, "fault must occur after genuine queue admission")
    assert.equal(admissions[0].epoch, fault.epoch)
    assert.equal(events.some(entry => entry.event === "semantic.queue.send.returned"
      && entry.epoch === fault.epoch && entry.workerRequestId === fault.workerRequestId), false)
    assert.ok(events.some(entry => entry.event === "semantic.queue.send.returned" && entry.method === "diagnose"),
      "initial compiler diagnostics must still use the real successful transport")
    const transcript = session.transport.diagnosticSnapshot().transcript
    assert.equal(transcript.droppedEntries, 0)
    assert.equal(transcript.entries.filter(entry => entry.direction === "receive" && entry.id === response.id).length, 1)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

function withoutResolutionIds(result) {
  return { ...result, items: result.items.map(({ data, ...item }) => {
    assert.deepEqual(Object.keys(data), ["arktsCompletionId"])
    assert.match(data.arktsCompletionId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
    return { ...item, data: { arktsCompletionId: "<validated-process-local-uuid>" } }
  }) }
}
