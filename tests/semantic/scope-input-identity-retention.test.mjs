import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("long-path omission proofs share an exact target identity once before use and once at publication",
  { timeout: 180_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-input-identity-count.cjs"))}` })
    const prefix = path.join(sourceRoot, ...Array.from({ length: 4 }, (_, i) => `part${i}` + "p".repeat(170)))
    const target = path.join(prefix, "ZZTarget/LateTarget.ts")
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, "export class LateTarget {}\n")
    const count = 8250, groups = 96
    for (let i = 0; i < groups; i++) fs.mkdirSync(path.join(prefix, `g${String(i).padStart(3, "0")}`))
    for (let i = 0; i < count; i++) fs.writeFileSync(path.join(prefix,
      `g${String(i % groups).padStart(3, "0")}`, `Caller${String(i).padStart(5, "0")}.ts`),
      'import { LateTarget } from "../ZZTarget/LateTarget"\nexport const selected = new LateTarget()\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 120_000)
    assert.equal(prepared.params.report.sourceNamespace.sources, count + 101)
    const query = () => f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }, { timeoutMs: 45_000 })
    const first = await query()
    assert.equal(first.error, undefined, JSON.stringify(first))
    fs.writeFileSync(path.join(f.directory, "arm-scope-identity-count"), "query")
    const warm = await query()
    assert.equal(warm.error, undefined, JSON.stringify(warm))
    assert.deepEqual(warm.result, [{ uri: f.uri(`${folder}/Global.ets`),
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const observations = fs.readFileSync(path.join(f.directory, "scope-input-identities.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const paths = observations.reduce((groups, row) => { (groups[row.file] ??= []).push(row); return groups }, {})
    t.diagnostic(JSON.stringify({ sourceFiles: count + 101, groups, targetPathLength: target.length,
      targetValidations: observations.length, paths: Object.fromEntries(Object.entries(paths).map(([file, rows]) => [file, rows.length])) }))
    assert.ok(Object.keys(paths).length > 0)
    assert.ok(observations.every(row => row.kind === "source-identity"),
      "logical identity guards remain while proven parent directories eliminate per-leaf native realpath")
    for (const [file, rows] of Object.entries(paths)) {
      assert.equal(fs.realpathSync.native(file), fs.realpathSync.native(target))
      assert.equal(rows.length, 2, "each lexical load-owned input keeps a before-use and final fresh scan")
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
