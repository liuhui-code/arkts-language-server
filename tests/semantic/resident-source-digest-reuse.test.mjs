import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("unchanged compiler source bytes retain their digest across re-observation", { timeout: 40_000 }, async t => {
  const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/resident-source-digest-count.cjs"))}` })
  const noise = path.join(f.workspace, "noise")
  fs.mkdirSync(noise)
  for (let i = 0; i < 64; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), "export {}\n")
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
  const ready = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
  assert.equal(ready.params.report.semanticState, "ready")
  const uri = f.uri("Main.ets"), params = { textDocument: { uri }, position: { line: 1, character: 25 } }
  f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
  const references = async () => {
    const result = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(result.error, undefined, JSON.stringify(result))
    const location = (uri, line, start, end) => ({ uri, range: {
      start: { line, character: start }, end: { line, character: end } } })
    const sorted = rows => rows.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    assert.deepEqual(sorted(result.result), sorted([
      location(uri, 0, 9, 21), location(uri, 1, 22, 34), location(f.uri("Unopened.ets"), 0, 16, 28),
    ]))
  }
  const rows = () => fs.readFileSync(path.join(f.directory, "resident-source-digests.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
  await references()
  const before = rows(), warmIds = new Set(before.flatMap(row => row.sources))
  assert.equal(warmIds.size, 64)
  assert.ok(before.some(row => row.hashes === 64), "the real hash implementation must be observed")
  f.session.changeDocument({ uri, version: 2, text: f.sources["Main.ets"] + "// unrelated body edit\n" })
  assert.equal((await f.session.request("textDocument/definition", params)).error, undefined)
  const afterDefinition = rows()
  const definitions = afterDefinition.filter(row => row.method === "define")
  t.diagnostic(JSON.stringify(definitions))
  assert.ok(definitions.some(row => row.evidenceReplaced >= 64 && row.bytesChanged === 0),
    "actual re-observation replaces evidence wrappers without changing source bytes")
  await references()
  const repeated = rows().slice(afterDefinition.length)
  t.diagnostic(JSON.stringify(repeated))
  assert.ok(repeated.some(row => row.calls >= 64))
  assert.ok(repeated.flatMap(row => row.sources).every(id => warmIds.has(id)))
  assert.equal(repeated.reduce((sum, row) => sum + row.hashes, 0), 0,
    "new evidence wrappers must not invalidate a digest of the same actual SourceFile text")
  const changedPath = path.join(noise, "Unused0.ts"), changedUri = f.uri("noise/Unused0.ts")
  fs.writeFileSync(changedPath, 'import { neverQueried } from "../Unopened"\nexport const added = neverQueried()\n')
  // This disk edit precedes admission of the NEW request. It may safely refresh
  // before computation; a warm pure digest must never return the previous3hits.
  const recovered = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
  assert.equal(recovered.error, undefined, JSON.stringify(recovered))
  assert.equal(recovered.result.length, 5)
  assert.deepEqual(recovered.result.filter(item => item.uri === changedUri).map(item => item.range), [
    { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } },
    { start: { line: 1, character: 21 }, end: { line: 1, character: 33 } },
  ])
  assert.ok(rows().slice(afterDefinition.length).some(row => row.hashes > 0), "changed actual source bytes require a new digest")
})
