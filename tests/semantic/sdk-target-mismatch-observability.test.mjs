import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("SDK target mismatch identifies required and installed API while keeping local definition usable",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined })
    const folder = "entry/src/main/ets"
    fs.mkdirSync(path.join(f.workspace, folder), { recursive: true })
    for (const name of ["Main.ets", "Unopened.ets"]) fs.renameSync(path.join(f.workspace, name), path.join(f.workspace, folder, name))
    fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default", compileSdkVersion: 20, compatibleSdkVersion: 20 }] },
      modules: [{ name: "entry", srcPath: "./entry", targets: [{ name: "default", applyToProducts: ["default"] }] }],
    }))
    fs.writeFileSync(path.join(f.workspace, "entry/build-profile.json5"), '{targets:[{name:"default"}]}')
    fs.writeFileSync(path.join(f.workspace, "entry/oh-package.json5"), '{name:"entry"}')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const ready = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    assert.equal(ready.params.report.semanticState, "partial", JSON.stringify(ready.params))
    assert.ok(ready.params.report.availableCapabilities.includes("definition"))
    assert.ok(!ready.params.report.readyCapabilities.includes("references:includeDeclaration=true"))
    const response = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: { line: 1, character: 24 } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Unopened.ets`),
      range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    const selected = f.events().find(event => event.event === "sdk.selected")
    assert.equal(selected.apiVersion, "24")
    assert.equal(selected.targetQualification, "mismatch")
    assert.equal(selected.compileApi, 20)
    assert.equal(selected.compatibleApi, 20)
    assert.match(selected.sdkTargetMessage, /Project requires SDK API 20; selected SDK API is 24/)
  })
