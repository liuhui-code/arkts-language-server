import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("full readiness trace keeps every source span without one synchronous disk append per event",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined, ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/readiness-log-write-counter.cjs"))}` })
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let index = 0; index < 128; index++) fs.writeFileSync(path.join(noise, `Unused${index}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const ready = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    assert.equal(ready.params.report.semanticState, "ready")
    assert.equal(ready.params.report.coverage.projectSources, 130)
    const uri = f.uri("Main.ets")
    f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
    const response = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 24 } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri("Unopened.ets"),
      range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    const checks = f.events().filter(e => e.event.startsWith("semantic.readiness.input-check."))
    const starts = checks.filter(e => e.event.endsWith(".start"))
    const completes = checks.filter(e => e.event.endsWith(".complete"))
    assert.ok(starts.length >= 130)
    assert.equal(completes.length, starts.length)
    assert.deepEqual(completes.map(e => e.sourcePath), starts.map(e => e.sourcePath))
    const count = JSON.parse(fs.readFileSync(path.join(f.directory, "readiness-log-writes.json"), "utf8"))
    assert.equal(count.pid, f.session.transport.child.pid)
    assert.equal(count.events, checks.length, "no trace event is silently dropped")
    t.diagnostic(JSON.stringify(count))
    assert.ok(count.writes <= Math.ceil(count.events / 8) + 4, `bounded batches must replace per-line appends: ${JSON.stringify(count)}`)
  })
