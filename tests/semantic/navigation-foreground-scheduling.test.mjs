import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("definition crosses automatic reads with bounded fairness and current results",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_SEMANTIC_QUEUE_TRACE: "1", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/Held.ets",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1600", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_COOPERATIVE: "1",
    })
    const names = Array.from({ length: 8 }, (_, i) => `Other${i}.ets`)
    for (const name of names) fs.writeFileSync(path.join(f.workspace, name), f.sources["Main.ets"])
    fs.writeFileSync(path.join(f.workspace, "Held.ets"), 'const wrong: number = "bad"\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    for (const name of ["Main.ets", ...names]) {
      f.session.openDocument({ uri: f.uri(name), version: 1, text: f.sources["Main.ets"] })
      await f.session.transport.notification("textDocument/publishDiagnostics",
        m => m.params.uri === f.uri(name) && m.params.version === 1, 10_000)
    }
    f.session.openDocument({ uri: f.uri("Held.ets"), version: 1, text: 'const wrong: number = "bad"\n' })
    await until(() => f.events().some(e => e.event === "semantic.test.diagnose.hold.start"))
    const start = f.events().length, background = []
    for (const name of names.slice(0, 3)) background.push(f.session.request("textDocument/documentHighlight", {
      textDocument: { uri: f.uri(name) }, position: { line: 1, character: 25 },
    }))
    for (const name of names) background.push(f.session.request("textDocument/codeAction", {
      textDocument: { uri: f.uri(name) }, range: { start: { line: 1, character: 20 }, end: { line: 1, character: 26 } },
      context: { diagnostics: [] },
    }))
    await until(() => f.events().slice(start).filter(e => e.event === "semantic.queue.enqueued").length >= 11)
    const navigation = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 },
    })
    assert.equal(navigation.error, undefined, JSON.stringify(navigation))
    assert.deepEqual(navigation.result, [{ uri: f.uri("Unopened.ets"),
      range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
    for (const response of await Promise.all(background)) assert.equal(response.error, undefined, JSON.stringify(response))
    const dispatched = f.events().slice(start).filter(e => e.event === "semantic.queue.worker.dispatch.started")
    const index = dispatched.findIndex(e => e.method === "define" && e.uri === f.uri("Main.ets"))
    assert.equal(index, 0, `queued automatic reads must not hide navigation: ${JSON.stringify(dispatched)}`)
    assert.equal(dispatched[1].method, "documentHighlights", "the bypassed oldest read still runs next")
    assert.equal(dispatched.length, 12, "all queued operations settle, not just navigation")
    assert.equal(new Set(dispatched.map(e => e.epoch)).size, 1)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    const diagnostic = await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Held.ets") && m.params.version === 1, 10_000)
    assert.ok(diagnostic.params.diagnostics.some(d => d.code === 2322))
  })

async function until(check) {
  const deadline = Date.now() + 7000
  while (!check()) {
    if (Date.now() > deadline) throw Error("controlled queue did not reach its admission boundary")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
