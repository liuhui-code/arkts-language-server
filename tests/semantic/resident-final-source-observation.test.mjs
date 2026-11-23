import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("complete references retain a later raw source fence without recapturing its first observation", { timeout: 60_000 }, async t => {
  const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/resident-final-source-observation.cjs"))}` })
  const noise = path.join(f.workspace, "noise")
  fs.mkdirSync(noise)
  for (let i = 0; i < 64; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), "export {}\n")
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
  const ready = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
  assert.equal(ready.params.report.semanticState, "ready")
  fs.writeFileSync(path.join(f.directory, "resident-final.jsonl"), "")
  const uri = f.uri("Main.ets")
  f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
  const result = await f.session.request("textDocument/references", { textDocument: { uri },
    position: { line: 1, character: 25 }, context: { includeDeclaration: true } })
  assert.equal(result.error, undefined, JSON.stringify(result))
  const location = (uri, line, start, end) => ({ uri, range: {
    start: { line, character: start }, end: { line, character: end } } })
  const sorted = rows => rows.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(sorted(result.result), sorted([
    location(uri, 0, 9, 21), location(uri, 1, 22, 34), location(f.uri("Unopened.ets"), 0, 16, 28),
  ]))
  const rows = fs.readFileSync(path.join(f.directory, "resident-final.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    .filter(row => row.files === 64)
  assert.ok(rows.length >= 2, JSON.stringify(rows))
  t.diagnostic(JSON.stringify(rows))
  assert.ok(rows.every(row => row.calls === 64), "one later raw source observation per file remains mandatory")
})
