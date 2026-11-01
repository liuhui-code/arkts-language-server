import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("missing definitions do not rescan an unchanged capacity-partial catalog and recover after unnotified deletion",
  { timeout: 60_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}` })
    const source = f.sources["Main.ets"] + "unknownMember()\n"
    f.sources["Main.ets"] = source
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), source)
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 20_001; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), `export const unused${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const preparation = await f.session.transport.notification("arkts/semanticPreparation",
      m => m.params.phase === "complete", 20_000)
    assert.ok(preparation.params.report.unavailableReasons.includes("project-membership-incomplete"))
    const observations = () => fs.readFileSync(path.join(f.directory, "partial-initialization.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const scans = () => observations().filter(e => e.kind === "noise-directory-open").length
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: source })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    const before = scans(), timings = []
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 3 } }
    for (let i = 0; i < 3; i++) {
      const started = performance.now()
      const response = await f.session.request("textDocument/definition", params, { timeoutMs: 15_000 })
      timings.push(performance.now() - started)
      assert.equal(response.error?.code, -32803, JSON.stringify(response))
      assert.equal(response.result, undefined, "unknown scope never becomes a truncated empty success")
    }
    const after = scans()
    t.diagnostic(JSON.stringify({ parent: "04282ed", files: 20_003, scansBefore: before, scansAfter: after, timings }))
    assert.equal(after, before, "an unchanged namespace keeps the actual capacity failure proof; no repeated full enumeration")
    assert.equal(observations().filter(e => e.kind === "noise-read").length, 0,
      "a rejected full-scope fallback cannot preload unrelated source bodies")

    // No watched-files notification: a retained capacity proof must detect actual namespace changes.
    fs.rmSync(noise, { recursive: true })
    fs.writeFileSync(path.join(f.workspace, "Ambient.ts"), "declare function unknownMember(): number\n")
    const recovered = await f.session.request("textDocument/definition", params, { timeoutMs: 15_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [{ uri: f.uri("Ambient.ts"), range: {
      start: { line: 0, character: 17 }, end: { line: 0, character: 30 },
    } }])
    const valid = await f.session.request("textDocument/definition", {
      ...params, position: { line: 1, character: 25 },
    })
    assert.deepEqual(valid.result, [{ uri: f.uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

for (const first of ["Main.ets", "Repair.ts"]) {
  test(`a source-unavailable catalog retries after the same file is repaired without namespace changes (first=${first})`,
    { timeout: 30_000 }, async t => {
      const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
        ARKTS_TEST_MEMBERSHIP_FIRST_SOURCE: first,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}` })
      const source = f.sources["Main.ets"] + "unknownMember()\n"
      fs.writeFileSync(path.join(f.workspace, "Main.ets"), source)
      const repaired = path.join(f.workspace, "Repair.ts")
      fs.writeFileSync(repaired, " ".repeat(4 * 1024 * 1024 + 1))
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const preparation = await f.session.transport.notification("arkts/semanticPreparation",
        m => m.params.phase === "complete", 10_000)
      assert.deepEqual(preparation.params.report.unavailableReasons,
        [first === "Repair.ts" ? "workspace-sources-unavailable" : "project-membership-incomplete"])
      assert.equal(preparation.params.report.semanticState, "degraded")
      f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: source })
      const anchored = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: true })
      assert.equal(anchored.error, undefined, JSON.stringify(anchored))
      assert.deepEqual(anchored.result.unavailableReasons, ["project-membership-incomplete"])
      const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 3 } }
      const failed = await f.session.request("textDocument/definition", params)
      assert.equal(failed.error?.code, -32803, JSON.stringify(failed))
      const namespace = fs.statSync(f.workspace, { bigint: true })
      fs.writeFileSync(repaired, "declare function unknownMember(): number\n")
      assert.equal(fs.statSync(f.workspace, { bigint: true }).mtimeNs, namespace.mtimeNs,
        "repair only the existing file body; a directory-stamp-only negative cache would stay poisoned")
      const current = await f.session.request("textDocument/definition", params)
      assert.equal(current.error, undefined, JSON.stringify(current))
      assert.deepEqual(current.result, [{ uri: f.uri("Repair.ts"), range: {
        start: { line: 0, character: 17 }, end: { line: 0, character: 30 },
      } }])
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    })
}
