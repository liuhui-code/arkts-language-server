import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

const sorted = values => values.map(value => JSON.stringify(value)).sort()
test("a lexical verifier attempt preserves client cancellation and stale-overlay isolation", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "600" })
  const main = "export function run() { let isolated = 1; return isolated + isolated }\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(main, main.indexOf("isolated") + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: main })
  const send = id => f.session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params })
  const waitForProbe = async previous => {
    const deadline = performance.now() + 5000
    while (performance.now() < deadline) {
      if (f.events().filter(e => e.event === "references.lexical-probe.start").length > previous) return
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    assert.fail("real child LSP request did not reach the lexical verifier")
  }
  send(7001)
  await waitForProbe(0)
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 7001 } })
  const cancelled = await f.session.transport.response(7001, 10_000)
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
  const previous = f.events().filter(e => e.event === "references.lexical-probe.start").length
  send(7002)
  await waitForProbe(previous)
  const edited = main.replace("return isolated + isolated", "return isolated + isolated + isolated")
  f.session.changeDocument({ uri, version: 2, text: edited })
  const stale = await f.session.transport.response(7002, 10_000)
  assert.equal(stale.error?.code, -32801, JSON.stringify(stale))
  const fresh = await f.session.request("textDocument/references", params)
  assert.equal(fresh.error, undefined, JSON.stringify(fresh))
  const expected = [...edited.matchAll(/isolated/g)].map(match => ({ uri, range: {
    start: positionAt(edited, match.index), end: positionAt(edited, match.index + 8) } }))
  assert.deepEqual(sorted(fresh.result), sorted(expected))
  const repeated = await f.session.request("textDocument/references", params)
  assert.equal(repeated.error, undefined, JSON.stringify(repeated))
  assert.deepEqual(sorted(repeated.result), sorted(expected))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})
