import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const count of [4000, 6000]) test(`complete ${count + 2}-file import closure retains exact input proof`,
  { timeout: 60_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined, NODE_OPTIONS: undefined })
    fs.unlinkSync(path.join(f.workspace, "Unopened.ets"))
    const imports = []
    for (let index = 0; index < count; index++) {
      const name = `File${String(index).padStart(5, "0")}`
      imports.push(`import { Value${index} } from './${name}'`)
      fs.writeFileSync(path.join(f.workspace, name + ".ets"), `export class Value${index} {}\n`)
    }
    const source = `import { Target } from './Target'\n${imports.join("\n")}\nexport const value = new Target()\n`
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), source)
    fs.writeFileSync(path.join(f.workspace, "Target.ets"), "export class Target {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, timeoutMs: 10_000 })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.phase === "complete", 20_000)
    t.diagnostic(JSON.stringify({ sourceFiles: count + 2, preparation: prepared.params.report }))
    const expected = [{ uri: f.uri("Target.ets"), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await f.session.request("textDocument/definition", { textDocument: { uri: f.uri("Main.ets") },
        position: { line: count + 1, character: 26 } }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, expected)
    }
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params.report))
    assert.equal(f.events().filter(event => event.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(event => event.event === "semantic.worker.unresponsive"))
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })
