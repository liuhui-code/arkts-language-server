import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

function fixture(t, overrides = {}) {
  const f = createReadinessFixture(t, {
    ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    ARKTS_SEMANTIC_REQUEST_TIMEOUT_MS: "10000", ARKTS_SEMANTIC_PREPARE_TIMEOUT_MS: "10000",
    ARKTS_SEMANTIC_MUTATION_TIMEOUT_MS: "1500", ARKTS_SEMANTIC_CANCEL_GRACE_MS: "100",
    NODE_OPTIONS: "--require=" + JSON.stringify(path.resolve("tests/fixtures/unresponsive-semantic-worker.cjs")),
    ...overrides,
  })
  return { ...f, fault(stage, remaining = 1, clockOffset = 0, extra = {}) {
    fs.rmSync(path.join(f.directory, "unresponsive-entered.json"), { force: true })
    fs.writeFileSync(path.join(f.directory, "unresponsive-fault.json"), JSON.stringify({ stage, remaining, clockOffset, ...extra }))
  }, readiness: prepare => f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare }) }
}
async function waitFor(check, description) {
  const deadline = Date.now() + 7000
  while (!check()) {
    if (Date.now() > deadline) throw Error("missing " + description)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
async function ready(f) {
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  const message = await f.session.transport.notification("arkts/semanticPreparation",
    row => row.params.phase === "complete", 10_000)
  assert.equal(message.params.report.semanticState, "ready")
}
function configure(f) {
  f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
}
function definition(f) {
  return { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 23 } }
}

test("a cancelled nonreturning checker still reaches its original execution deadline and recovers once", { timeout: 20_000 }, async t => {
  const f = fixture(t, { ARKTS_SEMANTIC_REQUEST_TIMEOUT_MS: "1500" })
  await ready(f)
  configure(f); await f.readiness(false)
  f.fault("checker")
  const id = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/definition", params: definition(f) })
  await waitFor(() => fs.existsSync(path.join(f.directory, "unresponsive-entered.json")), "checker entry")
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
  const terminal = await f.session.transport.response(id, 2500)
  assert.equal(terminal.error?.code, -32800, JSON.stringify(terminal))
  await waitFor(() => f.events().some(e => e.event === "semantic.worker.recovery.complete"), "recovery")
  const stalled = f.events().find(e => e.event === "semantic.worker.unresponsive")
  assert.equal(stalled.reason, "execution-deadline")
  assert.equal(stalled.limitMs, 1500)
  assert.equal(stalled.phase, "checker")
  assert.equal(stalled.programStarts, stalled.programReturns)
  assert.equal(stalled.checkerStarts, stalled.checkerReturns + 1)
  const result = await f.session.request("textDocument/definition", definition(f))
  assert.equal(result.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(result))
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
  const frames = f.session.transport.transcriptEntries.filter(({ entry }) =>
    entry.direction === "receive" && entry.id === id && entry.method === null)
  assert.equal(frames.length, 1)
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  const lifetime = fs.readFileSync(path.join(f.directory, "worker-lifetime.ndjson"), "utf8").trim().split("\n").map(JSON.parse)
  assert.deepEqual(lifetime.map(e => e.event), ["created", "exited", "created", "exited"])
})

test("fatal failures with no successful build share a consecutive budget even beyond the rate window", { timeout: 30_000 }, async t => {
  const f = fixture(t)
  await ready(f)
  for (let i = 1; i <= 3; i++) {
    f.fault("exit", 1, i * 181_000)
    await waitFor(() => f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i, "recovery " + i)
    assert.notEqual((await f.readiness(false)).result?.semanticState, "ready")
  }
  f.fault("exit", 1, 4 * 181_000)
  await waitFor(() => f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "consecutive circuit")
  assert.equal((await f.readiness(true)).error?.code, -32803)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 4)
  await new Promise(resolve => setTimeout(resolve, 1300))
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  assert.equal((await f.readiness(false)).error?.code, -32803)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 4,
    "an input mutation must not create a Worker outside the shared recovery budget")
})

test("a corrected input admits one half-open build after the circuit stops, without reopening for status or identical configuration", { timeout: 30_000 }, async t => {
  const f = fixture(t)
  await ready(f)
  for (let i = 1; i <= 4; i++) {
    f.fault("exit", 1, i * 181_000)
    await waitFor(() => i < 4
      ? f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i
      : f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "failure " + i)
  }
  await new Promise(resolve => setTimeout(resolve, 1300))
  configure(f)
  assert.equal((await f.readiness(true)).error?.code, -32803, "identical settings cannot replenish recovery")
  const text = "// corrected unsaved input\n" + f.sources["Main.ets"]
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text })
  assert.equal((await f.readiness(false)).error?.code, -32803, "read-only status cannot start a probe")
  const response = await f.session.request("textDocument/definition", {
    ...definition(f), position: { line: 2, character: 23 } })
  assert.equal(response.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(response))
  assert.equal((await f.readiness(true)).result?.semanticState, "ready")
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 5)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.recovery.half-open").length, 1)
})

test("initialization blocked before Program has an execution deadline and can retry the unchanged input", { timeout: 20_000 }, async t => {
  const f = fixture(t, { ARKTS_SEMANTIC_PREPARE_TIMEOUT_MS: "1500" })
  f.fault("roots")
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 5000)
  await waitFor(() => f.events().some(e => e.event === "semantic.worker.recovery.complete"), "initial recovery")
  const stalled = f.events().find(e => e.event === "semantic.worker.unresponsive")
  assert.equal(stalled.reason, "execution-deadline")
  assert.equal(stalled.phase, "synchronize")
  assert.equal(stalled.programStarts, 0, "this controlled Host failure occurs before createProgram")
  assert.equal((await f.readiness(true)).result?.semanticState, "ready")
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
})

test("a timed-out mutation and edits during recovery replay the latest overlay without parallel Workers", { timeout: 20_000 }, async t => {
  const f = fixture(t)
  await ready(f)
  f.fault("mutation")
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await waitFor(() => fs.existsSync(path.join(f.directory, "unresponsive-entered.json")), "mutation entry")
  await waitFor(() => f.events().some(e => e.event === "semantic.worker.unresponsive"), "mutation timeout")
  const text = "// edited while recovering\n" + f.sources["Main.ets"]
  for (let version = 2; version <= 101; version++) {
    f.session.changeDocument({ uri: f.uri("Main.ets"), version, text: text.replace("recovering", "recovering " + version) })
  }
  const response = await f.session.request("textDocument/definition", {
    ...definition(f), position: { line: 2, character: 23 } })
  assert.equal(response.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(response))
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
  assert.equal(f.events().find(e => e.event === "semantic.worker.unresponsive").method, "mutation")
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  const rows = fs.readFileSync(path.join(f.directory, "worker-lifetime.ndjson"), "utf8").trim().split("\n").map(JSON.parse)
  assert.deepEqual(rows.map(e => e.event), ["created", "exited", "created", "exited"])
})

test("cancelling a second root queued behind a synchronous stall settles without waiting for that root's execution", { timeout: 20_000 }, async t => {
  const f = fixture(t, { ARKTS_SEMANTIC_QUEUE_TRACE: "1" })
  const other = path.join(f.directory, "other")
  fs.mkdirSync(other)
  for (const [name, text] of Object.entries(f.sources)) fs.writeFileSync(path.join(other, name), text)
  const rootUri = pathToFileURL(other).href
  const initialize = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: "2.0", id: initialize, method: "initialize", params: {
    processId: process.pid, rootUri: f.rootUri, capabilities: {}, initializationOptions: { sdk: { path: f.sdk } },
    workspaceFolders: [{ uri: f.rootUri, name: "first" }, { uri: rootUri, name: "second" }] } })
  assert.equal((await f.session.transport.response(initialize, 5000)).error, undefined)
  f.session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  f.session.initialized = true
  await f.session.transport.notification("arkts/semanticPreparation",
    m => m.params.rootUri === rootUri && m.params.phase === "complete", 10_000)
  configure(f); await f.readiness(false)
  f.fault("checker")
  const blocked = f.session.nextRequestId++, queued = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: "2.0", id: blocked, method: "textDocument/definition", params: definition(f) })
  await waitFor(() => fs.existsSync(path.join(f.directory, "unresponsive-entered.json")), "checker entry")
  f.session.transport.send({ jsonrpc: "2.0", id: queued, method: "textDocument/definition", params: {
    ...definition(f), textDocument: { uri: pathToFileURL(path.join(other, "Main.ets")).href } } })
  await waitFor(() => f.events().some(e => e.event === "semantic.queue.send.returned"
    && e.rootUri === rootUri && e.method === "define"), "second root command send")
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: queued } })
  assert.equal((await f.session.transport.response(queued, 2500)).error?.code, -32800)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1,
    "queued cancellation must not force retirement of unrelated active work")
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: blocked } })
  assert.equal((await f.session.transport.response(blocked, 2500)).error?.code, -32800)
})

test("a corrupt cancellation cell retires the isolate instead of crashing the parent watchdog", { timeout: 15_000 }, async t => {
  const f = fixture(t)
  await ready(f)
  configure(f); await f.readiness(false)
  f.fault("corrupt")
  const result = await f.session.request("textDocument/definition", definition(f))
  assert.equal(result.error?.code, -32603, JSON.stringify(result))
  await waitFor(() => f.events().some(e => e.event === "semantic.worker.recovery.complete"), "corrupt-cell recovery")
  assert.equal((await f.readiness(true)).result?.semanticState, "ready")
})

test("repeated mutation timeouts use the same three-recovery budget as requests", { timeout: 35_000 }, async t => {
  const f = fixture(t, { ARKTS_SEMANTIC_MUTATION_TIMEOUT_MS: "500" })
  await ready(f)
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness(true)
  for (let i = 1; i <= 4; i++) {
    f.fault("mutation")
    f.session.changeDocument({ uri: f.uri("Main.ets"), version: i + 1,
      text: "// mutation " + i + "\n" + f.sources["Main.ets"] })
    await waitFor(() => i < 4
      ? f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i
      : f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "mutation recovery " + i)
  }
  assert.equal((await f.readiness(true)).error?.code, -32803, "elapsed time and successful ACKs cannot reset the build-success budget")
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 4)
})

test("shutdown while compiler JavaScript never returns exits and releases the only Worker", { timeout: 15_000 }, async t => {
  const f = fixture(t)
  await ready(f)
  configure(f); await f.readiness(false)
  f.fault("resolution")
  const request = f.session.request("textDocument/definition", definition(f), { timeoutMs: 5000 })
  await waitFor(() => fs.existsSync(path.join(f.directory, "unresponsive-entered.json")), "resolution entry")
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  const terminal = await request
  assert.equal(terminal.jsonrpc, "2.0", "shutdown must settle the in-flight request")
  assert.equal(f.session.transport.transcriptEntries.filter(({ entry }) =>
    entry.direction === "receive" && entry.id === terminal.id && entry.method === null).length, 1)
  const rows = fs.readFileSync(path.join(f.directory, "worker-lifetime.ndjson"), "utf8").trim().split("\n").map(JSON.parse)
  assert.deepEqual(rows.map(e => e.event), ["created", "exited"])
})

test("recovery buffers are bounded and overflow retires the replacement instead of starting another", { timeout: 15_000 }, async t => {
  const f = fixture(t, { ARKTS_SEMANTIC_MUTATION_TIMEOUT_MS: "5000" })
  await ready(f)
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness(true)
  f.fault("exit", 1, 0, { then: "startup" })
  await waitFor(() => fs.existsSync(path.join(f.directory, "unresponsive-entered.json")), "replacement startup")
  for (let i = 0; i < 33; i++) f.session.openDocument({ uri: f.uri("Extra" + i + ".ets"),
    version: 1, text: "export const value = " + i + "\n" })
  await waitFor(() => f.events().some(e => e.event === "semantic.worker.recovery.buffer-overflow"), "bounded recovery journal")
  assert.equal((await f.readiness(false)).error?.code, -32803)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
})

test("a failed half-open probe cannot chain automatic restarts; another corrected input can recover later", { timeout: 30_000 }, async t => {
  const f = fixture(t, { ARKTS_SEMANTIC_PREPARE_TIMEOUT_MS: "1500" })
  await ready(f)
  for (let i = 1; i <= 4; i++) {
    f.fault("exit", 1, i * 181_000)
    await waitFor(() => i < 4
      ? f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i
      : f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "failure " + i)
  }
  const text = "// corrected input\n" + f.sources["Main.ets"]
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text })
  f.fault("roots", 1, 4 * 181_000)
  assert.equal((await f.readiness(true)).error?.code, -32803)
  await waitFor(() => f.events().filter(e => e.event === "semantic.worker.recovery.retired").length >= 2, "failed probe retirement")
  assert.equal((await f.readiness(true)).error?.code, -32803)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 5)
  f.fault(null, 0, 5 * 181_000)
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// fixed again\n" + text })
  assert.equal((await f.readiness(true)).result?.semanticState, "ready")
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 6)
})

test("invalid deadline configuration never creates an unregistered Worker, including repeated requests", { timeout: 15_000 }, async t => {
  const f = fixture(t, { ARKTS_SEMANTIC_REQUEST_TIMEOUT_MS: "-1" })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 5000)
  for (let i = 0; i < 2; i++) assert.equal((await f.readiness(true)).error?.code, -32803)
  assert.equal(fs.existsSync(path.join(f.directory, "worker-lifetime.ndjson")), false,
    "validate before allocating a Worker; a thrown watchdog constructor must not orphan it")
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 0)
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
})

test("configuration member order alone cannot unlock a stopped recovery circuit", { timeout: 20_000 }, async t => {
  const f = fixture(t)
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk, annotation: "same" } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
  for (let i = 1; i <= 4; i++) {
    f.fault("exit", 1, i * 181_000)
    await waitFor(() => i < 4
      ? f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i
      : f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "failure " + i)
  }
  f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { annotation: "same", path: f.sdk } } } } })
  assert.equal((await f.readiness(true)).error?.code, -32803)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 4)
})

test("intermittent failures on unchanged input cannot replenish the budget through successful builds and expired windows", { timeout: 30_000 }, async t => {
  const f = fixture(t)
  await ready(f)
  for (let i = 1; i <= 3; i++) {
    f.fault("exit", 1, i * 181_000)
    await waitFor(() => f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i, "intermittent recovery " + i)
    assert.equal((await f.readiness(true)).result?.semanticState, "ready")
  }
  f.fault("exit", 1, 4 * 181_000)
  await waitFor(() => f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "unchanged-input circuit")
  assert.equal((await f.readiness(true)).error?.code, -32803)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 4)
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: "// corrected input\n" + f.sources["Main.ets"] })
  assert.equal((await f.readiness(true)).result?.semanticState, "ready", "changed input plus a successful probe restores service")
})

test("cancelling a half-open caller stops waiting while the shared replacement restores its inputs", { timeout: 30_000 }, async t => {
  const f = fixture(t)
  await ready(f)
  for (let i = 1; i <= 4; i++) {
    f.fault("exit", 1, i * 181_000)
    await waitFor(() => i < 4
      ? f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i
      : f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "failure " + i)
  }
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: "// corrected input\n" + f.sources["Main.ets"] })
  f.fault("startup", 1, 4 * 181_000)
  const id = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: "2.0", id, method: "arkts/semanticReadiness", params: { rootUri: f.rootUri, prepare: true } })
  await waitFor(() => fs.existsSync(path.join(f.directory, "unresponsive-entered.json")), "half-open startup")
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
  assert.equal((await f.session.transport.response(id, 1500)).error?.code, -32800)
  fs.writeFileSync(path.join(f.directory, "unresponsive-release"), "release shared restoration")
  assert.equal((await f.readiness(true)).result?.semanticState, "ready")
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 5)
  assert.equal(f.session.transport.transcriptEntries.filter(({ entry }) =>
    entry.direction === "receive" && entry.id === id && entry.method === null).length, 1)
})
