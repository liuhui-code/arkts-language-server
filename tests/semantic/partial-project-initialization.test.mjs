import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL, fileURLToPath } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { createSdkPartialScopeFixture as scopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { waitForEvent } from "../support/semantic-recycle-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("partial membership prewarms SDK without making unrelated initialization sources interactive roots",
  { timeout: 60_000 }, async t => {
    const fixture = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_TEST_MEMBERSHIP_FIRST_SOURCE: "Main.ets",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}`,
    }, { serverPath: process.env.ARKTS_TEST_SERVER_PATH })
    const { session, sdk, rootUri, workspace, directory, uri, events } = fixture
    const noise = path.join(workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 32; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), `export const unused${i} = ${i}\n`)
    fs.writeFileSync(path.join(workspace, "AAAUnrelatedBarrel.ts"), "export { unrelated } from './Unrelated'\n")
    fs.writeFileSync(path.join(workspace, "Unrelated.ts"), "export const unrelated = 123\n")
    // A genuinely unavailable input, independent of project cardinality.
    fs.writeFileSync(path.join(workspace, "UnsupportedLarge.ts"), " ".repeat(4 * 1024 * 1024 + 1))
    const api = path.join(sdk, "ets/api/@ohos.unused.d.ts")
    fs.mkdirSync(path.dirname(api), { recursive: true })
    fs.writeFileSync(api, "export declare class UnusedSDK { marker: number }\n")
    const observations = () => {
      const file = path.join(directory, "partial-initialization.jsonl")
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const complete = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
    assert.equal(complete.params.report.semanticState, "degraded")
    assert.deepEqual(complete.params.report.unavailableReasons, ["project-membership-incomplete"])
    assert.equal(observations().filter(row => row.kind === "noise-read").length, 0,
      "incomplete whole-project preparation must not read unrelated source bodies")
    assert.equal(observations().filter(row => row.kind === "parse" && row.value === api).length, 1,
      "SDK syntax must be ready even when the project catalog exceeds its bound")
    assert.ok(observations().some(row => row.kind === "parse" && /^lib\..*\.d\.ts$/.test(path.basename(row.value))))
    const query = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 } }
    const definition = await session.request("textDocument/definition", query, { timeoutMs: 10_000 })
    assert.deepEqual(definition.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }], JSON.stringify(definition))
    const roots = observations().filter(row => row.kind === "roots")
    assert.ok(roots.length > 0)
    assert.ok(roots.every(row => !row.value.some(file => /AAAUnrelatedBarrel|Unrelated\.ts|Unused\d+\.ts/.test(file))),
      "an initialization anchor and unrelated resident documents never become interactive roots")
    assert.equal(observations().filter(row => row.kind === "parse" && row.value === api).length, 1)
    const repeated = await session.request("textDocument/definition", query)
    assert.deepEqual(repeated.result, definition.result)
    assert.equal(observations().filter(row => row.kind === "roots").length, roots.length,
      "same-input queries retain the prepared Program")
    const references = await session.request("textDocument/references", {
      ...query, context: { includeDeclaration: true } })
    assert.equal(references.error?.code, -32803, "an incomplete catalog cannot publish truncated references")
    assert.equal(references.error?.message, "References require a complete workspace snapshot")
    const rename = await session.request("textDocument/rename", { ...query, newName: "currentQueried" })
    assert.equal(rename.error?.code, -32803, "an incomplete catalog cannot publish a partial edit")
    const afterGlobal = await session.request("textDocument/definition", query)
    assert.deepEqual(afterGlobal.result, definition.result)
    assert.ok(observations().filter(row => row.kind === "roots").every(row =>
      !row.value.some(file => /AAAUnrelatedBarrel|Unrelated\.ts|Unused\d+\.ts/.test(file))),
    "a rejected complete-project query must not pollute the next local Program either")
    assert.equal(observations().filter(row => row.kind === "noise-read").length, 0,
      "rejected global operations must preserve the same bounded source-delivery policy")
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: fixture.sources["Main.ets"] })
    assert.deepEqual((await session.request("textDocument/definition", query)).result, definition.result)
    const dependencyParses = () => observations().filter(row => row.kind === "parse"
      && row.value === path.join(workspace, "Unopened.ets")).length
    const beforeRejectedRename = dependencyParses()
    const openReferences = await session.request("textDocument/references", { ...query, context: { includeDeclaration: true } })
    assert.deepEqual(openReferences.error, { code: -32803, message: "References require a complete workspace snapshot" })
    const rejectedOpenRename = await session.request("textDocument/rename", { ...query, newName: "currentQueried" })
    assert.equal(rejectedOpenRename.error?.code, -32803)
    assert.deepEqual((await session.request("textDocument/definition", query)).result, definition.result)
    assert.equal(dependencyParses(), beforeRejectedRename,
      "a rejected global query must not reset the unchanged local dependency AST")
    session.changeDocument({ uri: uri("Main.ets"), version: 2,
      text: fixture.sources["Main.ets"] + "\n// local overlay edit after rejected rename\n" })
    assert.deepEqual((await session.request("textDocument/definition", query)).result, definition.result)
    assert.equal(dependencyParses(), beforeRejectedRename,
      "a contiguous local overlay edit must retain unchanged dependency syntax")
    fs.writeFileSync(path.join(workspace, "Unopened.ets"),
      "// real disk change must still invalidate its previous source identity\n" + fixture.sources["Unopened.ets"])
    const retryAfterDiskChange = await session.request("textDocument/rename", { ...query, newName: "currentQueried" })
    assert.equal(retryAfterDiskChange.error?.code, -32803)
    const current = await session.request("textDocument/definition", query)
    assert.deepEqual(current.result, [{ ...definition.result[0], range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 } } }],
    "membership retry must observe real disk changes and never reuse the old location")
    assert.equal(events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

for (const sdkTarget of ["unverified", "compatible"]) {
  test(`known ${sdkTarget} SDK preparation preserves catalog coverage and honest readiness`,
    { timeout: 30_000 }, async t => {
      const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}` })
      const folder = "app/src/main/ets", sourceRoot = path.join(f.workspace, folder)
      fs.mkdirSync(sourceRoot, { recursive: true })
      for (const name of Object.keys(f.sources)) fs.renameSync(path.join(f.workspace, name), path.join(sourceRoot, name))
      for (let i = 0; i < 96; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
      const profile = { app: { products: [{ name: "default",
        compileSdkVersion: sdkTarget === "unverified" ? "unmapped-sdk-alias" : 24 }] },
        modules: [{ name: "app", srcPath: "./app", targets: [{ name: "default", applyToProducts: ["default"] }] }] }
      const profilePath = path.join(f.workspace, "build-profile.json5")
      fs.writeFileSync(profilePath, JSON.stringify(profile))
      fs.writeFileSync(path.join(f.workspace, "app/build-profile.json5"), "{targets:[{name:'default'}]}")
      fs.writeFileSync(path.join(f.workspace, "app/oh-package.json5"), "{name:'app'}")
      const api = path.join(f.sdk, "ets/api/@ohos.unused.d.ts")
      fs.mkdirSync(path.dirname(api), { recursive: true })
      fs.writeFileSync(api, "export declare class UnusedSDK {}\n")
      const parsed = () => fs.readFileSync(path.join(f.directory, "partial-initialization.jsonl"), "utf8")
        .trim().split("\n").filter(Boolean).map(JSON.parse).filter(row => row.kind === "parse").map(row => row.value)
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const prepared = await f.session.transport.notification("arkts/semanticPreparation",
        message => message.params.phase === "complete", 15_000)
      const report = prepared.params.report
      assert.equal(report.sourceNamespace.sources, 98, "SDK qualification never truncates project membership")
      assert.equal(report.semanticState, sdkTarget === "unverified" ? "partial" : "ready", JSON.stringify(report))
      const noise = new Set(parsed().filter(file => /Unused\d+\.ts$/.test(file)))
      assert.equal(noise.size, sdkTarget === "unverified" ? 0 : 96,
        "known SDK refusal must not first warm every unrelated project AST")
      assert.equal(parsed().filter(file => file === api).length, 1, "unused shared SDK syntax is still prepared once")
      assert.ok(parsed().some(file => /^lib\..*\.d\.ts$/.test(path.basename(file))), "standard-library preparation remains")
      const result = await f.session.request("textDocument/definition", {
        textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: { line: 1, character: 25 } })
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.deepEqual(result.result, [{ uri: f.uri(`${folder}/Unopened.ets`), range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
      if (sdkTarget === "unverified") {
        assert.deepEqual(report.readyCapabilities, [])
        assert.deepEqual(report.unavailableReasons, ["sdk-inputs-incomplete"])
        assert.equal(report.coverage, null, "SDK-only preparation never masquerades as a full-project proof")
        profile.app.products[0].compileSdkVersion = 24
        fs.writeFileSync(profilePath, JSON.stringify(profile))
        f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
          params: { changes: [{ uri: f.uri("build-profile.json5"), type: 2 }] } })
        const recovered = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: true },
          { timeoutMs: 15_000 })
        assert.equal(recovered.result?.semanticState, "ready", JSON.stringify(recovered))
        assert.equal(recovered.result.coverage.projectSources, 98)
      } else assert.equal(report.coverage.projectSources, 98)
      assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
      assert.ok(!f.events().some(row => /semantic\.worker\.(unresponsive|recovery)/.test(row.event)))
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}


for (const profile of [undefined, "current"]) {
  test(`SDK-partial operation scope preserves unimported globals and module augmentation (profile=${profile ?? "default"})`,
    { timeout: 30_000 }, async t => {
      const { f, folder, main, global, augmentation } = scopeFixture(t, profile)
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const prepared = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
      assert.equal(prepared.params.report.semanticState, "partial", JSON.stringify(prepared.params))
      assert.equal(prepared.params.report.sourceNamespace.sources, 100)
      for (const [symbol, target, content] of [["GlobalThing", "Global.ets", global], ["augment", "Augment.ets", augmentation]]) {
        const result = await f.session.request("textDocument/definition", {
          textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.lastIndexOf(symbol) + 1) })
        assert.equal(result.error, undefined, JSON.stringify(result))
        const start = content.indexOf(symbol)
        assert.deepEqual(result.result, [{ uri: f.uri(`${folder}/${target}`), range: {
          start: positionAt(content, start), end: positionAt(content, start + symbol.length) } }],
        "a local Program must retain legal globals and unopened module augmentation")
      }
      const traces = f.events().filter(e => e.event === "semantic.definition.complete")
      assert.ok(traces.length >= 2, "both actual queries have compiler observations")
      assert.ok(traces.every(e => e.programProjectFiles === 4), JSON.stringify(traces.map(e => ({
        projectFiles: e.programProjectFiles, projectRoots: e.programProjectRootFiles }))))
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}


for (const notify of [false, true]) {
  test(`operation scope refreshes an unrelated external module becoming global (watched=${notify})`,
    { timeout: 30_000 }, async t => {
      const { f, folder, sourceRoot, main } = scopeFixture(t)
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
      const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("Box") + 1) }
      assert.equal((await f.session.request("textDocument/definition", params)).error, undefined)
      fs.writeFileSync(path.join(sourceRoot, "Unused0.ts"), "class AddedGlobal {}\n")
      if (notify) f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: f.uri(`${folder}/Unused0.ts`), type: 2 }] } })
      const first = await f.session.request("textDocument/definition", params)
      if (first.error) assert.equal(first.error.code, -32803, JSON.stringify(first))
      const text = main + "export const fresh = new AddedGlobal()\n"
      f.session.openDocument({ uri: f.uri(`${folder}/Main.ets`), version: 1, text })
      const current = await f.session.request("textDocument/definition", {
        textDocument: params.textDocument, position: positionAt(text, text.lastIndexOf("AddedGlobal") + 1) })
      assert.equal(current.error, undefined, JSON.stringify(current))
      assert.deepEqual(current.result, [{ uri: f.uri(`${folder}/Unused0.ts`), range: {
        start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }],
      "an old negative syntax-role fact cannot hide a newly global source")
      const trace = f.events().filter(e => e.event === "semantic.definition.complete").at(-1)
      assert.equal(trace.programProjectFiles, 5, "updated global and augmentation roots remain complete without unrelated modules")
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
      assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    })
}

test("a negative global-role proof changed inside the actual compiler query rejects publication and recovers",
  { timeout: 30_000 }, async t => {
    const { f, folder, main, sourceRoot, augmentation } = scopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/operation-scope-final-mutation.cjs"))}` })
    for (let i = 96; i < 600; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    fs.writeFileSync(path.join(sourceRoot, "ZZNegative.ts"), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    fs.writeFileSync(path.join(f.directory, "operation-scope-mutation.json"), JSON.stringify({
      file: `${folder}/ZZNegative.ts`, text: "class AddedGlobal {}\n" }))
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("Box") + 1) }
    const raced = await f.session.request("textDocument/definition", params)
    assert.ok(fs.existsSync(path.join(f.directory, "operation-scope-mutation.json.fired")), "the mutation must occur inside createProgram")
    assert.equal(raced.error?.code, -32803, JSON.stringify(raced))
    assert.equal(raced.result, undefined, "a changed excluded-source role cannot be published using the old scope")
    const recovered = await f.session.request("textDocument/definition", params)
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [{ uri: f.uri(`${folder}/Box.ets`), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 16 } } },
      { uri: f.uri(`${folder}/Augment.ets`), range: {
        start: positionAt(augmentation, augmentation.indexOf("interface Box") + 10),
        end: positionAt(augmentation, augmentation.indexOf("interface Box") + 13) } }])
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("SDK-partial scopes preserve the compiler's canonical owner for duplicate native package identities",
  { timeout: 30_000 }, async t => {
    const { f, sourceRoot, folder } = scopeFixture(t)
    for (const [name, version] of [["a", "1.0.0"], ["b", "2.0.0"], ["c", "1.0.0"]]) {
      const dir = path.join(sourceRoot, name), pkg = path.join(dir, "node_modules/native-fixture")
      fs.mkdirSync(pkg, { recursive: true })
      fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "native-fixture", version, types: "index.d.ts" }))
      fs.writeFileSync(path.join(pkg, "index.d.ts"), "export declare class NativeFixture {}\n")
      fs.writeFileSync(path.join(dir, "Main.ets"),
        'import { NativeFixture } from "native-fixture"\nexport const instance = new NativeFixture()\n')
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    for (const [name, owner] of [["c", "a"], ["b", "b"], ["c", "a"]]) {
      const result = await f.session.request("textDocument/definition", {
        textDocument: { uri: f.uri(`${folder}/${name}/Main.ets`) }, position: { line: 1, character: 30 } })
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.deepEqual(result.result, [{ uri: pathToFileURL(fs.realpathSync.native(path.join(sourceRoot,
        owner, "node_modules/native-fixture/index.d.ts"))).href, range: {
        start: { line: 0, character: 21 }, end: { line: 0, character: 34 } } }])
    }
    for (const name of ["a", "b", "c"]) fs.writeFileSync(path.join(sourceRoot, name, "Main.ets"), "export {}\n")
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
      changes: ["a", "b", "c"].map(name => ({ uri: f.uri(`${folder}/${name}/Main.ets`), type: 2 })) } })
    const local = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: { line: 1, character: 29 } })
    assert.equal(local.error, undefined, JSON.stringify(local))
    assert.deepEqual(local.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const recovered = f.events().filter(e => e.event === "semantic.definition.complete").at(-1)
    assert.equal(recovered.programProjectFiles, 4, "a removed native-package requirement cannot poison future scope selection")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("SDK-partial cold background diagnosis preserves its operation scope before any navigation",
  { timeout: 30_000 }, async t => {
    const { f, folder, main } = scopeFixture(t)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text: main })
    const published = await f.session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 1, 10_000)
    assert.ok(!published.params.diagnostics.some(diagnostic => [2304, 2339].includes(diagnostic.code)), JSON.stringify(published.params))
    const trace = f.events().filter(e => e.event === "diagnostics.program.complete").at(-1)
    assert.equal(trace.programProjectFiles, 4, "background preparation cannot reset the SDK-only owner to every project root")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("SDK-partial nonmember completion and details stay usable before Native indexing is acknowledged",
  { timeout: 30_000 }, async t => {
    const { f, folder, main } = scopeFixture(t)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const indexing = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const uri = f.uri(`${folder}/Main.ets`), text = main + "\nGlobalThi"
    f.session.openDocument({ uri, version: 1, text })
    const params = { textDocument: { uri }, position: positionAt(text, text.length) }
    const completion = await f.session.request("textDocument/completion", params)
    assert.equal(completion.error, undefined, JSON.stringify(completion))
    const item = completion.result.items.find(candidate => candidate.label === "GlobalThing")
    assert.ok(item, "the legal unopened global must complete even while the Native task awaits its client progress token")
    assert.equal(completion.result.isIncomplete, true, "unknown full-project auto-import/SDK coverage is not complete success")
    const trace = f.events().filter(e => e.event === "completion.program.complete").at(-1)
    assert.equal(trace.programProjectFiles, 4, "a missing auto-import catalog must not trigger an implicit whole-project Program")
    const details = await f.session.request("completionItem/resolve", item)
    assert.equal(details.error, undefined, JSON.stringify(details))
    assert.match(details.result.detail ?? "", /GlobalThing/)
    assert.ok(f.events().filter(e => e.event === "completion.resolve.program.complete").every(e => e.programProjectFiles === 4))
    f.session.transport.send({ jsonrpc: "2.0", id: indexing.id, result: null })
    await f.session.transport.progress(indexing.params.token, m => m.params.value.kind === "end", 15_000)
    const repeat = await f.session.request("textDocument/completion", params)
    assert.equal(repeat.error, undefined, JSON.stringify(repeat))
    assert.ok(repeat.result.items.some(candidate => candidate.label === "GlobalThing"))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("SDK-partial scope preserves transitive global augmentation introduced by an unopened module",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = scopeFixture(t)
    const external = path.join(f.directory, "external/global-effect/index.d.ts")
    fs.mkdirSync(path.dirname(external), { recursive: true })
    const declaration = "export {}\ndeclare global { class ExternalThing {} }\n"
    fs.writeFileSync(external, declaration)
    fs.writeFileSync(path.join(path.dirname(external), "package.json"), JSON.stringify({ name: "global-effect", version: "1.0.0", types: "index.d.ts" }))
    fs.writeFileSync(path.join(sourceRoot, "Unused0.ts"), 'import "./Unused1"\nexport {}\n')
    fs.writeFileSync(path.join(sourceRoot, "Unused1.ts"), 'import "global-effect"\nexport {}\n')
    fs.mkdirSync(path.join(sourceRoot, "node_modules"), { recursive: true })
    fs.symlinkSync(path.dirname(external), path.join(sourceRoot, "node_modules/global-effect"), "junction")
    const text = main + "\nexport const external = new ExternalThing()\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const typed = await f.session.request("textDocument/typeDefinition", { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(text, text.indexOf("ExternalThing") + 1) })
    assert.ok(typed.result?.some(target => fs.realpathSync.native(fileURLToPath(target.uri)) === fs.realpathSync.native(external)), JSON.stringify(typed))
    const definition = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(text, text.indexOf("ExternalThing") + 1) })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    const offset = declaration.indexOf("ExternalThing")
    assert.deepEqual(definition.result, [{ uri: pathToFileURL(fs.realpathSync.native(external)).href, range: {
      start: positionAt(declaration, offset), end: positionAt(declaration, offset + "ExternalThing".length) } }])
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("SDK-partial scope uses unsaved overlay-only global declarations",
  { timeout: 30_000 }, async t => {
    const { f, folder, main } = scopeFixture(t)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const name = `${folder}/UnsavedGlobal.ets`, declaration = "class UnsavedGlobal {}\n"
    f.session.openDocument({ uri: f.uri(name), version: 1, text: declaration })
    const text = main + "\nexport const unsaved = new UnsavedGlobal()\n"
    f.session.openDocument({ uri: f.uri(`${folder}/Main.ets`), version: 1, text })
    const definition = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(text, text.indexOf("UnsavedGlobal") + 1) })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.deepEqual(definition.result, [{ uri: f.uri(name), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 19 } } }])
    assert.equal(fs.existsSync(path.join(f.workspace, name)), false, "the overlay must remain unsaved")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("SDK-partial paced opens preserve an older authoritative global overlay beyond raw delivery",
  { timeout: 30_000 }, async t => {
    const { f, folder, main, sourceRoot } = scopeFixture(t)
    for (let i = 96; i < 280; i++) fs.writeFileSync(path.join(sourceRoot, `Unused${i}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    for (let i = 0; i < 280; i++) {
      f.session.openDocument({ uri: f.uri(`${folder}/Unused${i}.ts`), version: 1,
        text: i === 0 ? "class OverlayGlobal {}\n" : "export {}\n" })
      // Real foreground round trips drain mutation acknowledgements; this case
      // tests retained text authority, not the separate 32-record recovery cap.
      if (i % 16 === 15) {
        const barrier = await f.session.request("textDocument/definition", {
          textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
        assert.equal(barrier.error, undefined, JSON.stringify(barrier))
      }
    }
    const text = main + "\nexport const overlay = new OverlayGlobal()\n"
    f.session.openDocument({ uri: f.uri(`${folder}/Main.ets`), version: 1, text })
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
      position: positionAt(text, text.indexOf("OverlayGlobal") + 1) }
    let definition = await f.session.request("textDocument/definition", params)
    if (definition.error?.code === -32803) definition = await f.session.request("textDocument/definition", params)
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.deepEqual(definition.result, [{ uri: f.uri(`${folder}/Unused0.ts`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 19 } } }])
    assert.equal(fs.readFileSync(path.join(sourceRoot, "Unused0.ts"), "utf8"), "export {}\n")
    t.diagnostic(JSON.stringify(f.events().filter(e => /semantic\.worker\.(unresponsive|started|recovery)/.test(e.event))))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("SDK-partial operation scopes are reconstructed after a fatal Worker replacement without renewing initialization",
  { timeout: 30_000 }, async t => {
    const { f, folder, main } = scopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/unresponsive-semantic-worker.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const first = await f.session.request("textDocument/definition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    fs.writeFileSync(path.join(f.directory, "unresponsive-fault.json"), JSON.stringify({ stage: "exit", remaining: 1 }))
    await waitForEvent(path.join(f.directory, "logs"), e => e.event === "semantic.worker.recovery.complete")
    const recovered = await f.session.request("textDocument/definition", params)
    assert.deepEqual(recovered.result, first.result, JSON.stringify(recovered))
    assert.equal(f.events().filter(e => e.event === "semantic.definition.complete").at(-1).programProjectFiles, 4,
      "replacement must rebuild scope metadata before the first actual query, not silently build all100 project files")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("SDK-partial scope recovers after a watched module manifest change without retaining stale configuration proof",
  { timeout: 30_000 }, async t => {
    const { f, folder, main } = scopeFixture(t)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    const first = await f.session.request("textDocument/definition", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    fs.writeFileSync(path.join(f.workspace, "app/oh-package.json5"), "{name:'app',version:'1.0.1'}")
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: {
      changes: [{ uri: f.uri("app/oh-package.json5"), type: 2 }] } })
    let current = await f.session.request("textDocument/definition", params)
    if (current.error?.code === -32803) current = await f.session.request("textDocument/definition", params)
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, first.result)
    assert.equal(f.events().filter(e => e.event === "semantic.definition.complete").at(-1).programProjectFiles, 4)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("automatic ambient type packages alone do not force a full SDK-partial semantic unit",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot, main } = scopeFixture(t)
    const dir = path.join(f.workspace, "node_modules/@types/scope-ambient")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "@types/scope-ambient", version: "1.0.0", types: "index.d.ts" }))
    fs.writeFileSync(path.join(dir, "index.d.ts"), "declare class AmbientOnly {}\n")
    const nativeDir = path.join(f.directory, "external-native")
    fs.mkdirSync(nativeDir, { recursive: true })
    fs.writeFileSync(path.join(nativeDir, "package.json"), JSON.stringify({ name: "scope-native", version: "1.0.0", types: "index.d.ts" }))
    fs.writeFileSync(path.join(nativeDir, "index.d.ts"), "export declare class NativeOnly {}\n")
    // This case exercises a physically external dependency on every platform.
    fs.symlinkSync(nativeDir, path.join(f.workspace, "node_modules/scope-native"),
      process.platform === "win32" ? "junction" : "dir")
    const text = main + "\nexport const automatic = new AmbientOnly()\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 15_000)
    const result = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) })
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.deepEqual(result.result, [{ uri: f.uri(`${folder}/Global.ets`), range: {
      start: { line: 0, character: 6 }, end: { line: 0, character: 17 } } }])
    const ambient = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(text, text.indexOf("AmbientOnly") + 1) })
    assert.equal(ambient.error, undefined, JSON.stringify(ambient))
    assert.equal(fs.realpathSync.native(fileURLToPath(ambient.result[0].uri)), fs.realpathSync.native(path.join(dir, "index.d.ts")))
    assert.deepEqual(ambient.result[0].range, { start: { line: 0, character: 14 }, end: { line: 0, character: 25 } })
    assert.equal(f.events().filter(e => e.event === "semantic.definition.complete").at(-1).programProjectFiles, 5,
      "same baseline automatic types plus import-free excluded modules cannot change native package ownership")
    const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) }, position: positionAt(main, main.indexOf("GlobalThing") + 1) }
    for (const [body, expected] of [['import { NativeOnly } from "scope-native"\nexport const native = new NativeOnly()\n', 101], ["export {}\n", 5]]) {
      fs.writeFileSync(path.join(sourceRoot, "Unused0.ts"), body)
      let changed = await f.session.request("textDocument/definition", params)
      if (changed.error?.code === -32803) changed = await f.session.request("textDocument/definition", params)
      assert.equal(changed.error, undefined, JSON.stringify(changed))
      assert.deepEqual(changed.result, result.result)
      const trace = f.events().filter(e => e.event === "semantic.definition.complete").at(-1)
      assert.equal(trace.programSourceFiles, expected === 101 ? 155 : 58,
        "native package source remains included even when its physical URI is outside the lexical project prefix")
      if (body.includes("NativeOnly")) {
        const native = await f.session.request("textDocument/definition", { textDocument: { uri: f.uri(`${folder}/Unused0.ts`) },
          position: positionAt(body, body.lastIndexOf("NativeOnly") + 1) })
        assert.equal(native.error, undefined, JSON.stringify(native))
        assert.equal(fs.realpathSync.native(fileURLToPath(native.result[0].uri)), fs.realpathSync.native(path.join(nativeDir, "index.d.ts")))
        assert.deepEqual(native.result[0].range, { start: { line: 0, character: 21 }, end: { line: 0, character: 31 } })
      }
      assert.equal(f.events().filter(e => e.event === "semantic.definition.complete").at(-1).programProjectFiles, expected,
        "a new dependency revokes the omission proof; removing it restores the narrower scope")
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
