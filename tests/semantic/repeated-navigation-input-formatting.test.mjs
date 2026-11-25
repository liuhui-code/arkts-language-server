import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("repeated navigation reuses original identity decoding without formatting unchanged source proofs",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Box"\nimport "./Unused${(i + 1) % 400}"\nexport const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const query = () => f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    const first = await query()
    assert.equal(first.error, undefined, JSON.stringify(first))
    const rows = () => fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions")
    const before = rows().length
    const repeated = await query()
    assert.equal(repeated.error, undefined, JSON.stringify(repeated))
    assert.deepEqual(repeated.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const after = rows()
    assert.equal(after.length, before + 1, "the repeated public query must reach its own Worker validation")
    const observed = after.at(-1)
    t.diagnostic(JSON.stringify(observed))
    assert.equal(observed.sourceReads, 0, "a hot query must not reopen unchanged source bytes")
    assert.ok(observed.leafStats >= 800, "query and final disk observations remain active")
    assert.equal(observed.identityFormats, 0, "unchanged original identities need no new JSON strings")
    assert.equal(observed.stampArrayComparisons, 0, "unchanged observations need no temporary stamp arrays")
    assert.equal(observed.identityParses, 0, "original proof decoding must be reused across requests")
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
