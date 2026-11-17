import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const configured of [false, true, "saturated"]) {
test(`initialization and queries reuse relative candidate evidence without hiding later creation (configured=${configured})`,
  { timeout: 30_000 }, async t => {
    const { session, sdk, workspace, rootUri, uri, directory } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/relative-candidate-observation.cjs"))}`,
    }, { serverPath: process.env.ARKTS_TEST_SERVER_PATH })
    const queryFile = configured ? "app/src/main/ets/Main.ets" : "Main.ets"
    if (configured) {
      fs.mkdirSync(path.join(workspace, "app/src/main/ets"), { recursive: true })
      fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
        app: { products: [{ name: "default" }] }, modules: [{ name: "app", srcPath: "./app",
          targets: [{ name: "default", applyToProducts: ["default"] }] }] }))
      fs.writeFileSync(path.join(workspace, "app/build-profile.json5"), "{targets:[{name:'default'}]}")
      fs.writeFileSync(path.join(workspace, "app/oh-package.json5"), JSON.stringify({
        name: "app", main: "./src/main/ets/Main.ets", dependencies: {} }))
    }
    const api = path.join(sdk, "ets/api")
    fs.mkdirSync(api, { recursive: true })
    const seedDirectory = `prefill/${"p".repeat(90)}/${"q".repeat(90)}`
    const sharedModule = configured === "saturated" ? `${seedDirectory}/Shared_${"h".repeat(100)}` : "Shared"
    if (configured === "saturated") fs.mkdirSync(path.join(api, seedDirectory), { recursive: true })
    const names = Array.from({ length: 60 }, (_, i) => `@ohos.shared${i}.d.ts`)
    for (const name of names) fs.writeFileSync(path.join(api, name), `export { Model } from './${sharedModule}'\n`)
    fs.writeFileSync(path.join(api, sharedModule + ".d.ts"), "export declare class Model { value: number }\n")
    const prelude = []
    if (configured === "saturated") {
      // Distinct genuine resolutions fill the bounded cache before a hot family.
      // A capacity limit must not permanently disable reuse for later modules.
      for (let i = 0; i < 1000; i++) {
        const seed = `${seedDirectory}/Seed_${"x".repeat(100)}_${i}`
        const wrapper = `@ohos.prelude${String(i).padStart(4, "0")}.d.ts`
        fs.writeFileSync(path.join(api, seed + ".d.ts"), "export interface Seed {}\n")
        fs.writeFileSync(path.join(api, wrapper), `export { Seed } from './${seed}'\n`)
        prelude.push(wrapper)
      }
    }
    fs.writeFileSync(path.join(sdk, "ets/component/common.d.ts"), [...prelude, ...names].map(name =>
      `/// <reference path="../api/${name}" />`).join("\n") + "\n")
    const prefix = prelude.map((name, i) => `import type { Seed as Seed${i} } from '${name.slice(0, -5)}'\n`).join('')
    const source = prefix + 'import { Model } from "@ohos.shared0"\nexport const selected = new Model()\n'
    fs.writeFileSync(path.join(workspace, queryFile), source)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const params = { textDocument: { uri: uri(queryFile) }, position: { line: prelude.length + 1, character: 30 } }
    const response = await session.request("textDocument/definition", params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.equal(response.result.length, 1)
    assert.ok(response.result[0].uri.endsWith("/" + sharedModule + ".d.ts"))
    const probes = fs.readFileSync(path.join(directory, "relative-candidate.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    t.diagnostic(JSON.stringify({ repeatedRelativeImports: names.length, negativeCandidateProbes: probes.length, firstScope: probes[0]?.scope }))
    assert.ok(probes.length > 0 && probes.length <= (configured ? 4 : 2),
      `60 imports of one relative module must not repeat its same negative file probe (${probes.length})`)
    // A previous negative .ets result must never hide the newly created,
    // higher-priority source behind the still-existing .d.ts alternative.
    fs.writeFileSync(path.join(api, sharedModule + ".ets"), "export class Model { changed: string }\n")
    const changed = await session.request("textDocument/definition", params)
    assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
    assert.equal(changed.result, undefined)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}
