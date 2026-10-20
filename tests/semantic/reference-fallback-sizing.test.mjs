import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const [configured, target, fillers, lastRoots] of [[undefined, 1024, 1040, 18], ["2048", 2048, 2080, 34]]) {
test(`conservative fallback uses the ${configured ? "configured" : "default"} ${target}-root soft target with complete references`,
  { timeout: 60_000 }, async t => {
    const { session, sdk, workspace, rootUri, uri, events } = createReadinessFixture(t, {
      ARKTS_REFERENCES_STRATEGY: "batched", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_REFERENCES_BATCH_ROOTS: configured,
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0" })
    for (let index = 0; index < fillers; index++) fs.writeFileSync(
      path.join(workspace, `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    assert.equal(prepared.params.report.coverage.projectSources, fillers + 2)
    const before = events().length
    const response = await session.request("textDocument/references", {
      textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration: true } }, { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
      { uri: uri("Unopened.ets"), range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } },
    ])
    const observed = events().slice(before)
    const plan = observed.find(row => row.event === "references.plan.complete")
    assert.equal(plan?.candidateMode, "conservative")
    assert.equal(plan.candidateFiles, fillers + 2)
    assert.equal(plan.batchCount, 2, "the candidate set plus the pinned source requires two target-sized batches")
    assert.deepEqual(observed.filter(row => row.event === "references.batch.start").map(row => row.batchRootFiles), [target + 1, lastRoots],
      "the pinned source is additional to the candidate soft target")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}
