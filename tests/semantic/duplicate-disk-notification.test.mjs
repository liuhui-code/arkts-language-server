import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("duplicate watched notifications keep an unchanged never-opened root prepared",
  { timeout: 40_000 }, t => unchangedNotification(t, false))

test("duplicate watched notifications preserve an opened caller and its unopened dependency",
  { timeout: 40_000 }, t => unchangedNotification(t, true))

test("same-content opt-out retains the conservative duplicate-notification rebuild",
  { timeout: 40_000 }, t => unchangedNotification(t, false, "0"))

for (const opened of [false, true]) {
  test(`same-size disk writes with colliding timestamps refresh ${opened ? "opened" : "never-opened"} callers`,
    { timeout: 40_000 }, t => changedNotification(t, opened))
}

async function changedNotification(t, opened) {
  const fixture = await startReadinessFixture(t, {
    ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1", ARKTS_SEMANTIC_SESSION_REUSE: "off",
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/duplicate-disk-stat-collision.cjs"))}`,
  })
  const { session, rootUri, uri, sources, events, directory } = fixture
  if (opened) {
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10000)
    assert.deepEqual(diagnostics.params.diagnostics, [])
  }
  const ready = await session.request("arkts/semanticReadiness", { rootUri, prepare: true })
  assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
  const params = { textDocument: { uri: uri("Main.ets") },
    position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 } }
  const expected = start => [{ uri: uri("Unopened.ets"), range: {
    start: { line: 0, character: start }, end: { line: 0, character: start + 12 } } }]
  const first = await session.request("textDocument/definition", params)
  assert.equal(first.error, undefined, JSON.stringify(first))
  assert.deepEqual(first.result, expected(16))
  const file = new URL(uri("Unopened.ets"))
  const before = fs.statSync(file)
  const changed = sources["Unopened.ets"].replace("export function", "export  function")
    .replace("{ return 1 }", "{return 1 }")
  assert.equal(Buffer.byteLength(changed), before.size)
  fs.writeFileSync(file, changed)
  const after = fs.statSync(file)
  assert.deepEqual([after.dev, after.ino, after.size], [before.dev, before.ino, before.size])
  const arm = path.join(directory, "disk-stat-collision.json")
  fs.writeFileSync(arm + ".pending", JSON.stringify({ mtimeMs: before.mtimeMs, ctimeMs: before.ctimeMs }))
  fs.renameSync(arm + ".pending", arm)
  const creates = () => events().filter(event => event.event === "semantic.context.create").length
  const initial = creates()
  assert.equal(initial, 1)
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
  const response = await session.request("textDocument/definition", params)
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(response.result, expected(17))
  assert.equal(creates(), initial + 1, "actual content changes retain conservative context invalidation")
  const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
  assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
  assert.equal(fs.readFileSync(file, "utf8"), changed)
  assert.equal(session.documentVersions.size, opened ? 1 : 0)
  const reads = fs.readFileSync(path.join(directory, "disk-stat-collision.jsonl"), "utf8")
    .trim().split("\n").map(JSON.parse)
  assert(reads.some(read => read.threadId > 0 && read.bytes === before.size
    && read.stack.includes("classifyWatchedSourceChanges")), "the no-op gate must reread actual bytes")
  assert.deepEqual((await session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
}

async function unchangedNotification(t, opened, promotion) {
    const { session, rootUri, uri, sources, events } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1", ARKTS_SEMANTIC_SESSION_REUSE: "off",
      ...(promotion === undefined ? {} : { ARKTS_L02_SAME_CONTENT_PROMOTION: promotion }),
    })
    if (opened) {
      session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
      const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10000)
      assert.deepEqual(diagnostics.params.diagnostics, [])
    }
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    const params = { textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 } }
    const expected = [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }]
    const first = await session.request("textDocument/definition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.deepEqual(first.result, expected)
    const file = new URL(uri("Unopened.ets"))
    const before = fs.readFileSync(file)
    const identity = () => {
      const stat = fs.statSync(file)
      return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs]
    }
    const beforeIdentity = identity()
    const creates = () => events().filter(event => event.event === "semantic.context.create")
    const initial = creates()
    assert.equal(initial.length, 1, JSON.stringify(events().map(event => event.event)))
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    const response = await session.request("textDocument/definition", params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, expected)
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.deepEqual(fs.readFileSync(file), before)
    assert.deepEqual(identity(), beforeIdentity)
    assert.equal(session.documentVersions.size, opened ? 1 : 0)
    assert.equal(creates().length, initial.length + (promotion === "0" ? 1 : 0), JSON.stringify({
      invariant: "unchanged bytes and physical identity must not recreate a prepared context",
      contextEvents: events().filter(event => ["semantic.context.create", "semantic.context.evict"].includes(event.event)),
      preparations: events().filter(event => event.event === "semantic.prepare.complete"),
    }))
    assert.deepEqual((await session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
}
