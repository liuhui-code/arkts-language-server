import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("partial membership prewarms SDK without making unrelated initialization sources interactive roots",
  { timeout: 60_000 }, async t => {
    const fixture = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}`,
    })
    const { session, sdk, rootUri, workspace, directory, uri, events } = fixture
    const noise = path.join(workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 20_001; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), `export const unused${i} = ${i}\n`)
    fs.writeFileSync(path.join(workspace, "AAAUnrelatedBarrel.ts"), "export { unrelated } from './Unrelated'\n")
    fs.writeFileSync(path.join(workspace, "Unrelated.ts"), "export const unrelated = 123\n")
    const api = path.join(sdk, "ets/api/@ohos.unused.d.ts")
    fs.mkdirSync(path.dirname(api), { recursive: true })
    fs.writeFileSync(api, "export declare class UnusedSDK { marker: number }\n")
    const observations = () => {
      const file = path.join(directory, "partial-initialization.jsonl")
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const complete = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
    assert.equal(complete.params.report.semanticState, "degraded")
    assert.deepEqual(complete.params.report.unavailableReasons, ["project-membership-incomplete"])
    assert.equal(observations().filter(row => row.kind === "noise-read").length, 0,
      "incomplete whole-project preparation must not read unrelated source bodies")
    assert.equal(observations().filter(row => row.kind === "parse" && row.value === api).length, 1,
      "SDK syntax must be ready even when the project catalog exceeds its bound")
    assert.ok(observations().some(row => row.kind === "parse" && /^lib\..*\.d\.ts$/.test(path.basename(row.value))))
    const query = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 } }
    const definition = await session.request("textDocument/definition", query, { timeoutMs: 10_000 })
    assert.deepEqual(definition.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }], JSON.stringify(definition))
    const roots = observations().filter(row => row.kind === "roots")
    assert.ok(roots.length > 0)
    assert.ok(roots.every(row => !row.value.some(file => /AAAUnrelatedBarrel|Unrelated\.ts|Unused\d+\.ts/.test(file))),
      "an initialization anchor and unrelated resident documents never become interactive roots")
    assert.equal(observations().filter(row => row.kind === "parse" && row.value === api).length, 1)
    const repeated = await session.request("textDocument/definition", query)
    assert.deepEqual(repeated.result, definition.result)
    assert.equal(observations().filter(row => row.kind === "roots").length, roots.length,
      "same-input queries retain the prepared Program")
    const references = await session.request("textDocument/references", {
      ...query, context: { includeDeclaration: true } })
    assert.equal(references.error?.code, -32803, "an incomplete catalog cannot publish truncated references")
    assert.equal(references.error?.message, "References require a complete workspace snapshot")
    const rename = await session.request("textDocument/rename", { ...query, newName: "currentQueried" })
    assert.equal(rename.error?.code, -32803, "an incomplete catalog cannot publish a partial edit")
    const afterGlobal = await session.request("textDocument/definition", query)
    assert.deepEqual(afterGlobal.result, definition.result)
    assert.ok(observations().filter(row => row.kind === "roots").every(row =>
      !row.value.some(file => /AAAUnrelatedBarrel|Unrelated\.ts|Unused\d+\.ts/.test(file))),
    "a rejected complete-project query must not pollute the next local Program either")
    assert.equal(observations().filter(row => row.kind === "noise-read").length, 0,
      "rejected global operations must preserve the same bounded source-delivery policy")
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: fixture.sources["Main.ets"] })
    assert.deepEqual((await session.request("textDocument/definition", query)).result, definition.result)
    const dependencyParses = () => observations().filter(row => row.kind === "parse"
      && row.value === path.join(workspace, "Unopened.ets")).length
    const beforeRejectedRename = dependencyParses()
    const openReferences = await session.request("textDocument/references", { ...query, context: { includeDeclaration: true } })
    assert.deepEqual(openReferences.error, { code: -32803, message: "References require a complete workspace snapshot" })
    const rejectedOpenRename = await session.request("textDocument/rename", { ...query, newName: "currentQueried" })
    assert.equal(rejectedOpenRename.error?.code, -32803)
    assert.deepEqual((await session.request("textDocument/definition", query)).result, definition.result)
    assert.equal(dependencyParses(), beforeRejectedRename,
      "a rejected global query must not reset the unchanged local dependency AST")
    session.changeDocument({ uri: uri("Main.ets"), version: 2,
      text: fixture.sources["Main.ets"] + "\n// local overlay edit after rejected rename\n" })
    assert.deepEqual((await session.request("textDocument/definition", query)).result, definition.result)
    assert.equal(dependencyParses(), beforeRejectedRename,
      "a contiguous local overlay edit must retain unchanged dependency syntax")
    fs.writeFileSync(path.join(workspace, "Unopened.ets"),
      "// real disk change must still invalidate its previous source identity\n" + fixture.sources["Unopened.ets"])
    const retryAfterDiskChange = await session.request("textDocument/rename", { ...query, newName: "currentQueried" })
    assert.equal(retryAfterDiskChange.error?.code, -32803)
    const current = await session.request("textDocument/definition", query)
    assert.deepEqual(current.result, [{ ...definition.result[0], range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 } } }],
    "membership retry must observe real disk changes and never reuse the old location")
    assert.equal(events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
