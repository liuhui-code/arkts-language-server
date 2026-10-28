import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("moving a dependency back and deleting its probed directory restores exact navigation in the same session",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096" })
    const target = 'import type { Fixture } from "@ohos.fixture"\nexport class Target { value = 1 }\n'
    const main = 'import { Target } from "./Target"\nexport const result = new Target()\n'
    fs.mkdirSync(path.join(f.sdk, "ets/api"), { recursive: true })
    fs.writeFileSync(path.join(f.sdk, "ets/api/@ohos.fixture.d.ts"), "export interface Fixture {}\n")
    fs.writeFileSync(path.join(f.workspace, "Target.ets"), target)
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
    const query = () => f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 27 } })
    const expected = name => [{ uri: f.uri(name), range: {
      start: { line: 1, character: 13 }, end: { line: 1, character: 19 } } }]
    assert.deepEqual((await query()).result, expected("Target.ets"))
    const directory = path.join(f.workspace, "temporary"), moved = path.join(directory, "Target.ets")
    fs.mkdirSync(directory)
    fs.renameSync(path.join(f.workspace, "Target.ets"), moved)
    watched([{ uri: f.uri("Target.ets"), type: 3 }, { uri: f.uri("temporary/Target.ets"), type: 1 }])
    f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: main.replace('./Target', './temporary/Target') })
    const movedDefinition = await query()
    assert.deepEqual(movedDefinition.result, expected("temporary/Target.ets"), JSON.stringify(movedDefinition))
    fs.renameSync(moved, path.join(f.workspace, "Target.ets"))
    fs.rmdirSync(directory)
    watched([{ uri: f.uri("temporary/Target.ets"), type: 3 }, { uri: f.uri("Target.ets"), type: 1 }])
    f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: main })
    for (let attempt = 0; attempt < 3; attempt++) {
      const restored = await query()
      assert.deepEqual(restored.result, expected("Target.ets"), JSON.stringify(restored))
    }
    const domainRetirements = () => f.events().filter(e => e.event === "semantic.context.evict"
      && e.reason === "resolution-generation-change").length
    const beforeBodyEdit = domainRetirements()
    fs.writeFileSync(path.join(f.workspace, "Target.ets"), target.replace("value = 1", "value = 2"))
    watched([{ uri: f.uri("Target.ets"), type: 2 }])
    const bodyEdited = await query()
    assert.deepEqual(bodyEdited.result, expected("Target.ets"), JSON.stringify(bodyEdited))
    assert.equal(domainRetirements(), beforeBodyEdit, "ordinary body edits do not retire the resolver generation")
    const temporarySave = path.join(f.workspace, "Target.ets.atomic-save")
    fs.writeFileSync(temporarySave, target.replace("value = 1", "value = 3"))
    fs.renameSync(temporarySave, path.join(f.workspace, "Target.ets"))
    watched([{ uri: f.uri("Target.ets"), type: 2 }])
    assert.deepEqual((await query()).result, expected("Target.ets"))
    assert.equal(domainRetirements(), beforeBodyEdit, "an atomic body save does not retire namespace metadata")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.recovery.complete"))
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    function watched(changes) {
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
    }
  })

for (const membership of ["complete", "partial"]) for (const resident of ["0", "1"]) test(
  `closing an authoritative overlay after a notified disk restore retires its old source proof (${membership}, resident=${resident})`,
  { timeout: membership === "partial" ? 60_000 : 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: resident })
    if (membership === "partial") {
      const noise = path.join(f.workspace, "noise")
      fs.mkdirSync(noise)
      for (let i = 0; i < 20_001; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), "export {}\n")
    }
    const target = "export class Target { method() { return 1 } }\n"
    const main = 'import { Target } from "./Target"\nconst instance = new Target()\ninstance.method()\n'
    const lazyMain = 'export const instance = {} as import("./Target").Target\ninstance.method()\n'
    const file = path.join(f.workspace, "Target.ets")
    fs.writeFileSync(file, target)
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), lazyMain)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: lazyMain })
    const query = (line = 2) => f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line, character: 10 } })
    const expected = line => [{ uri: f.uri("Target.ets"), range: {
      start: { line, character: target.indexOf("method") }, end: { line, character: target.indexOf("method") + 6 } } }]
    assert.deepEqual((await query(1)).result, expected(0))
    f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: main })
    f.session.openDocument({ uri: f.uri("Target.ets"), version: 1, text: target })
    f.session.changeDocument({ uri: f.uri("Target.ets"), version: 2, text: "// authoritative overlay\n" + target })
    disk("// external disk is not authoritative\n" + target)
    assert.deepEqual((await query()).result, expected(1))
    const owners = f.events().filter(e => e.event === "semantic.context.create").length
    disk(target)
    f.session.changeDocument({ uri: f.uri("Target.ets"), version: 3, text: target })
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: f.uri("Target.ets") } } })
    for (let i = 0; i < 3; i++) {
      const response = await query()
      assert.deepEqual(response.result, expected(0), JSON.stringify(response))
    }
    if (resident === "1") assert.equal(f.events().filter(e => e.event === "semantic.context.create").length, owners,
      "an admitted source authority change must not reset the whole healthy context")
    const metadata = path.join(f.sdk, "ets/oh-uni-package.json")
    fs.writeFileSync(metadata, fs.readFileSync(metadata, "utf8").replace('"24"', '"25"'))
    assert.equal((await query()).error?.code, -32803, "disk snapshot admission cannot renew SDK metadata")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.recovery.complete"))
    function disk(text) {
      fs.writeFileSync(file, text)
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: f.uri("Target.ets"), type: 2 }] } })
    }
  })

test("a changed package manifest without watcher delivery reloads resolutions instead of certifying an old Program",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096" })
    const main = 'import { Target } from "named"\nexport const result = new Target()\n'
    for (const name of ["one", "two"]) {
      fs.mkdirSync(path.join(f.workspace, name))
      fs.writeFileSync(path.join(f.workspace, name, "oh-package.json5"), "{main:'Index.ets'}")
      fs.writeFileSync(path.join(f.workspace, name, "Index.ets"), "export class Target {}\n")
    }
    const manifest = path.join(f.workspace, "oh-package.json5")
    fs.writeFileSync(manifest, "{dependencies:{named:'file:./one'}}")
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
    const query = () => f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 27 } })
    const expected = name => [{ uri: f.uri(`${name}/Index.ets`), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    assert.deepEqual((await query()).result, expected("one"))
    fs.writeFileSync(manifest, "{dependencies:{named:'file:./two'}}")
    assert.equal((await query()).error?.code, -32803, "an unchanged request cannot silently rebase unknown inputs")
    const current = await query()
    assert.deepEqual(current.result, expected("two"), JSON.stringify(current))
    fs.writeFileSync(manifest, "{dependencies:{named:'file:./one'}}")
    assert.equal((await query()).error?.code, -32803)
    assert.deepEqual((await query()).result, expected("one"))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })

test("an unnotified target switch invalidates membership and dependency consumers before preparing a fresh Program",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096" })
    const moduleRoot = path.join(f.workspace, "features/alpha")
    for (const name of ["main/ets", "tablet", "desktop"]) fs.mkdirSync(path.join(moduleRoot, "src", name), { recursive: true })
    fs.writeFileSync(path.join(moduleRoot, "src/tablet/Tablet.ets"), "class TabletOnly {}\n")
    fs.writeFileSync(path.join(moduleRoot, "src/desktop/Desktop.ets"), "class InactiveOnly {}\n")
    fs.writeFileSync(path.join(moduleRoot, "build-profile.json5"), JSON.stringify({ targets: [
      { name: "tablet", source: { sourceRoots: ["./src/tablet"] } },
      { name: "desktop", source: { sourceRoots: ["./src/desktop"] } }] }))
    const profile = { app: { products: [{ name: "default" }] }, modules: [{ name: "alpha",
      srcPath: "./features/alpha", targets: [{ name: "tablet", applyToProducts: ["default"] }] }] }
    const profilePath = path.join(f.workspace, "build-profile.json5"), page = "features/alpha/src/main/ets/Page.ets"
    const text = "const value = TabletO\n"
    fs.writeFileSync(profilePath, JSON.stringify(profile)); fs.writeFileSync(path.join(f.workspace, page), text)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri(page), version: 1, text })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === f.uri(page) && m.params.version === 1, 10_000)
    const queryResponse = character => f.session.request("textDocument/completion", {
      textDocument: { uri: f.uri(page) }, position: { line: 0, character } })
    const query = async character => {
      const r = await queryResponse(character)
      assert.equal(r.error, undefined, JSON.stringify(r))
      return r.result.items
    }
    assert.ok((await query(text.indexOf("\n"))).some(x => x.label === "TabletOnly"))
    profile.modules[0].targets[0].name = "desktop"
    fs.writeFileSync(profilePath, JSON.stringify(profile))
    assert.equal((await queryResponse(text.indexOf("\n"))).error?.code, -32803)
    assert.ok(!(await query(text.indexOf("\n"))).some(x => x.label === "TabletOnly"), "old membership must not survive a resolver reset")
    const changed = "const value = InactiveO\n"
    f.session.changeDocument({ uri: f.uri(page), version: 2, text: changed })
    assert.ok((await query(changed.indexOf("\n"))).some(x => x.label === "InactiveOnly"), "new selected membership must be discoverable")
  })

test("notified transient source creation does not strand relative-resolution proofs in an unrelated query",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096" })
    fs.mkdirSync(path.join(f.workspace, "directory"))
    fs.writeFileSync(path.join(f.workspace, "directory/Target.ets"), "export class Target {}\n")
    const main = 'import { Target } from "./directory/Target"\nexport const result = new Target()\n'
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    const query = () => f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 27 } })
    const expected = [{ uri: f.uri("directory/Target.ets"), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
    assert.deepEqual((await query()).result, expected)
    const probe = path.join(f.workspace, "directory/Transient.ets")
    fs.writeFileSync(probe, "export const transient = 1\n")
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("directory/Transient.ets"), type: 1 }] } })
    fs.unlinkSync(probe)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("directory/Transient.ets"), type: 3 }] } })
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await query()
      assert.deepEqual(response.result, expected, JSON.stringify(response))
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.recovery.complete"))
  })

test("an atomic save in a nested relative dependency preserves same-session navigation",
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096" })
    const directory = path.join(f.workspace, "directory")
    fs.mkdirSync(directory)
    const target = path.join(directory, "Target.ets")
    fs.writeFileSync(target, "export class Target { value = 1 }\n")
    const main = 'import { Target } from "./directory/Target"\nexport const result = new Target()\n'
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    const query = () => f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 27 } })
    const expected = [{ uri: f.uri("directory/Target.ets"), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
    assert.deepEqual((await query()).result, expected)
    const temporary = path.join(directory, "Target.ets.atomic-save")
    fs.writeFileSync(temporary, "export class Target { value = 2 }\n")
    fs.renameSync(temporary, target)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("directory/Target.ets"), type: 2 }] } })
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await query()
      assert.deepEqual(response.result, expected, JSON.stringify(response))
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })

for (const membership of ["complete", "partial"]) for (const mutation of ["save", "delete"]) test(
  `promoted lazy source ${mutation} reconciles its prior disk proof before querying another file (${membership})`,
  { timeout: membership === "partial" ? 60_000 : 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096" })
    if (membership === "partial") {
      const noise = path.join(f.workspace, "noise")
      fs.mkdirSync(noise)
      for (let i = 0; i < 20_001; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), "export {}\n")
    }
    const targetFile = mutation === "delete" ? "nested/Target.ets" : "Target.ets"
    fs.mkdirSync(path.dirname(path.join(f.workspace, targetFile)), { recursive: true })
    const target = "export class Target { method() { return 1 } }\n"
    const main = `export const instance = {} as import("./${targetFile.replace(/\.ets$/, "")}").Target\ninstance.method()\n`
    fs.writeFileSync(path.join(f.workspace, targetFile), target)
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    const query = () => f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 10 } })
    const expected = [{ uri: f.uri(targetFile), range: {
      start: { line: 0, character: target.indexOf("method") },
      end: { line: 0, character: target.indexOf("method") + 6 } } }]
    assert.deepEqual((await query()).result, expected)
    f.session.openDocument({ uri: f.uri(targetFile), version: 1, text: target })
    const edited = mutation === "save" ? "// saved overlay source\n" + target : target
    f.session.changeDocument({ uri: f.uri(targetFile), version: 2, text: edited })
    const line = mutation === "save" ? 1 : 0
    const editedExpected = [{ ...expected[0], range: {
      start: { ...expected[0].range.start, line }, end: { ...expected[0].range.end, line } } }]
    assert.deepEqual((await query()).result, editedExpected)
    if (mutation === "save") fs.writeFileSync(path.join(f.workspace, targetFile), edited)
    else fs.unlinkSync(path.join(f.workspace, targetFile))
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri(targetFile), type: mutation === "save" ? 2 : 3 }] } })
    if (mutation === "save") f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didSave",
      params: { textDocument: { uri: f.uri(targetFile) }, text: edited } })
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await query()
      assert.deepEqual(response.result, editedExpected, JSON.stringify(response))
    }
    if (mutation === "delete") {
      fs.writeFileSync(path.join(f.workspace, targetFile), edited)
      f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: f.uri(targetFile), type: 1 }] } })
      assert.deepEqual((await query()).result, editedExpected)
    }
    // A source save grants no permission to adopt an unnotified SDK metadata change.
    const metadata = path.join(f.sdk, "ets/oh-uni-package.json")
    fs.writeFileSync(metadata, fs.readFileSync(metadata, "utf8").replace('"24"', '"25"'))
    fs.writeFileSync(path.join(f.workspace, targetFile), edited)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri(targetFile), type: 2 }] } })
    const invalidSdk = await query()
    assert.equal(invalidSdk.error?.code, -32803, JSON.stringify(invalidSdk))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.recovery.complete"))
  })
