import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("close/reopen during a progressing compiler commit retains one Worker and serves current foreground queries",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/progressing-synchronization.cjs"))}` })
    const graph = path.join(f.sdk, "ets/graph"), api = path.join(f.sdk, "ets/api")
    fs.mkdirSync(graph, { recursive: true }); fs.mkdirSync(api, { recursive: true })
    fs.writeFileSync(path.join(api, "@ohos.graphGate.d.ts"), "export { Step0 } from '../graph/Edge0'\n")
    for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(graph, `Edge${i}.d.ts`),
      i === 59 ? "export interface Step59 { terminal: number }\n"
        : `export { Step${i + 1} as Step${i} } from './Edge${i + 1}'\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const text = 'import type { Step0 } from "@ohos.graphGate"\n' + f.sources["Main.ets"]
    fs.writeFileSync(path.join(f.directory, "arm-progressing-sync"), "armed")
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 0, text })
    const limit = Date.now() + 5000
    while (!fs.existsSync(path.join(f.directory, "progressing-sync-entered.json"))) {
      if (Date.now() > limit) throw Error("background diagnosis did not enter SDK graph synchronization")
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: f.uri("Main.ets") } } })
    f.session.documentVersions.delete(f.uri("Main.ets"))
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 0, text })
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 23 } }
    const definition = await f.session.request("textDocument/definition", params, { timeoutMs: 12_000 })
    assert.deepEqual(definition.result, [{ uri: f.uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }], JSON.stringify(definition))
    const highlights = await f.session.request("textDocument/documentHighlight", params)
    assert.equal(highlights.error, undefined, JSON.stringify(highlights))
    assert.ok(highlights.result.length > 0)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.unresponsive"))
    assert.ok(!f.events().some(e => e.event === "semantic.worker.recovery.complete"))
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })

test("checkpoint activity cannot extend the absolute execution deadline of a nonreturning synchronization",
  { timeout: 20_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_SEMANTIC_REQUEST_TIMEOUT_MS: "1800", ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "5000",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/progressing-synchronization.cjs"))}` })
    const graph = path.join(f.sdk, "ets/graph"), api = path.join(f.sdk, "ets/api")
    fs.mkdirSync(graph, { recursive: true }); fs.mkdirSync(api, { recursive: true })
    fs.writeFileSync(path.join(api, "@ohos.graphGate.d.ts"), "export { Step0 } from '../graph/Edge0'\n")
    fs.writeFileSync(path.join(graph, "Edge0.d.ts"), "export interface Step0 { value: number }\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    fs.writeFileSync(path.join(f.directory, "arm-progressing-sync"), "endless")
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1,
      text: 'import type { Step0 } from "@ohos.graphGate"\n' + f.sources["Main.ets"] })
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 23 } }
    const id = f.session.nextRequestId++
    f.session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/definition", params })
    let limit = Date.now() + 5000
    while (!fs.existsSync(path.join(f.directory, "progressing-sync-entered.json"))) {
      if (Date.now() > limit) throw Error("missing controlled nonreturning sync")
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await f.session.transport.response(id, 5000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    limit = Date.now() + 5000
    while (!f.events().some(e => e.event === "semantic.worker.recovery.complete")) {
      if (Date.now() > limit) throw Error("absolute deadline did not recover the Worker")
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    const stopped = f.events().find(e => e.event === "semantic.worker.unresponsive")
    assert.equal(stopped.reason, "execution-deadline")
    assert.equal(stopped.limitMs, 1800)
    assert.ok(stopped.activitySequence > 0)
    fs.rmSync(path.join(f.directory, "arm-progressing-sync"))
    const fresh = await f.session.request("textDocument/definition", params)
    assert.equal(fresh.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(fresh))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
    const terminals = f.session.transport.transcriptEntries.filter(({ entry }) =>
      entry.direction === "receive" && entry.id === id && entry.method === null)
    assert.equal(terminals.length, 1)
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })
