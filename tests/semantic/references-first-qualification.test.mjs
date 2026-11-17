import assert from "node:assert/strict"
import test from "node:test"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("the first reference query uses an already matching Native qualification without marking it dirty", async t => {
  const f = createReadinessFixture(t, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_INDEX_CATALOG_TRACE: "1",
  })
  await initializeReadinessFixture(f)
  const uri = f.uri("Main.ets")
  f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
  const response = await f.session.request("textDocument/references", {
    textDocument: { uri }, position: { line: 1, character: 23 }, context: { includeDeclaration: true },
  }, { timeoutMs: 10_000 })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.equal(response.result.length, 3)
  assert.ok(response.result.some(row => row.uri === f.uri("Unopened.ets")))
  const events = f.events()
  assert.ok(events.some(row => row.event === "references.index.accepted"),
    JSON.stringify(events.filter(row => row.event.startsWith("references.index"))))
  assert.equal(events.filter(row => row.event === "references.index.fallback" && row.reason === "workspace-changed").length, 0)
  assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
})
