import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("overlapping identical definitions share one semantic query and keep every response",
  { timeout: 30_000 }, async t => {
    const f = await queuedFixture(t)
    const start = f.events().length
    for (const id of [10, 11, 12]) send(f, id, "textDocument/definition", position)
    const responses = await Promise.all([10, 11, 12].map(id => f.session.transport.response(id, 10_000)))
    for (const response of responses) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, expected(f))
    }
    const events = f.events().slice(start)
    assert.equal(events.filter(e => e.event === "semantic.queue.worker.dispatch.started"
      && e.method === "define").length, 1, "one physical query for three equivalent consumers")
    assert.equal(events.filter(e => e.event === "semantic.request.coalesced").length, 2)
    assertSingleTerminals(f, [10, 11, 12])
  })

test("one cancelled definition consumer preserves its equivalent survivor and distinct cursors",
  { timeout: 30_000 }, async t => {
    const f = await queuedFixture(t)
    const start = f.events().length
    send(f, 10, "textDocument/definition", position)
    send(f, 11, "textDocument/definition", position)
    send(f, 12, "textDocument/definition", { ...position, character: position.character + 1 })
    send(f, 13, "textDocument/typeDefinition", position)
    send(f, 14, "textDocument/typeDefinition", position)
    await until(() => f.events().slice(start).filter(e => e.event === "semantic.request.coalesced").length === 2)
    f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 10 } })
    const responses = await Promise.all([10, 11, 12, 13, 14].map(id => f.session.transport.response(id, 10_000)))
    assert.equal(responses[0].error?.code, -32800)
    for (const response of responses.slice(1)) assert.equal(response.error, undefined, JSON.stringify(response))
    for (const response of responses.slice(1, 3)) assert.deepEqual(response.result, expected(f))
    assert.deepEqual(responses[3].result, responses[4].result)
    const dispatched = f.events().slice(start).filter(e => e.event === "semantic.queue.worker.dispatch.started")
    assert.equal(dispatched.filter(e => e.method === "define").length, 2)
    assert.equal(dispatched.filter(e => e.method === "typeDefinitions").length, 1)
    assertSingleTerminals(f, [10, 11, 12, 13, 14])
  })

test("cancelling all shared consumers removes waiting work and admits an identical fresh query",
  { timeout: 30_000 }, async t => {
    const f = await queuedFixture(t)
    const start = f.events().length
    for (const id of [10, 11]) send(f, id, "textDocument/definition", position)
    await until(() => f.events().slice(start).some(e => e.event === "semantic.request.coalesced"))
    for (const id of [10, 11]) f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    for (const id of [10, 11]) assert.equal((await f.session.transport.response(id, 10_000)).error?.code, -32800)
    send(f, 12, "textDocument/definition", position)
    assert.deepEqual((await f.session.transport.response(12, 10_000)).result, expected(f))
    assert.equal(f.events().slice(start).filter(e => e.event === "semantic.queue.worker.dispatch.started"
      && e.method === "define").length, 1)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assertSingleTerminals(f, [10, 11, 12])
  })

test("dependency edits revoke shared navigation before same-source-version queries can join",
  { timeout: 30_000 }, async t => {
    const f = await queuedFixture(t)
    const start = f.events().length
    for (const id of [10, 11]) send(f, id, "textDocument/definition", position)
    await until(() => f.events().slice(start).some(e => e.event === "semantic.request.coalesced"))
    f.session.openDocument({ uri: f.uri("Unopened.ets"), version: 1,
      text: "// unsaved dependency moves the target\n" + f.sources["Unopened.ets"] })
    for (const id of [12, 13]) send(f, id, "textDocument/definition", position)
    for (const id of [10, 11]) {
      const old = await f.session.transport.response(id, 10_000)
      assert.ok(old.error?.code === -32801 || (Array.isArray(old.result) && old.result.length === 0), JSON.stringify(old))
    }
    for (const id of [12, 13]) {
      const fresh = await f.session.transport.response(id, 10_000)
      assert.equal(fresh.error, undefined, JSON.stringify(fresh))
      assert.deepEqual(fresh.result, [{ uri: f.uri("Unopened.ets"), range: {
        start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
      } }])
    }
    assertSingleTerminals(f, [10, 11, 12, 13])
  })

test("unopened equivalent navigation shares source resolution without opening a synthetic overlay",
  { timeout: 30_000 }, async t => {
    const f = await queuedFixture(t, true)
    const start = f.events().length
    for (const id of [10, 11, 12]) send(f, id, "textDocument/definition", position)
    for (const id of [10, 11, 12]) assert.deepEqual((await f.session.transport.response(id, 10_000)).result, expected(f))
    assert.equal(f.events().slice(start).filter(e => e.event === "semantic.queue.worker.dispatch.started"
      && e.method === "define").length, 1)
    assert.equal(f.session.documentVersions.has(f.uri("Main.ets")), false)
    assertSingleTerminals(f, [10, 11, 12])
  })

for (const change of ["configuration", "close-reopen"]) {
  test(`${change} separates old shared navigation from new same-version consumers`,
    { timeout: 30_000 }, async t => {
      const f = await queuedFixture(t)
      const start = f.events().length
      for (const id of [10, 11]) send(f, id, "textDocument/definition", position)
      await until(() => f.events().slice(start).some(e => e.event === "semantic.request.coalesced"))
      if (change === "configuration") f.session.transport.send({ jsonrpc: "2.0",
        method: "workspace/didChangeConfiguration", params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
      else {
        f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
          params: { textDocument: { uri: f.uri("Main.ets") } } })
        f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
      }
      for (const id of [12, 13]) send(f, id, "textDocument/definition", position)
      for (const id of [10, 11]) {
        const old = await f.session.transport.response(id, 10_000)
        assert.ok(old.error?.code === -32801 || (Array.isArray(old.result) && !old.result.length), JSON.stringify(old))
      }
      for (const id of [12, 13]) {
        const fresh = await f.session.transport.response(id, 10_000)
        assert.equal(fresh.error, undefined, JSON.stringify(fresh))
        assert.deepEqual(fresh.result, expected(f))
      }
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
      assertSingleTerminals(f, [10, 11, 12, 13])
    })
}

const position = { line: 1, character: 25 }

test("a burst of distinct navigation requests releases cancelled waiting work and preserves every survivor",
  { timeout: 30_000 }, async t => {
    const source = 'import { neverQueried } from "./Unopened"\n' + Array.from({ length: 64 }, (_, i) =>
      `export const result${i} = neverQueried()`).join("\n") + "\n"
    const f = await queuedFixture(t, false, source)
    // Retain this larger public transcript; these are harness evidence bounds.
    f.session.transport.maxTranscriptEntries = 1024
    f.session.transport.maxTranscriptBytes = 512 * 1024
    const start = f.events().length
    const ids = Array.from({ length: 64 }, (_, i) => 200 + i)
    for (let i = 0; i < 64; i++) send(f, ids[i], "textDocument/definition", {
      line: i + 1, character: source.split("\n")[i + 1].indexOf("neverQueried") + 1 })
    await until(() => f.events().slice(start).filter(e => e.event === "semantic.queue.enqueued" && e.method === "define").length === 64)
    for (const id of ids.slice(0, 60)) f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const responses = await Promise.all(ids.map(id => f.session.transport.response(id, 10_000)))
    for (const response of responses.slice(0, 60)) assert.equal(response.error?.code, -32800, JSON.stringify(response))
    for (const response of responses.slice(60)) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, expected(f))
    }
    const dispatched = f.events().slice(start).filter(e => e.event === "semantic.queue.worker.dispatch.started" && e.method === "define")
    assert.equal(dispatched.length, 4, "cancelled waiting cursor requests must not consume the compiler queue")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assertSingleTerminals(f, ids)
  })

test("one semantic read shares duplicate configuration observations and keeps a fresh final validation",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/navigation-validation-observation.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    send(f, 10, "textDocument/definition", position)
    assert.deepEqual((await f.session.transport.response(10, 10_000)).result, expected(f))
    const observations = fs.readFileSync(path.join(f.directory, "navigation-validation.ndjson"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const facts = Object.entries(observations.at(-1).counts)
      .filter(([key]) => [f.workspace, fs.realpathSync.native(f.workspace)].includes(JSON.parse(key)[0]))
    t.diagnostic(JSON.stringify({ observations: observations.at(-1), rootFacts: facts }))
    assert.ok(facts.length > 0, "the real loaded namespace still participates in validation")
    assert.ok(facts.every(([, count]) => count === 2), "one initial observation and a distinct fresh final observation per path/mode")

    // Same request source version; no notification. Final input proofs cannot become an across-request cache.
    fs.writeFileSync(path.join(f.workspace, "Unopened.ets"), "// actual disk change\n" + f.sources["Unopened.ets"])
    send(f, 11, "textDocument/definition", position)
    const current = await f.session.transport.response(11, 10_000)
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, [{ uri: f.uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
  })

test("a real SDK mutation after compiler lookup is rejected by the leased final fence and recovers after configuration",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/navigation-validation-observation.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    const input = path.join(f.sdk, "ets/component/common.d.ts")
    fs.writeFileSync(path.join(f.directory, "navigation-mutate-after-lookup.json"), JSON.stringify({
      file: input, text: fs.readFileSync(input, "utf8") + "\ninterface ActuallyChangedSDK {}\n",
    }))
    send(f, 10, "textDocument/definition", position)
    const rejected = await f.session.transport.response(10, 10_000)
    assert.equal(fs.existsSync(path.join(f.directory, "navigation-mutation-applied.json")), true)
    assert.equal(rejected.error?.code, -32803, JSON.stringify(rejected))
    assert.equal(rejected.result, undefined, "the correct old location must not conceal stale compiler inputs")
    const nextSdk = path.join(f.directory, "sdk-next")
    fs.cpSync(f.sdk, nextSdk, { recursive: true })
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: nextSdk } } } } })
    send(f, 11, "textDocument/definition", position)
    const recovered = await f.session.transport.response(11, 10_000)
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, expected(f))
    assertSingleTerminals(f, [10, 11])
  })

function expected(f) {
  return [{ uri: f.uri("Unopened.ets"), range: {
    start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
  } }]
}

function send(f, id, method, cursor, uri = f.uri("Main.ets")) {
  f.session.transport.send({ jsonrpc: "2.0", id, method,
    params: { textDocument: { uri }, position: cursor } })
}

async function queuedFixture(t, disk = false, source) {
  const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
    ARKTS_SEMANTIC_QUEUE_TRACE: "1", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/Held.ets",
    ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1600", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_COOPERATIVE: "1" })
  fs.writeFileSync(path.join(f.workspace, "Held.ets"), 'const wrong: number = "bad"\n')
  if (source) { f.sources["Main.ets"] = source; fs.writeFileSync(path.join(f.workspace, "Main.ets"), source) }
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
  if (!disk) {
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
  }
  f.session.openDocument({ uri: f.uri("Held.ets"), version: 1, text: 'const wrong: number = "bad"\n' })
  await until(() => f.events().some(e => e.event === "semantic.test.diagnose.hold.start"))
  return f
}

function assertSingleTerminals(f, ids) {
  const transcript = f.session.transport.diagnosticSnapshot().transcript
  assert.equal(transcript.droppedEntries, 0)
  for (const id of ids) assert.equal(transcript.entries.filter(e => e.direction === "receive" && e.id === id).length, 1)
}

async function until(check) {
  const deadline = Date.now() + 7000
  while (!check()) {
    if (Date.now() > deadline) throw Error("controlled navigation overlap was not observed")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
