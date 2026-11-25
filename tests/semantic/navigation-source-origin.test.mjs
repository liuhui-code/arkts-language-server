import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("unchanged dependency proof owners reuse validator functions without caching their validity",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-validator-factories.cjs"))}` })
    for (let i = 0; i < 32; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), 'import "./Box"\nexport {}\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const first = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.deepEqual(first.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const hot = await f.session.request("textDocument/typeDefinition", params)
    assert.deepEqual(hot.result, first.result)
    assert.equal(hot.error, undefined, JSON.stringify(hot))
    const rows = fs.readFileSync(path.join(f.directory, "scope-validator-factories.ndjson"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.ok(rows.some(row => row.factories > 0), "the observer must see real initial validator creation")
    assert.equal(rows.filter(row => row.method === "typeDefinitions").at(-1)?.factories, 0,
      "an unchanged owner must not allocate another validator at every proof visit")
    fs.writeFileSync(path.join(sourceRoot, "Global.ets"), "class ReplacedGlobal { selected: number = 1 }\n")
    const changed = await f.session.request("textDocument/typeDefinition", params)
    assert.notDeepEqual(changed.result, first.result, "silent disk changes still invalidate original input evidence")
    if (changed.error) assert.equal(changed.error.code, -32803, JSON.stringify(changed))
    else assert.deepEqual(changed.result, [])
    fs.writeFileSync(path.join(sourceRoot, "Global.ets"), "class GlobalThing { selected: number = 1 }\n")
    const restored = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(restored.error?.code, -32803, JSON.stringify(restored))
    assert.equal(restored.result, undefined, "the second silent replacement also ends its original request")
    const retry = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(retry.error, undefined, JSON.stringify(retry))
    assert.deepEqual(retry.result, first.result)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("an unstable descriptor mode cannot certify a source origin, and the same session retries the actual read",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/source-origin-mode-drift.cjs"))}` })
    for (let i = 96; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const terminal = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.phase === "complete" || message.params.phase === "failed", 20_000)
    const drift = JSON.parse(fs.readFileSync(path.join(f.directory, "source-origin-mode-drift.json"), "utf8"))
    t.diagnostic(JSON.stringify({ terminal: terminal.params, drift }))
    assert.ok(drift.threadId > 0)
    assert.match(drift.caller, /readDiskSource/)
    assert.notEqual(drift.returnedMode, drift.actualMode)
    assert.equal(terminal.params.phase, "failed", "a read with inconsistent descriptor provenance cannot finish preparation")
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("dependency boundaries derive from the actual admitted source origin without resolving that source again",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-boundary-observation.cjs"))}` })
    fs.writeFileSync(path.join(sourceRoot, "Unused0.ts"), 'import "./Box"\nimport "./Global"\nimport "./Augment"\nexport {}\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const observation = path.join(f.directory, "scope-boundaries.jsonl")
    const calls = fs.existsSync(observation) ? fs.readFileSync(observation, "utf8").trim().split("\n").map(JSON.parse) : []
    assert.equal(calls.length, 0, "pure boundary derivation must consume the original guarded read, not a new realpath")
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("cold binding metadata uses the original containing-source read instead of repeated physical guards",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/binding-containing-input-count.cjs"))}` })
    const count = 64
    for (let i = 0; i < count; i++) {
      const directory = path.join(sourceRoot, `Group${i}`)
      fs.mkdirSync(directory)
      fs.writeFileSync(path.join(directory, `Unused${i}.ts`), 'import "../Box"\nexport {}\n')
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const row = fs.readFileSync(path.join(f.directory, "binding-containing-inputs.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).find(item => item.method === "semanticReadiness")
    t.diagnostic(JSON.stringify(row))
    assert.equal(row.sources.length, count)
    assert.ok(row.sources.every(item => item.qualified), "actual guarded source provenance must qualify for this fast path")
    assert.ok(row.sources.reduce((sum, item) => sum + item.lstat, 0) <= 2 * count,
      "one late metadata comparison may recheck the actual original read; repeated containing-file capture is unnecessary")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("shared resolution owners compose their registered query inputs once while retaining independent final checks",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/binding-proof-composition-count.cjs"))}` })
    for (let i = 0; i < 96; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), 'import "./Box"\nexport {}\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    for (let i = 0; i < 2; i++) {
      const response = await f.session.request("textDocument/typeDefinition", {
        textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    }
    const rows = fs.readFileSync(path.join(f.directory, "binding-proof-composition.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions")
    t.diagnostic(JSON.stringify(rows))
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.ok(row.phases.prepare.calls > 96, "multiple importers must actually share resolution owners")
      assert.ok(row.phases.prepare.freshness === row.phases.prepare.unique, "registered shared binding inputs should compose once per owner")
      assert.ok(row.phases.final.calls > 96)
      assert.equal(row.phases.final.freshness, row.phases.final.calls,
        "final checks keep their independent original observations")
    }
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("initial interleaved module discovery does not recompose an unchanged shared lookup for unrelated insertions",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/binding-proof-composition-count.cjs"))}` })
    for (let i = 0; i < 96; i++) {
      fs.writeFileSync(path.join(sourceRoot, `Other${i}.ts`), "export {}\n")
      fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), `import "./Other${i}"\nimport "./Box"\nexport {}\n`)
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const rows = fs.readFileSync(path.join(f.directory, "binding-proof-composition.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "semanticReadiness")
    t.diagnostic(JSON.stringify({ phase: "initialization", rows }))
    const phases = rows.flatMap(row => Object.entries(row.phases).filter(([name]) => name !== "final").map(([, value]) => value))
    const shared = phases.filter(value => value.calls > 96 && value.unique === 1)
    assert.ok(shared.length, "initial preparation must actually revisit its shared lookup amid distinct new modules")
    for (const observed of shared) assert.ok(observed.freshness <= observed.unique,
      "adding unrelated lookup owners must not invalidate a completed immutable shared composition")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
