import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

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
      let secondPublished = false
      const first = diagnostic("DiagnosticA.ets"), second = diagnostic("DiagnosticB.ets")
      void second.then(() => { secondPublished = true })
      for (const letter of ["A", "B"]) f.session.openDocument({ uri: f.uri(`Diagnostic${letter}.ets`), version: 1,
        text: fs.readFileSync(path.join(f.workspace, `Diagnostic${letter}.ets`), "utf8") })
      await until(() => f.events().some(e => e.event === "semantic.test.diagnose.hold.start")
        && f.events().filter(e => e.event === "semantic.queue.enqueued" && e.method === "diagnose"
          && e.uri.includes("/Diagnostic")).length === 2)
      const response = await f.session.request(operation === "outgoingCalls"
        ? "callHierarchy/outgoingCalls" : `textDocument/${operation}`, item ? { item } : params)
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.equal(secondPublished, false, "all foreground classes use bounded priority")
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
