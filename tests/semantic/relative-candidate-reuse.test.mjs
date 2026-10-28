import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("a compiler query reuses actual relative candidate evidence and rejects later higher-priority creation",
  { timeout: 30_000 }, async t => {
    const { session, sdk, workspace, rootUri, uri, directory } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/relative-candidate-observation.cjs"))}`,
    })
    const api = path.join(sdk, "ets/api")
    fs.mkdirSync(api, { recursive: true })
    const names = Array.from({ length: 60 }, (_, i) => `@ohos.shared${i}.d.ts`)
    for (const name of names) fs.writeFileSync(path.join(api, name), "export { Model } from './Shared'\n")
    fs.writeFileSync(path.join(api, "Shared.d.ts"), "export declare class Model { value: number }\n")
    fs.writeFileSync(path.join(sdk, "ets/component/common.d.ts"), names.map(name =>
      `/// <reference path="../api/${name}" />`).join("\n") + "\n")
    const source = 'import { Model } from "@ohos.shared0"\nexport const selected = new Model()\n'
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 30 } }
    const response = await session.request("textDocument/definition", params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.equal(response.result.length, 1)
    assert.ok(response.result[0].uri.endsWith("/Shared.d.ts"))
    const probes = fs.readFileSync(path.join(directory, "relative-candidate.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    t.diagnostic(JSON.stringify({ repeatedRelativeImports: names.length, negativeCandidateProbes: probes.length }))
    assert.ok(probes.length > 0 && probes.length <= 2,
      `60 imports of one relative module must not repeat its same negative file probe (${probes.length})`)
    // A previous negative .ets result must never hide the newly created,
    // higher-priority source behind the still-existing .d.ts alternative.
    fs.writeFileSync(path.join(api, "Shared.ets"), "export class Model { changed: string }\n")
    const changed = await session.request("textDocument/definition", params)
    assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
    assert.equal(changed.result, undefined)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
