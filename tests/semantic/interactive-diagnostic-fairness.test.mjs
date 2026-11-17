import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("issued completion details run before queued diagnoses while every current diagnosis still publishes",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_COOPERATIVE: "1" })
    const names = "ABCDEFGH".split("").map(letter => `Diagnostic${letter}.ets`)
    for (const [i, name] of names.entries()) fs.writeFileSync(path.join(f.workspace, name), `const broken${i}: number = "wrong"\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    await diagnostic("Main.ets")
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 } }
    const list = await f.session.request("textDocument/completion", params)
    const item = list.result.items.find(x => x.label === "neverQueried")
    assert.ok(item?.data, JSON.stringify(list))
    let queuedDiagnosisPublished = false
    const diagnoses = names.map(name => diagnostic(name))
    void diagnoses[1].then(() => { queuedDiagnosisPublished = true })
    for (const name of names) f.session.openDocument({ uri: f.uri(name), version: 1,
      text: fs.readFileSync(path.join(f.workspace, name), "utf8") })
    await until(() => f.events().some(e => e.event === "semantic.test.diagnose.hold.start")
      && f.events().filter(e => e.event === "semantic.queue.enqueued" && e.method === "diagnose"
        && e.uri.includes("/Diagnostic")).length === 8)
    const details = await f.session.request("completionItem/resolve", item)
    assert.equal(details.error, undefined, JSON.stringify(details))
    assert.match(details.result.detail, /neverQueried\(\): number/)
    assert.equal(queuedDiagnosisPublished, false, "details must bypass a queued diagnosis, not only be called interactive")
    for (const d of await Promise.all(diagnoses)) {
      assert.equal(d.params.version, 1)
      assert.ok(d.params.diagnostics.some(x => x.code === 2322), JSON.stringify(d))
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    function diagnostic(name) {
      return f.session.transport.notification("textDocument/publishDiagnostics",
        m => m.params.uri === f.uri(name) && m.params.version === 1, 10_000)
    }
  })

for (const operation of ["hover", "signatureHelp", "documentSymbol", "documentHighlight", "prepareCallHierarchy", "outgoingCalls"]) {
  test(`${operation} uses the same finite foreground policy and preserves current diagnostics`,
    { timeout: 30_000 }, async t => {
      const f = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_SEMANTIC_QUEUE_TRACE: "1",
        ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
        ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_COOPERATIVE: "1" })
      const main = 'import { neverQueried } from "./Unopened"\nexport function launch() { return neverQueried() }\n'
      fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
      for (const letter of ["A", "B"]) fs.writeFileSync(path.join(f.workspace, `Diagnostic${letter}.ets`),
        `const broken${letter}: number = "wrong"\n`)
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
      f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
      await diagnostic("Main.ets")
      const position = operation === "prepareCallHierarchy" || operation === "outgoingCalls"
        ? { line: 1, character: 18 } : { line: 1, character: operation === "signatureHelp"
          ? main.split("\n")[1].indexOf("neverQueried(") + "neverQueried(".length : 35 }
      const params = { textDocument: { uri: f.uri("Main.ets") }, position }
      let item
      if (operation === "outgoingCalls") {
        const prepared = await f.session.request("textDocument/prepareCallHierarchy", params)
        item = prepared.result?.find(x => x.name === "launch")
        assert.ok(item, JSON.stringify(prepared))
      }
      const first = diagnostic("DiagnosticA.ets"), second = diagnostic("DiagnosticB.ets")
      for (const letter of ["A", "B"]) f.session.openDocument({ uri: f.uri(`Diagnostic${letter}.ets`), version: 1,
        text: fs.readFileSync(path.join(f.workspace, `Diagnostic${letter}.ets`), "utf8") })
      await until(() => f.events().some(e => e.event === "semantic.test.diagnose.hold.start")
        && f.events().filter(e => e.event === "semantic.queue.enqueued" && e.method === "diagnose"
          && e.uri.includes("/Diagnostic")).length === 2)
      const eventStart = f.events().length
      const response = await f.session.request(operation === "outgoingCalls"
        ? "callHierarchy/outgoingCalls" : `textDocument/${operation}`, item ? { item } : params)
      assert.equal(response.error, undefined, JSON.stringify(response))
      if (operation === "hover") assert.match(response.result.contents.value, /neverQueried/)
      else if (operation === "signatureHelp") assert.match(response.result.signatures[0].label, /neverQueried\(\): number/)
      else if (operation === "documentSymbol") assert.ok(response.result.some(x => x.name === "launch"))
      else if (operation === "documentHighlight") assert.ok(response.result.length > 0)
      else if (operation === "prepareCallHierarchy") assert.equal(response.result[0].name, "launch")
      else assert.ok(response.result.some(x => x.to.name === "neverQueried" && x.to.uri === f.uri("Unopened.ets")))
      for (const d of await Promise.all([first, second])) {
        assert.equal(d.params.version, 1)
        assert.ok(d.params.diagnostics.some(x => x.code === 2322))
      }
      // A public response can still be validating unopened result files while
      // the Worker starts the next diagnosis. Assert the scheduling boundary.
      const workerMethod = { documentSymbol: "documentSymbols", documentHighlight: "documentHighlights" }[operation] ?? operation
      const dispatches = f.events().slice(eventStart).filter(e => e.event === "semantic.queue.worker.dispatch.started")
      const foreground = dispatches.findIndex(e => e.method === workerMethod && e.uri === f.uri("Main.ets"))
      const background = dispatches.findIndex(e => e.method === "diagnose" && e.uri === f.uri("DiagnosticB.ets"))
      assert.ok(foreground >= 0 && background >= 0, JSON.stringify(dispatches))
      assert.ok(foreground < background, "every foreground class must bypass the queued diagnosis")
      function diagnostic(name) {
        return f.session.transport.notification("textDocument/publishDiagnostics",
          m => m.params.uri === f.uri(name) && m.params.version === 1, 10_000)
      }
    })
}

async function until(check) {
  const end = Date.now() + 7000
  while (!check()) {
    if (Date.now() > end) throw Error("diagnostic queue did not reach the controlled state")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test("cached reference input certification pauses diagnostics before entering the Worker",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: undefined, ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "4000", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800", ARKTS_TEST_WORKER_DIAGNOSE_HOLD_COOPERATIVE: "1" })
    const broken = 'const broken: number = "wrong"\n'
    fs.writeFileSync(path.join(f.workspace, "DiagnosticA.ets"), broken)
    const responses = []
    const references = async () => {
      const response = await f.session.request("textDocument/references", {
        textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 },
        context: { includeDeclaration: true },
      }, { timeoutMs: 10_000 })
      responses.push(response)
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.equal(response.result.length, 3)
    }
    try {
      await initializeReadinessFixture(f, 3)
      f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
      f.session.openDocument({ uri: f.uri("DiagnosticA.ets"), version: 1, text: broken })
      for (let i = 0; i < 4; i++) await references()
      assert.ok(f.events().some(e => e.event === "references.cache.hit"), "establish an actual warm answer cache")
      // No editor/input mutation after warming: the existing delayed diagnosis
      // becomes active on its own and must not invalidate this cache entry.
      await until(() => {
        const events = f.events()
        return events.filter(e => e.event === "semantic.test.diagnose.hold.start").length
          > events.filter(e => e.event === "semantic.test.diagnose.hold.end").length
      })
      const start = f.events().length
      await references()
      const events = f.events().slice(start)
      const paused = events.findIndex(e => e.event === "references.diagnostics.wait.started")
      const admitted = events.findIndex(e => e.event === "semantic.queue.enqueued" && e.method === "semanticReadiness")
      assert.ok(paused >= 0 && admitted > paused,
        "the current-source cache proof is Worker work and must enter after the diagnostic suspension barrier")
      const holdEnded = events.findIndex(e => e.event === "semantic.test.diagnose.hold.end")
      assert.ok(holdEnded >= 0 && holdEnded < admitted, "the interrupted diagnosis must settle before input certification")
      assert.ok(events.some(e => e.event === "references.cache.hit"), "validate the cached path, not a cache-miss fallback")
      const published = await f.session.transport.notification("textDocument/publishDiagnostics",
        m => m.params.uri === f.uri("DiagnosticA.ets") && m.params.version === 1, 10_000)
      assert.ok(published.params.diagnostics.some(d => d.code === 2322), JSON.stringify(published))
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    } finally {
      if (process.env.ARKTS_TEST_NAMESPACE_EVIDENCE_DIR) {
        const directory = process.env.ARKTS_TEST_NAMESPACE_EVIDENCE_DIR
        fs.mkdirSync(directory, { recursive: true })
        fs.writeFileSync(path.join(directory, "cached-diagnostic-barrier-responses.json"), JSON.stringify(responses, null, 2))
        fs.writeFileSync(path.join(directory, "cached-diagnostic-barrier-events.json"), JSON.stringify(f.events(), null, 2))
      }
    }
  })
