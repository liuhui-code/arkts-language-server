import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("framed LSP regains indexed reference freshness after a No-op qualification at the same data head", async t => {
  const fixture = createReadinessFixture(t, { ARKTS_INDEX_CATALOG_TRACE: "1", ARKTS_MEMORY_BUDGET_MB: undefined })
  const { session, workspace, uri, sources, events } = fixture
  sources["Main.ets"] = 'import { Thing } from "./Unopened"\nexport const result = new Thing()\n'
  sources["Unopened.ets"] = "export class Thing {}\n"
  for (const [name, text] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), text)
  const persistEvidence = () => {
    const evidence = process.env.ARKTS_TEST_EVIDENCE_DIR
    if (!evidence) return
    fs.mkdirSync(evidence, { recursive: true })
    fs.writeFileSync(path.join(evidence, "noop-qualification-events.json"), JSON.stringify(events(), null, 2))
  }
  try {
  await initializeReadinessFixture(fixture)
  const target = uri("Main.ets")
  session.openDocument({ uri: target, version: 1, text: sources["Main.ets"] })
  const references = () => session.request("textDocument/references", {
    textDocument: { uri: target }, position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("Thing") },
    context: { includeDeclaration: true },
  }, { timeoutMs: 10_000 })
  const first = await references()
  assert.equal(first.error, undefined, JSON.stringify(first))
  assert.ok(first.result.some(item => item.uri === uri("Unopened.ets")))
  assert.ok(first.result.some(item => item.uri === target))
  const cold = events().find(e => e.event === "index.maintenance.phase" && e.outcome === "qualified")
  assert.ok(cold)
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
    changes: [{ uri: uri("Unopened.ets"), type: 2 }],
  } })
  const deadline = Date.now() + 10_000
  let noop
  while (Date.now() < deadline) {
    noop = events().find(e => e.event === "index.maintenance.phase" && e.outcome === "qualified"
      && e.inputRevision > cold.inputRevision)
    if (noop) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(noop, "same-content notification must receive a new complete qualification")
  assert.equal(noop.head, cold.head, "No-op must not fake a data generation advance")
  assert.equal(noop.writtenDocuments, 0)
  assert.equal(noop.dataPublished, false)
  const boundary = events().length
  const second = await references()
  assert.equal(second.error, undefined, JSON.stringify(second))
  assert.deepEqual(second.result, first.result)
  const subsequent = events().slice(boundary)
  assert.equal(subsequent.filter(e => e.event === "references.index.fallback" && e.reason === "workspace-changed").length, 0)
  assert.ok(subsequent.some(e => e.event === "references.index.recovered"),
    "the new complete input receipt must recover dirty freshness without a fabricated data head")
  await session.close()
  } finally { persistEvidence() }
})
