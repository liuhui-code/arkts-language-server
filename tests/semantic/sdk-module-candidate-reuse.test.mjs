import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

for (const configured of [false, true]) {
  test(`repeated SDK imports retain query-owned candidate evidence and negative priority proofs (configured=${configured})`,
    { timeout: 30_000 }, async t => {
      const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/sdk-module-candidate-observation.cjs"))}` })
      const api = path.join(f.sdk, "ets/api"), fallback = path.join(f.sdk, "js/api")
      fs.mkdirSync(api, { recursive: true }); fs.mkdirSync(fallback, { recursive: true })
      const wrappers = Array.from({ length: 60 }, (_, i) => `@ohos.wrapper${i}.d.ts`)
      for (const name of wrappers) fs.writeFileSync(path.join(api, name), 'export { Model } from "@ohos.shared"\n')
      fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), wrappers.map(name =>
        `/// <reference path="../api/${name}" />`).join("\n") + "\n")
      fs.writeFileSync(path.join(fallback, "@ohos.shared.d.ts"), "export declare class Model { value: number }\n")
      const file = configured ? "app/src/main/ets/Main.ets" : "Main.ets"
      if (configured) {
        fs.mkdirSync(path.dirname(path.join(f.workspace, file)), { recursive: true })
        fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
          app: { products: [{ name: "default" }] }, modules: [{ name: "app", srcPath: "./app",
            targets: [{ name: "default", applyToProducts: ["default"] }] }] }))
        fs.writeFileSync(path.join(f.workspace, "app/build-profile.json5"), "{targets:[{name:'default'}]}")
        fs.writeFileSync(path.join(f.workspace, "app/oh-package.json5"), JSON.stringify({ name: "app" }))
      }
      const source = 'import { Model } from "@ohos.wrapper0"\nexport const selected = new Model()\n'
      fs.writeFileSync(path.join(f.workspace, file), source)
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const preparation = await f.session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === f.rootUri && message.params.phase === "complete", 20_000)
      assert.equal(preparation.params.report.semanticState, "ready", JSON.stringify(preparation.params))
      const params = { textDocument: { uri: f.uri(file) }, position: positionAt(source, source.lastIndexOf("Model") + 1) }
      const definition = await f.session.request("textDocument/definition", params)
      assert.equal(definition.error, undefined, JSON.stringify(definition))
      assert.equal(definition.result.length, 1)
      assert.ok(definition.result[0].uri.endsWith("/js/api/%40ohos.shared.d.ts")
        || definition.result[0].uri.endsWith("/js/api/@ohos.shared.d.ts"), JSON.stringify(definition))
      const probes = fs.readFileSync(path.join(f.directory, "sdk-module-candidates.jsonl"), "utf8")
        .trim().split("\n").filter(Boolean).map(JSON.parse)
      const positive = probes.filter(row => row.result), negative = probes.filter(row => !row.result)
      t.diagnostic(JSON.stringify({ imports: 60, configured, positive: positive.length, negative: negative.length }))
      assert.ok(positive.length > 0 && positive.length <= (configured ? 4 : 2),
        `same SDK candidate must not be reprobed for every importer (${positive.length})`)
      assert.ok(negative.length > 0 && negative.length <= (configured ? 4 : 2),
        `the original higher-priority absence is witnessed once per query (${negative.length})`)
      // JS fallback must retain the original negative ETS priority evidence.
      fs.writeFileSync(path.join(api, "@ohos.shared.d.ts"), "export declare class Model { changed: string }\n")
      const changed = await f.session.request("textDocument/definition", params)
      assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
      assert.equal(changed.result, undefined)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}

test("missing SDK imports retain exact fallback evidence after lookup cache saturation",
  { timeout: 30_000 }, async t => {
    const profiles = []
    for (const importers of [1, 60]) {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/fallback-candidate-probes.cjs"))}` })
    fs.mkdirSync(path.join(f.workspace, "node_modules"))
    for (let i = 0; i < 40; i++) {
      const folder = path.join(f.workspace, "a-prefill", `seed${String(i).padStart(2, "0")}`)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, "Seed.ets"), `import missing from "@ohos.seed${i}"\nexport { missing }\n`)
    }
    fs.mkdirSync(path.join(f.workspace, "noise"))
    for (let i = 0; i < importers; i++) fs.writeFileSync(path.join(f.workspace, "noise", `Consumer${i}.ets`),
      'import missing from "@ohos.fixtureMissing"\nexport { missing }\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.phase === "complete", 20_000)
    assert.equal(prepared.params.report.semanticState, "partial", JSON.stringify(prepared.params))
    const result = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 } })
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.deepEqual(result.result, [{ uri: f.uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
    const rows = fs.readFileSync(path.join(f.directory, "fallback-candidate-probes.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const counts = new Map()
    for (const row of rows) {
      const key = path.relative(path.join(f.workspace, "node_modules"), row.file)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    t.diagnostic(JSON.stringify({ importers, actualStatProbes: rows.length, paths: Object.fromEntries(counts) }))
    assert.ok(counts.size > 0, "actual generic fallback filesystem probes are exercised")
    profiles.push(Object.fromEntries(counts))
    fs.writeFileSync(path.join(f.workspace, "node_modules", "@ohos.fixtureMissing.d.ts"),
      "export default class Provided {}\n")
    const changed = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 } })
    assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
    assert.equal(changed.result, undefined, "the exact memo cannot hide a later successful fallback candidate")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    }
    assert.deepEqual(profiles[1], profiles[0],
      "60 identical resolutions must retain the single-import actual probe set after cache saturation")
  })

test("fallback memo preserves native package metadata and distinct importer directory resolution",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined },
      { serverPath: process.env.ARKTS_TEST_SERVER_PATH })
    for (const [folder, version] of [["a", "1.0.0"], ["b", "2.0.0"], ["c", "1.0.0"]]) {
      const pkg = path.join(f.workspace, folder, "node_modules/native-fixture")
      fs.mkdirSync(pkg, { recursive: true })
      fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "native-fixture", version, types: "index.d.ts" }))
      fs.writeFileSync(path.join(pkg, "index.d.ts"), "export declare class NativeFixture {}\n")
      fs.writeFileSync(path.join(f.workspace, folder, "Main.ets"),
        'import { NativeFixture } from "native-fixture"\nexport const instance = new NativeFixture()\n')
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.phase === "complete", 20_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    for (const folder of ["a", "b", "c", "a"]) {
      const result = await f.session.request("textDocument/definition", {
        textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: { line: 1, character: 30 } })
      assert.equal(result.error, undefined, JSON.stringify(result))
      const owner = folder === "c" ? "a" : folder
      const expectedUri = pathToFileURL(fs.realpathSync.native(path.join(f.workspace,
        owner, "node_modules/native-fixture/index.d.ts"))).href
      assert.deepEqual(result.result, [{ uri: expectedUri, range: {
        start: { line: 0, character: 21 }, end: { line: 0, character: 34 } } }])
    }
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
