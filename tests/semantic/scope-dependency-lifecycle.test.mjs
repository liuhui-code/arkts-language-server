import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("repeated navigation checks cancellation directly without root overlay lookups",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-checkpoint-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Unused${(i + 1) % 400}"\nexport const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const query = () => f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    const first = await query()
    assert.equal(first.error, undefined, JSON.stringify(first))
    const before = JSON.parse(fs.readFileSync(path.join(f.directory, "scope-checkpoint-count.json"), "utf8"))
    const repeated = await query()
    assert.equal(repeated.error, undefined, JSON.stringify(repeated))
    assert.deepEqual(repeated.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const after = JSON.parse(fs.readFileSync(path.join(f.directory, "scope-checkpoint-count.json"), "utf8"))
    t.diagnostic(JSON.stringify({ rootOverlayLookups: after.rootOverlayLookups - before.rootOverlayLookups,
      directCheckpoints: after.directCheckpoints - before.directCheckpoints }))
    assert.equal(after.rootOverlayLookups - before.rootOverlayLookups, 0,
      "cancellation must not normalize a root and consult the document cache at every proof checkpoint")
    assert.ok(after.directCheckpoints > before.directCheckpoints, "real cancellation checkpoints must remain active")
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
  })

test("cold dependency metadata retains physical proofs without repeating per-edge source realpaths",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    for (let i = 0; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`),
      `import "./Box"\nimport "./Unused${(i + 1) % 400}"\nexport const value${i} = ${i}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const repeated = rows.flatMap(row => Object.entries(row.callers))
      .filter(([caller]) => caller.includes("observePathLoad")).reduce((sum, [, count]) => sum + count, 0)
    const installed = rows.flatMap(row => Object.entries(row.callers))
      .filter(([caller]) => caller.includes("installedSourcePath")).reduce((sum, [, count]) => sum + count, 0)
    t.diagnostic(JSON.stringify({ sources: 400, metadataLoadSourceRealpaths: repeated, installedSourceRealpaths: installed }))
    const definition = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.deepEqual(definition.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    assert.equal(repeated, 0, "managed regular-source metadata must use its original physical directory proof; byte reads keep raw guards")
    assert.equal(installed, 0, "installed-source ownership must consume the same admitted physical namespace, without dropping its boundary check")
  })

test("cold type navigation retains a cyclic global introducer beyond raw delivery and follows unsaved removal/undo",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t)
    for (let i = 96; i < 400; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    const external = path.join(sourceRoot, "node_modules/influence/index.d.ts")
    fs.mkdirSync(path.dirname(external), { recursive: true })
    const declaration = "export {}\ndeclare global { class CyclicGlobal {} }\n"
    fs.writeFileSync(external, declaration)
    fs.writeFileSync(path.join(sourceRoot, "Unused350.ts"), 'import "./Unused351"\nexport {}\n')
    const introducing = 'import "./Unused350"\nimport "./node_modules/influence"\nexport {}\n'
    fs.writeFileSync(path.join(sourceRoot, "Unused351.ts"), introducing)
    const text = main + "\nexport const cyclic = new CyclicGlobal()\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(text, text.indexOf("CyclicGlobal") + 1) }
    const offset = declaration.indexOf("CyclicGlobal")
    const expected = [{ uri: f.uri(`${folder}/node_modules/influence/index.d.ts`),
      range: { start: positionAt(declaration, offset), end: positionAt(declaration, offset + "CyclicGlobal".length) } }]
    const first = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.deepEqual(first.result, expected)
    const uri = f.uri(`${folder}/Unused351.ts`)
    f.session.openDocument({ uri, version: 1, text: 'import "./Unused350"\nexport {}\n' })
    const removed = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(removed.error, undefined, JSON.stringify(removed))
    assert.deepEqual(removed.result, [])
    f.session.changeDocument({ uri, version: 2, text: introducing })
    const restored = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(restored.error, undefined, JSON.stringify(restored))
    assert.deepEqual(restored.result, expected)
    assert.equal(fs.readFileSync(path.join(sourceRoot, "Unused351.ts"), "utf8"), introducing)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("repeated imports share the containing-file boundary proof without changing definition results",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-boundary-observation.cjs"))}` })
    const body = 'import "./Box"\nimport "./Global"\nimport "./Augment"\nexport {}\n'
    fs.writeFileSync(path.join(sourceRoot, "Unused0.ts"), body)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const observation = path.join(f.directory, "scope-boundaries.jsonl")
    const calls = fs.readFileSync(observation, "utf8").trim().split("\n").map(JSON.parse)
    // One physical containing-file boundary computation for these three edges;
    // ordinary input and final publication proofs still validate that owner.
    assert.equal(calls.length, 1)
    const definition = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.deepEqual(definition.result, [{ uri: f.uri(`${folder}/Global.ets`),
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("graph input preparation hands its proof to the query final fence without an extra early union",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-boundary-observation.cjs"))}` })
    fs.writeFileSync(path.join(sourceRoot, "Unused0.ts"), 'import "./Box"\nexport {}\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const observations = path.join(f.directory, "scope-early-unions.jsonl")
    fs.writeFileSync(observations, "")
    const response = await f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: f.uri(`${folder}/Global.ets`),
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    assert.equal(fs.readFileSync(observations, "utf8"), "", "the actual query owns the final uncached union")
    fs.writeFileSync(path.join(sourceRoot, "Unused0.ts"), 'import "./Global"\nexport {}\n')
    const query = () => f.session.request("textDocument/typeDefinition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    let changed = await query()
    if (changed.error?.code === -32803) changed = await query()
    assert.equal(changed.error, undefined, JSON.stringify(changed))
    assert.deepEqual(changed.result, response.result)
    assert.equal(fs.readFileSync(observations, "utf8"), "", "new resolver lookups join the same preparation phase")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("mandatory SDK globals with independent names do not pull every importer, while merging names retain their order",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t)
    const common = path.join(f.sdk, "ets/component/common.d.ts")
    fs.writeFileSync(common, "declare class SharedSDK {}\n")
    const bridge = path.join(f.sdk, "ets/api/@ohos.bridge.d.ts")
    fs.mkdirSync(path.dirname(bridge), { recursive: true })
    fs.writeFileSync(bridge, 'import "../component/common"\nexport declare const bridge: number\n')
    for (let i = 0; i < 96; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), 'import "@ohos.bridge"\nexport {}\n')
    const text = main + "\nexport const sdk = new SharedSDK()\nexport const merged = sdk.merged\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(text, text.indexOf("GlobalThing") + 1) }
    const exact = [{ uri: f.uri(`${folder}/Global.ets`),
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }]
    for (const [global, expected] of [["class GlobalThing {}\n", 4],
      ["class GlobalThing {}\ninterface SharedSDK { merged: number }\n", 100],
      ["class GlobalThing {}\n", 4]]) {
      fs.writeFileSync(path.join(sourceRoot, "Global.ets"), global)
      let result = await f.session.request("textDocument/definition", params)
      if (result.error?.code === -32803) result = await f.session.request("textDocument/definition", params)
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.deepEqual(result.result, exact)
      assert.equal(f.events().filter(e => e.event === "semantic.definition.complete").at(-1).programProjectFiles, expected)
      if (expected === 100) {
        const merged = await f.session.request("textDocument/definition", { textDocument: params.textDocument,
          position: positionAt(text, text.lastIndexOf("merged") + 1) })
        const offset = global.indexOf("merged")
        assert.equal(merged.error, undefined, JSON.stringify(merged))
        assert.deepEqual(merged.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
          start: positionAt(global, offset), end: positionAt(global, offset + "merged".length) } }])
      }
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("an independent SDK global proof cannot renew SDK inputs changed inside the project compiler build",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/sdk-baseline-final-mutation.cjs"))}` })
    const common = path.join(f.sdk, "ets/component/common.d.ts")
    fs.writeFileSync(common, "declare class SharedSDK {}\n")
    const bridge = path.join(f.sdk, "ets/api/@ohos.bridge.d.ts")
    fs.mkdirSync(path.dirname(bridge), { recursive: true })
    fs.writeFileSync(bridge, 'import "../component/common"\nexport declare const bridge: number\n')
    for (let i = 0; i < 96; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), 'import "@ohos.bridge"\nexport {}\n')
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const first = await f.session.request("textDocument/definition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.equal(f.events().filter(e => e.event === "semantic.definition.complete").at(-1).programProjectFiles, 4)
    const plan = path.join(f.directory, "sdk-baseline-mutation.json")
    fs.writeFileSync(plan, JSON.stringify({ text: "declare class SharedSDK {}\ndeclare class NewSDKGlobal {}\n" }))
    f.session.openDocument({ uri: params.textDocument.uri, version: 1, text: main + "\nexport const edit = 1\n" })
    const stale = await f.session.request("textDocument/definition", params)
    assert.equal(fs.existsSync(plan + ".fired"), true, "change happens inside the actual compiler build")
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    for (let repeat = 0; repeat < 2; repeat++) {
      const unchanged = await f.session.request("textDocument/definition", params)
      assert.equal(unchanged.error?.code, -32803, "source edits cannot authorize renewal of unnotified SDK inputs")
      assert.equal(unchanged.result, undefined)
    }
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
    const fresh = await f.session.request("textDocument/definition", params)
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.deepEqual(fresh.result, first.result)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("global augmentation nested inside an ambient module blocks SDK name-independence",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t)
    fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), "declare class SharedSDK {}\n")
    const bridge = path.join(f.sdk, "ets/api/@ohos.bridge.d.ts")
    fs.mkdirSync(path.dirname(bridge), { recursive: true })
    fs.writeFileSync(bridge, 'import "../component/common"\nexport declare const bridge: number\n')
    for (let i = 0; i < 96; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), 'import "@ohos.bridge"\nexport {}\n')
    const declaration = 'declare module "plugin-ambient" { global { interface SharedSDK { nested: number } } }\n'
    fs.writeFileSync(path.join(sourceRoot, "PluginGlobals.d.ts"), declaration)
    const text = main + "\nexport const merged = new SharedSDK().nested\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const definition = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(text, text.indexOf("GlobalThing") + 1) })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.equal(f.events().filter(e => e.event === "semantic.definition.complete").at(-1).programProjectFiles, 101)
    const nested = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(text, text.lastIndexOf("nested") + 1) })
    assert.equal(nested.error, undefined, JSON.stringify(nested))
    const offset = declaration.indexOf("nested")
    assert.deepEqual(nested.result, [{ uri: f.uri(`${folder}/PluginGlobals.d.ts`), range: {
      start: positionAt(declaration, offset), end: positionAt(declaration, offset + "nested".length) } }])
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("SDK-partial default completion retains unopened exports and details before Native catalog acknowledgement",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    const text = "export const selected = Gree\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    fs.writeFileSync(path.join(sourceRoot, "Greeter.ts"), "export class Greeter { hello(): string { return 'hi' } }\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    assert.equal(prepared.params.report.semanticState, "partial")
    assert.equal(f.events().filter(e => e.event === "index.catalog.terminal" && e.phase === "ready").length, 0)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text })
    const completed = await f.session.request("textDocument/completion", { textDocument: { uri },
      position: positionAt(text, text.indexOf("Gree") + 4) })
    assert.equal(completed.error, undefined, JSON.stringify(completed))
    const matches = completed.result?.items?.filter(item => item.label === "Greeter")
    assert.equal(matches?.length, 1, JSON.stringify(completed))
    assert.equal(completed.result.isIncomplete, true, "the incomplete fixture SDK must remain explicit while project exports work")
    const resolved = await f.session.request("completionItem/resolve", matches[0])
    assert.equal(resolved.error, undefined, JSON.stringify(resolved))
    assert.match(resolved.result.additionalTextEdits?.map(edit => edit.newText).join("\n") ?? "", /import.*Greeter.*\.\/Greeter/u)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("metadata completion keeps every batch and follows unopened export edits and undo before Native readiness",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    const text = "export const selected = Plann\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    for (let index = 0; index < 140; index++) fs.writeFileSync(path.join(sourceRoot, `Planned${index}.ts`),
      `export class Planned${index} {}\n`)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text })
    const query = async () => {
      const response = await f.session.request("textDocument/completion", { textDocument: { uri },
        position: positionAt(text, text.indexOf("Plann") + 5) }, { timeoutMs: 15_000 })
      assert.equal(response.error, undefined, JSON.stringify(response))
      return response.result.items.filter(item => /^Planned\d+$/.test(item.label))
    }
    const first = await query()
    assert.equal(first.length, 140, JSON.stringify(first))
    assert.equal(new Set(first.map(item => item.label)).size, 140)
    const target = f.uri(`${folder}/Planned139.ts`)
    f.session.openDocument({ uri: target, version: 1, text: "export class Renamed139 {}\n" })
    const edited = await query()
    assert.equal(edited.length, 139)
    assert.equal(edited.some(item => item.label === "Planned139"), false)
    f.session.changeDocument({ uri: target, version: 2, text: "export class Planned139 {}\n" })
    const restored = await query()
    assert.equal(restored.length, 140)
    const item = restored.find(item => item.label === "Planned139")
    const resolved = await f.session.request("completionItem/resolve", item)
    assert.equal(resolved.error, undefined, JSON.stringify(resolved))
    assert.match(resolved.result.additionalTextEdits?.map(edit => edit.newText).join("\n") ?? "", /import.*Planned139/u)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("unindexed export planning preserves default names, aliases and cyclic star barrels",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    for (const [name, text] of Object.entries({
      "Default.ts": "export default class NamedDefault {}\n",
      "Original.ts": "export class Original {}\n",
      "Alias.ts": 'export { Original as AliasedChoice } from "./Original"\n',
      "Leaf.ts": "export class BarrelChoice {}\n",
      "BarrelA.ts": 'export * from "./BarrelB"\nexport * from "./Leaf"\n',
      "BarrelB.ts": 'export * from "./BarrelA"\n',
    })) fs.writeFileSync(path.join(sourceRoot, name), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const uri = f.uri(`${folder}/Main.ets`)
    let version = 0
    for (const [prefix, label, module] of [["NamedD", "NamedDefault", "Default"],
      ["AliasedC", "AliasedChoice", "Alias"], ["BarrelC", "BarrelChoice", "(?:Leaf|BarrelA|BarrelB)"]]) {
      const text = `export const selected = ${prefix}\n`
      if (version === 0) f.session.openDocument({ uri, version: ++version, text })
      else f.session.changeDocument({ uri, version: ++version, text })
      const result = await f.session.request("textDocument/completion", { textDocument: { uri },
        position: positionAt(text, text.indexOf(prefix) + prefix.length) })
      assert.equal(result.error, undefined, JSON.stringify(result))
      const item = result.result.items.find(candidate => candidate.label === label)
      assert.ok(item, JSON.stringify(result))
      const resolved = await f.session.request("completionItem/resolve", item)
      assert.equal(resolved.error, undefined, JSON.stringify(resolved))
      assert.match(resolved.result.additionalTextEdits?.map(edit => edit.newText).join("\n") ?? "",
        new RegExp(`import.*${label}.*\\./${module}`))
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("projected scope proofs avoid physical file resolution for unchanged omitted roots",
  { timeout: 30_000 }, async t => {
    const { f, folder, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const first = await f.session.request("textDocument/typeDefinition", params)
    const hot = await f.session.request("textDocument/typeDefinition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.equal(hot.error, undefined, JSON.stringify(hot))
    assert.deepEqual(hot.result, [{ uri: f.uri(`${folder}/Global.ets`),
      range: { start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "typeDefinitions")
    assert.equal(rows.length, 2)
    assert.ok(rows[1].count < 10, `unchanged role inputs share directory resolution: ${JSON.stringify(rows)}`)
    t.diagnostic(JSON.stringify({ graphTraversals: rows.map(row => row.graphTraversals) }))
    assert.equal(rows[1].graphTraversals, 2,
      "one successful query traversal and one independent final traversal suffice for unchanged graph inputs")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("full prepared Program proofs share parent resolution without omitting input identities",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let index = 0; index < 96; index++) fs.writeFileSync(path.join(noise, `Unused${index}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    assert.equal(prepared.params.report.coverage.projectSources, 98)
    const uri = f.uri("Main.ets"), params = { textDocument: { uri }, position: { line: 1, character: 24 } }
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = await f.session.request("textDocument/definition", params)
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.deepEqual(result.result, [{ uri: f.uri("Unopened.ets"),
        range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
    }
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "define")
    assert.equal(rows.length, 2)
    t.diagnostic(JSON.stringify({ qualification: "FULL_98_INPUT_PROGRAM_TWO_IDENTITY_FENCES", observations: rows }))
    assert.ok(rows[1].count < 10, `each leaf stays validated while parent resolution is shared: ${JSON.stringify(rows)}`)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("complete Program completion bounds physical resolution across an overlay edit",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let index = 0; index < 2048; index++) fs.writeFileSync(path.join(noise, `Unused${index}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    assert.equal(prepared.params.report.semanticState, "ready")
    const uri = f.uri("Main.ets"), text = f.sources["Main.ets"] + "\nres"
    f.session.openDocument({ uri, version: 1, text })
    for (let repeat = 0; repeat < 2; repeat++) {
      const response = await f.session.request("textDocument/completion", { textDocument: { uri },
        position: positionAt(text, text.length) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.ok(response.result.items.some(item => item.label === "result"), JSON.stringify(response))
    }
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "complete")
    assert.equal(rows.length, 2)
    t.diagnostic(JSON.stringify({ qualification: "COMPLETE_2050_SOURCE_OVERLAY_COMPLETION", observations: rows }))
    assert.ok(rows.every(row => row.count <= 256), JSON.stringify(rows))
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("body-only overlay edits retain dependency topology while hover follows edit and undo",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/scope-directory-resolution-count.cjs"))}` })
    const original = main + '\nexport let localValue: number = 1\n'
    const edited = main + '\nexport let localValue: string = "fresh"\n'
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), original)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text: original })
    for (const [index, text, type] of [[0, original, "number"], [1, edited, "string"], [2, original, "number"]]) {
      if (index) f.session.changeDocument({ uri, version: index + 1, text })
      const response = await f.session.request("textDocument/hover", { textDocument: { uri },
        position: positionAt(text, text.lastIndexOf("localValue") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.match(JSON.stringify(response.result), new RegExp(`localValue: ${type}`))
    }
    const rows = fs.readFileSync(path.join(f.directory, "directory-resolution-count.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).filter(row => row.method === "hover")
    assert.equal(rows.length, 3)
    t.diagnostic(JSON.stringify({ cumulativeGraphRebuilds: rows.map(row => row.cumulativeGraphRebuilds) }))
    assert.equal(rows[1].cumulativeGraphRebuilds, rows[0].cumulativeGraphRebuilds,
      "body type edits update actual compiler contents without rebuilding unchanged dependency topology")
    assert.equal(rows[2].cumulativeGraphRebuilds, rows[0].cumulativeGraphRebuilds,
      "undo also retains topology; background requests cannot hide rebuilds from the cumulative counter")
    t.diagnostic(JSON.stringify({ influenceBuilds: rows.map(row => row.influenceBuilds) }))
    assert.deepEqual(rows.slice(1).map(row => row.influenceBuilds), [0, 0],
      "body edits and undo must reuse unchanged influence topology while current input proofs still run")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.equal(fs.readFileSync(path.join(sourceRoot, "Main.ets"), "utf8"), original)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
