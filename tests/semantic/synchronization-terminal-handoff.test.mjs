import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("a finite cancelled synchronization keeps its recent grace through terminal delivery and serves the reopened document",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/synchronization-terminal-handoff.cjs"))}` })
    const graph = path.join(f.sdk, "ets/graph"), api = path.join(f.sdk, "ets/api")
    fs.mkdirSync(graph, { recursive: true }); fs.mkdirSync(api, { recursive: true })
    fs.writeFileSync(path.join(api, "@ohos.graphGate.d.ts"), "export { Step0 } from '../graph/Edge0'\n")
    for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(graph, `Edge${i}.d.ts`),
      i === 59 ? "export interface Step59 { terminal: number }\n"
        : `export { Step${i + 1} as Step${i} } from './Edge${i + 1}'\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "ready")
    const text = 'import type { Step0 } from "@ohos.graphGate"\n' + f.sources["Main.ets"]
    fs.writeFileSync(path.join(f.directory, "arm-progressing-sync"), "finite")
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 0, text })
    await until(() => fs.existsSync(path.join(f.directory, "progressing-sync-entered.json")))
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: f.uri("Main.ets") } } })
    f.session.documentVersions.delete(f.uri("Main.ets"))
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 0, text })
    const definition = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 23 } }, { timeoutMs: 12_000 })
    assert.deepEqual(definition.result, [{ uri: f.uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }], JSON.stringify(definition))
    const terminals = fs.readFileSync(path.join(f.directory, "terminal-handoff.ndjson"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.deepEqual(terminals.map(x => x.event), ["terminal-produced", "terminal-posted"])
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.unresponsive"))
    const responses = f.session.transport.transcriptEntries.filter(({ entry }) => entry.direction === "receive"
      && entry.id === definition.id && entry.method === null)
    assert.equal(responses.length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("a produced but undelivered cancelled terminal still reaches the original cancellation deadline and recovers once",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/synchronization-terminal-handoff.cjs"))}` })
    const graph = path.join(f.sdk, "ets/graph"), api = path.join(f.sdk, "ets/api")
    fs.mkdirSync(graph, { recursive: true }); fs.mkdirSync(api, { recursive: true })
    fs.writeFileSync(path.join(api, "@ohos.graphGate.d.ts"), "export { Step0 } from '../graph/Edge0'\n")
    fs.writeFileSync(path.join(graph, "Edge0.d.ts"), "export interface Step0 { value: number }\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    fs.writeFileSync(path.join(f.directory, "arm-progressing-sync"), "finite")
    fs.writeFileSync(path.join(f.directory, "drop-handoff-terminal"), "test-only transport loss")
    const text = 'import type { Step0 } from "@ohos.graphGate"\n' + f.sources["Main.ets"]
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 0, text })
    await until(() => fs.existsSync(path.join(f.directory, "progressing-sync-entered.json")))
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: f.uri("Main.ets") } } })
    f.session.documentVersions.delete(f.uri("Main.ets"))
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 0, text })
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 23 } }
    const failed = await f.session.request("textDocument/definition", params)
    assert.equal(failed.error?.code, -32603, JSON.stringify(failed))
    await until(() => f.events().some(e => e.event === "semantic.worker.recovery.complete"))
    const stopped = f.events().find(e => e.event === "semantic.worker.unresponsive")
    assert.equal(stopped.reason, "cancellation-deadline")
    assert.equal(stopped.limitMs, 1000, "the product cancellation deadline is unchanged")
    assert.equal(stopped.terminalState, "sent", "postMessage returning is distinct from parent receipt")
    assert.ok(stopped.cancellationQuietMs >= 1000)
    fs.rmSync(path.join(f.directory, "arm-progressing-sync"))
    fs.rmSync(path.join(f.directory, "drop-handoff-terminal"))
    const recovered = await f.session.request("textDocument/definition", params)
    assert.deepEqual(recovered.result, [{ uri: f.uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }], JSON.stringify(recovered))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

async function until(check) {
  const deadline = Date.now() + 5000
  while (!check()) {
    if (Date.now() > deadline) throw Error("finite compiler synchronization did not start")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
