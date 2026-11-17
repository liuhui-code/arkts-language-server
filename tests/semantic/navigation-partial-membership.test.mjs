import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const stableDirectoryIds of [true, false]) {
test(`complete catalog queries preserve freshness and recover after unnotified deletion (stable-directory-ids=${stableDirectoryIds})`,
  { timeout: 60_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      // Keep initialization anchored outside noise; filesystem enumeration order is unspecified.
      ARKTS_TEST_MEMBERSHIP_FIRST_SOURCE: "Main.ets",
      ARKTS_TEST_WEAK_DIRECTORY_IDS: stableDirectoryIds ? "0" : "1",
      ARKTS_TEST_READ_STACKS: "1",
      ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}` })
    const source = f.sources["Main.ets"] + "unknownMember()\n"
    f.sources["Main.ets"] = source
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), source)
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 32; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), `export const unused${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const preparation = await f.session.transport.notification("arkts/semanticPreparation",
      m => m.params.phase === "complete", 20_000)
    assert.equal(preparation.params.report.semanticState, "ready", JSON.stringify(preparation.params))
    const observations = () => fs.readFileSync(path.join(f.directory, "partial-initialization.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const scans = () => observations().filter(e => e.kind === "noise-directory-open").length
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: source })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    const before = scans(), timings = []
    const bodyReadsBefore = observations().filter(e => e.kind === "noise-read").length
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 3 } }
    for (let i = 0; i < 3; i++) {
      const started = performance.now()
      const response = await f.session.request("textDocument/definition", params, { timeoutMs: 15_000 })
      timings.push(performance.now() - started)
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [], "complete scope certifies the absent symbol")
    }
    const after = scans()
    t.diagnostic(JSON.stringify({ parent: "04282ed", files: 34, scansBefore: before, scansAfter: after, timings }))
    assert.equal(after, stableDirectoryIds ? before : before + 3,
      "only a proven native directory identity may replace full enumeration")
    const currentReads = observations().filter(e => e.kind === "noise-read").slice(bodyReadsBefore)
    t.diagnostic(JSON.stringify({ publicationReads: currentReads.length, firstCaller: currentReads[0]?.caller.slice(0, 2) }))
    assert.equal(currentReads.filter(row => row.scope !== "publication-fence").length, 0,
      "repeated complete-scope queries reuse compiler source bodies")
    assert.equal(currentReads.filter(row => row.scope === "publication-fence").length, 3 * 32,
      "each complete empty answer still reads every actual input for its independent publication fence")

    // No directory-entry change: a directory-only fast fence must not certify
    // the previous empty answer after an existing source becomes a global script.
    const directoryBefore = fs.statSync(noise, { bigint: true })
    fs.writeFileSync(path.join(noise, "Unused7.ts"), "declare function unknownMember(): number\n")
    assert.equal(fs.statSync(noise, { bigint: true }).mtimeNs, directoryBefore.mtimeNs,
      "this control changes existing source bytes, not directory entries")
    const bodyChanged = await f.session.request("textDocument/definition", params)
    if (bodyChanged.error) assert.equal(bodyChanged.error.code, -32803, JSON.stringify(bodyChanged))
    else assert.deepEqual(bodyChanged.result, [{ uri: f.uri("noise/Unused7.ts"), range: {
      start: { line: 0, character: 17 }, end: { line: 0, character: 30 } } }])
    const bodyCurrent = await f.session.request("textDocument/definition", params)
    assert.equal(bodyCurrent.error, undefined, JSON.stringify(bodyCurrent))
    assert.deepEqual(bodyCurrent.result, [{ uri: f.uri("noise/Unused7.ts"), range: {
      start: { line: 0, character: 17 }, end: { line: 0, character: 30 } } }])

    fs.writeFileSync(path.join(noise, "Unused7.ts"), "export const unused7 = 7\n")
    const restoredBody = await f.session.request("textDocument/definition", params)
    if (restoredBody.error) assert.equal(restoredBody.error.code, -32803, JSON.stringify(restoredBody))
    else assert.deepEqual(restoredBody.result, [])
    assert.deepEqual((await f.session.request("textDocument/definition", params)).result, [])

    // No watched-files notification: a retained complete namespace proof must detect actual namespace changes.
    fs.rmSync(noise, { recursive: true })
    fs.writeFileSync(path.join(f.workspace, "Ambient.ts"), "declare function unknownMember(): number\n")
    const changedNamespace = await f.session.request("textDocument/definition", params, { timeoutMs: 15_000 })
    // Unlike the former never-built capacity-partial owner, this complete owner
    // already consumed the prior namespace. ADR0036 must reject that old proof.
    if (changedNamespace.error) assert.equal(changedNamespace.error.code, -32803, JSON.stringify(changedNamespace))
    else assert.deepEqual(changedNamespace.result, [{ uri: f.uri("Ambient.ts"), range: {
      start: { line: 0, character: 17 }, end: { line: 0, character: 30 } } }])
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

}

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
