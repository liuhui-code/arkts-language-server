import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("completion crosses queued background reads without starving the oldest diagnosis",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_COOPERATIVE: "1",
    })
    const files = { ...f.sources, "OtherMain.ets": f.sources["Main.ets"],
      "DiagnosticA.ets": 'const brokenA: number = "wrong"\n',
      "DiagnosticB.ets": 'const brokenB: number = "wrong"\n' }
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(f.workspace, name), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    const diagnostic = name => f.session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === f.uri(name), 10_000)
    for (const name of ["Main.ets", "OtherMain.ets"]) {
      f.session.openDocument({ uri: f.uri(name), version: 1, text: files[name] })
      assert.equal((await diagnostic(name)).params.version, 1)
    }
    const firstDiagnosis = diagnostic("DiagnosticA.ets"), secondDiagnosis = diagnostic("DiagnosticB.ets")
    let secondPublished = false, highlightPublished = false
    void secondDiagnosis.then(() => { secondPublished = true })
    for (const name of ["DiagnosticA.ets", "DiagnosticB.ets"])
      f.session.openDocument({ uri: f.uri(name), version: 1, text: files[name] })
    await until(() => f.events().some(e => e.event === "semantic.test.diagnose.hold.start"))
    await f.session.transport.notification("window/logMessage", message => message.params.message
      .includes(`diagnostics test delay settled ${f.uri("DiagnosticB.ets")}`), 10_000)
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 } }
    const highlight = f.session.request("textDocument/documentHighlight", params)
    void highlight.then(() => { highlightPublished = true })
    const typeDefinition = f.session.request("textDocument/typeDefinition", params)
    const completion = f.session.request("textDocument/completion", params)
    const following = f.session.request("textDocument/completion", {
      ...params, textDocument: { uri: f.uri("OtherMain.ets") } })
    const first = await completion
    const secondPublishedAtFirst = secondPublished, highlightPublishedAtFirst = highlightPublished
    const next = await following
    const secondPublishedAtFollowing = secondPublished
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.ok(first.result.items.some(item => item.label === "neverQueried"), JSON.stringify(first))
    assert.equal(next.error, undefined, JSON.stringify(next))
    assert.deepEqual(next.result.items.map(({ label, kind }) => ({ label, kind })),
      first.result.items.map(({ label, kind }) => ({ label, kind })))
    assert.equal(secondPublishedAtFirst, false, "first completion must bypass a still-queued diagnosis")
    assert.equal(highlightPublishedAtFirst, false, "queued highlights must not hide the pending completion")
    assert.equal(secondPublishedAtFollowing, true, "a second completion cannot starve that same diagnosis")
    assert.equal((await highlight).error, undefined)
    assert.equal((await typeDefinition).error, undefined)
    for (const message of await Promise.all([firstDiagnosis, secondDiagnosis])) {
      assert.equal(message.params.version, 1)
      assert.ok(message.params.diagnostics.some(d => d.code === 2322))
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })

async function until(check) {
  const deadline = Date.now() + 7000
  while (!check()) {
    if (Date.now() > deadline) throw Error("diagnostic did not enter the controlled hold")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
