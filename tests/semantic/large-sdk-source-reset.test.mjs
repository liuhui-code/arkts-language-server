import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const count of [128, 4608]) {
  test(`source namespace recovery retains a healthy ${count}-declaration SDK proof`, { timeout: 60000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "5000" })
    for (let n = 0; n < count; n++) fs.writeFileSync(path.join(f.sdk, "ets/component", `ambient${n}.d.ts`),
      `interface Ambient${n} { value${n}: number }\n`)
    fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), Array.from({ length: count }, (_, n) =>
      `/// <reference path="./ambient${n}.d.ts" />`).join("\n") + "\ninterface FixtureAmbient {}\n")
    const text = "export const instance = {} as import('./Created').Created\ninstance.value\n"
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, timeoutMs: 10000 })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      m => m.params.rootUri === f.rootUri && m.params.phase === "complete", 30000)
    assert.equal(prepared.params.report.semanticState, "degraded", JSON.stringify(prepared.params.report))
    assert.deepEqual(prepared.params.report.unavailableReasons, ["dependency-inputs-incomplete"])
    assert.match(prepared.params.report.unavailableInput.message, /Created/)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text })
    const complete = () => f.session.request("textDocument/completion", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 12 }, context: { triggerKind: 1 },
    }, { timeoutMs: 30000 })
    assert.equal((await complete()).error, undefined)
    fs.writeFileSync(path.join(f.workspace, "Created.ets"), "export class Created { value: number = 1 }\n")
    assert.equal((await complete()).error?.code, -32803, "the discovering command must reject its old proof")
    for (let repeat = 0; repeat < 2; repeat++) {
      const answer = await complete()
      assert.equal(answer.error, undefined, JSON.stringify(answer))
      assert.ok(answer.result.items.some(item => item.label === "value"))
    }
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })
}
