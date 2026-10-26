import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"
import { groupInputWorkspace } from "../fixtures/semantic-group-input-workspace.mjs"

test("an edited SDK-partial prepared Program answers first references before candidate planning in one worker request",
  { timeout: 30_000 }, async t => {
    const { session, workspace, sdk, rootUri, uri, events } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1" })
    const source = "export class Target { value: number = 1; read(): number { return this.value } }\nexport const result = new Target().value\n"
    fs.writeFileSync(path.join(workspace, "Target.ets"), source)
    fs.writeFileSync(path.join(workspace, "Broken.ets"), 'import unavailable from "@ohos.missing"\nexport { unavailable }\n')
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "partial")
    const progress = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    await session.transport.progress(progress.params.token, message => message.params.value.kind === "end", 10_000)
    const targetUri = uri("Target.ets"), position = positionAt(source, source.indexOf("value:") + 1)
    session.openDocument({ uri: targetUri, version: 1, text: source })
    const rename = await session.request("textDocument/rename", {
      textDocument: { uri: targetUri }, position, newName: "probe" })
    assert.equal(rename.error, undefined, JSON.stringify(rename))
    const updated = applyWorkspaceEdit(new Map([[targetUri, source]]), rename.result,
      { documentVersions: new Map([[targetUri, 1]]) }).get(targetUri)
    session.changeDocument({ uri: targetUri, version: 2, text: updated })
    const before = events().length
    const response = await session.request("textDocument/references", {
      textDocument: { uri: targetUri }, position, context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    const expected = [...updated.matchAll(/\bprobe\b/g)].map(match => ({ uri: targetUri, range: {
      start: positionAt(updated, match.index), end: positionAt(updated, match.index + 5) } }))
    assert.deepEqual(response.result, expected)
    const observed = events().slice(before)
    t.diagnostic(JSON.stringify(observed.filter(row => row.event.startsWith("references."))
      .map(row => ({ event: row.event, reason: row.reason }))))
    assert.equal(observed.filter(row => row.event === "references.queue.start").length, 1,
      "the first edited query must synchronize the already prepared owner without a proof-only round trip")
    assert.equal(observed.filter(row => row.event === "references.candidate-selection.complete").length, 0,
      "a complete retained owner should answer before candidate or anchor preparation")
    assert.ok(!observed.some(row => row.event === "references.batch.start" || row.event === "semantic.context.create"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("module groups retain dependency Programs across A B C A and global scans while pressure permits",
  { timeout: 30_000 }, async t => {
    const fixture = createReadinessFixture(t, { ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
      NODE_OPTIONS: `--require=${fileURLToPath(new URL("../fixtures/initial-preparation-parses.cjs", import.meta.url))}` })
    const { session, directory, workspace, sdk, rootUri, events, uri } = fixture
    const files = {
      "a/src/main/ets/Query.ets": 'import { LocalA } from "./Local"\nexport const valueA = new LocalA()\n',
      "a/src/main/ets/Local.ets": "export class LocalA { aMarker: number = 1 }\n",
      "b/src/main/ets/Query.ets": 'import { LocalB } from "./Local"\nexport const valueB = new LocalB()\n',
      "b/src/main/ets/Local.ets": "export class LocalB { bMarker: number = 2 }\n",
      "b/src/main/ets/Extra.ets": "export const unrelated = 1\n",
      "shared/src/main/ets/Shared.ets": "export interface Shared { value: number }\n",
    }
    for (const module of ["a", "b"]) files[`${module}/src/main/ets/Query.ets`] +=
      `import { Shared } from "shared"\nexport const shared${module}: Shared = { value: 1 }\n`
    files["c/src/main/ets/Query.ets"] = 'import { LocalC } from "./Local"\nexport const valueC = new LocalC()\n'
    files["c/src/main/ets/Local.ets"] = "export class LocalC { cMarker: number = 3 }\n"
    fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default" }] }, modules: ["a", "b", "c", "shared"].map(name => ({
        name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true })
      fs.writeFileSync(path.join(workspace, file), text)
    }
    for (const module of ["a", "b", "c", "shared"]) {
      fs.writeFileSync(path.join(workspace, module, "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
      fs.writeFileSync(path.join(workspace, module, "oh-package.json5"), JSON.stringify({ name: module,
        main: module === "shared" ? "./src/main/ets/Shared.ets" : "./src/main/ets/Local.ets",
        dependencies: module === "shared" ? {} : { shared: "file:../shared" } }))
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const initialized = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(initialized.params.report.semanticState, "ready", JSON.stringify(initialized.params))
    const begin = events().length
    const samples = []
    for (const module of ["a", "b", "a", "c", "a", "b"]) {
      const file = `${module}/src/main/ets/Query.ets`
      const name = `Local${module.toUpperCase()}`
      if (!session.documentVersions.has(uri(file))) session.openDocument({ uri: uri(file), version: 1, text: files[file] })
      const offset = samples.length === 2 ? files[file].indexOf(name) : files[file].lastIndexOf(name)
      const response = await session.request("textDocument/definition", {
        textDocument: { uri: uri(file) }, position: positionAt(files[file], offset + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: uri(`${module}/src/main/ets/Local.ets`),
        range: { start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }])
      samples.push(events().slice(begin).filter(row => row.event === "semantic.definition.complete").at(-1))
      if (samples.length === 3) {
        const shared = "shared/src/main/ets/Shared.ets"
        const references = await session.request("textDocument/references", {
          textDocument: { uri: uri(shared) }, position: positionAt(files[shared], files[shared].indexOf("Shared") + 1),
          context: { includeDeclaration: true } })
        assert.equal(references.error, undefined, JSON.stringify(references))
        const expected = [[shared, files[shared].indexOf("Shared")], ...["a", "b"].flatMap(owner => {
          const source = `${owner}/src/main/ets/Query.ets`
          return [[source, files[source].indexOf("Shared")], [source, files[source].lastIndexOf("Shared")]]
        })].map(([source, offset]) => ({ uri: uri(source), range: {
          start: positionAt(files[source], offset), end: positionAt(files[source], offset + 6) } }))
        const sorted = locations => [...locations].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        assert.deepEqual(sorted(references.result), sorted(expected), "full references include both interaction groups")
      }
    }
    assert.ok(samples.every(Boolean), "observe native compiler Program statistics for each actual definition")
    assert.deepEqual(samples.map(row => row.programProjectRootFiles), [3, 4, 3, 3, 3, 4],
      "each module includes its own sources and shared dependency, excluding the unrelated module")
    assert.notEqual(samples[0].programSequence, samples[1].programSequence)
    assert.equal(samples[0].programSequence, samples[2].programSequence, "returning to A reuses its prepared Program")
    assert.equal(samples[2].programSequence, samples[4].programSequence, "global scans and C admission preserve recent A")
    assert.equal(samples[1].programSequence, samples[5].programSequence,
      "admitting C must preserve B when real memory pressure permits retaining both")
    assert.ok(!events().slice(begin).some(row => row.event === "semantic.context.evict"
      && row.reason.startsWith("capacity-")), "a fixed context count must not force cold rebuilds below pressure")
    const beforeEdit = events().filter(row => row.event === "semantic.context.create").length
    const localA = "a/src/main/ets/Local.ets"
    const changed = `// moved declaration\n${files[localA]}`
    session.openDocument({ uri: uri(localA), version: 1, text: files[localA] })
    session.changeDocument({ uri: uri(localA), version: 2, text: changed })
    const edited = await session.request("textDocument/definition", { textDocument: { uri: uri("a/src/main/ets/Query.ets") },
      position: positionAt(files["a/src/main/ets/Query.ets"], files["a/src/main/ets/Query.ets"].lastIndexOf("LocalA") + 1) })
    assert.equal(edited.error, undefined, JSON.stringify(edited))
    assert.deepEqual(edited.result, [{ uri: uri(localA), range: {
      start: { line: 1, character: 13 }, end: { line: 1, character: 19 } } }])
    assert.equal(events().filter(row => row.event === "semantic.context.create").length, beforeEdit,
      "an ordinary overlay edit updates the retained LS")
    const localB = "b/src/main/ets/Local.ets"
    fs.writeFileSync(path.join(workspace, localB), `// disk delta\n${files[localB]}`)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri(localB), type: 2 }] } })
    const disk = await session.request("textDocument/definition", { textDocument: { uri: uri("b/src/main/ets/Query.ets") },
      position: positionAt(files["b/src/main/ets/Query.ets"], files["b/src/main/ets/Query.ets"].lastIndexOf("LocalB") + 1) })
    assert.equal(disk.error, undefined, JSON.stringify(disk))
    assert.deepEqual(disk.result, [{ uri: uri(localB), range: {
      start: { line: 1, character: 13 }, end: { line: 1, character: 19 } } }])
    assert.equal(events().filter(row => row.event === "semantic.prepare.complete").at(-1)?.newEntry, false,
      "a proven disk delta updates the retained group LS; the independent full-root proof may rebuild conservatively")
    const unsaved = "a/src/main/ets/Unsaved.ets"
    const unsavedText = 'import { LocalA } from "./Local"\nexport const newValue = new LocalA()\n'
    assert.equal(fs.existsSync(path.join(workspace, unsaved)), false)
    session.openDocument({ uri: uri(unsaved), version: 1, text: unsavedText })
    const opened = await session.request("textDocument/definition", { textDocument: { uri: uri(unsaved) },
      position: positionAt(unsavedText, unsavedText.lastIndexOf("LocalA") + 1) })
    assert.equal(opened.error, undefined, JSON.stringify(opened))
    assert.deepEqual(opened.result, [{ uri: uri(localA), range: {
      start: { line: 1, character: 13 }, end: { line: 1, character: 19 } } }], "unsaved legal sources join their module roots")
    const parses = fs.readFileSync(path.join(directory, "initial-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(parses.filter(row => row.file.endsWith("/sdk/ets/component/common.d.ts")).length, 1,
      "all retained Programs share the single initialized SDK parse")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an SDK-partial retained full-scope owner synchronizes a rename and searches unopened callers without disposable batches",
  { timeout: 30_000 }, async t => {
    const { session, workspace, sdk, rootUri, uri, events, directory } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${fileURLToPath(new URL("../fixtures/initial-preparation-parses.cjs", import.meta.url))}` })
    const files = {
      "Target.ets": "export class Target { value: number = 1; read(): number { return this.value } }\nexport const result = new Target().value\n",
      "Caller.ets": 'import { Target } from "./Target"\nexport const usage = new Target().value\n',
      "Homonym.ets": "export class Unrelated { value: string = 'other' }\nexport const ignored = new Unrelated().value\n",
      "Broken.ets": 'import unavailable from "@ohos.missing"\nexport { unavailable }\n',
    }
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(workspace, file), text)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const initialized = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(initialized.params.report.semanticState, "partial", "do not hide the genuine missing SDK input")
    const progress = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    await session.transport.progress(progress.params.token, message => message.params.value.kind === "end", 10_000)
    const source = files["Target.ets"], targetUri = uri("Target.ets")
    const position = positionAt(source, source.indexOf("value:") + 1)
    const unopened = await session.request("textDocument/references", {
      textDocument: { uri: targetUri }, position, context: { includeDeclaration: true } })
    assert.equal(unopened.error, undefined, JSON.stringify(unopened))
    assert.equal(unopened.result.length, 4, "first disk-source search has all callers before any diagnostics can prequery")
    session.openDocument({ uri: targetUri, version: 1, text: source })
    const rename = await session.request("textDocument/rename", {
      textDocument: { uri: targetUri }, position, newName: "probe" })
    assert.equal(rename.error, undefined, JSON.stringify(rename))
    assert.equal(rename.result.documentChanges.flatMap(change => change.edits).length, 4)
    const updated = applyWorkspaceEdit(new Map(Object.entries(files).map(([file, text]) => [uri(file), text])),
      rename.result, { documentVersions: new Map(Object.keys(files).map(file => [uri(file), file === "Target.ets" ? 1 : null])) })
    for (const [file, text] of Object.entries(files)) {
      const content = updated.get(uri(file))
      if (content === text) continue
      if (file === "Target.ets") session.changeDocument({ uri: targetUri, version: 2, text: content })
      else session.openDocument({ uri: uri(file), version: 1, text: content })
    }
    const before = events().length
    const expected = ["Target.ets", "Caller.ets"].flatMap(file => {
      const text = updated.get(uri(file))
      return [...text.matchAll(/\bprobe\b/g)].map(match => ({ uri: uri(file), range: {
        start: positionAt(text, match.index), end: positionAt(text, match.index + 5) } }))
    })
    for (const includeDeclaration of [true, false]) {
      const response = await session.request("textDocument/references", {
        textDocument: { uri: targetUri }, position, context: { includeDeclaration } })
      assert.equal(response.error, undefined, JSON.stringify(response))
      const wanted = includeDeclaration ? expected : expected.filter(location =>
        location.uri !== targetUri || location.range.start.line !== position.line
        || location.range.start.character !== position.character - 1)
      const sorted = locations => locations.map(location => JSON.stringify(location)).sort()
      assert.deepEqual(sorted(response.result), sorted(wanted), "preserve exact references and exclude the homonym")
    }
    const operations = events().slice(before)
    assert.ok(!operations.some(row => row.event === "references.batch.start"),
      "a compatible retained full-scope Program must not fall back to disposable verification after rename")
    assert.ok(!operations.some(row => row.event === "semantic.context.create"),
      "overlay edits synchronize the existing language service")
    const parses = fs.readFileSync(path.join(directory, "initial-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(parses.filter(row => row.file.endsWith("/sdk/ets/component/common.d.ts")).length, 1,
      "anchor selection and reference search must consume the SDK initialized in their existing owner")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("default member completion keeps its stable module scope, ambient augmentation and retained LS after reopen",
  { timeout: 30_000 }, async t => {
    const { session, workspace, sdk, rootUri, uri, events } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1" })
    const files = {
      "a/src/main/ets/Query.ets": 'import { LocalA } from "./Local"\nexport const selected = new LocalA()\nexport const result = selected.aMarker\n',
      "a/src/main/ets/Local.ets": "export class LocalA { aMarker: number = 1; ambient: GlobalMarker = { value: 1 } }\n",
      "b/src/main/ets/Query.ets": 'import { LocalB } from "./Local"\nexport const unused = new LocalB()\n',
      "b/src/main/ets/Local.ets": "export class LocalB { bMarker: number = 2 }\n",
      "a/src/main/ets/Globals.d.ts": "interface GlobalMarker { value: number }\n",
      "a/src/main/ets/Augmentation.d.ts": 'import { LocalA } from "./Local"\ndeclare module "./Local" { interface LocalA { augmented: number } }\n',
    }
    fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default" }] }, modules: ["a", "b"].map(name => ({
        name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true })
      fs.writeFileSync(path.join(workspace, file), text)
    }
    for (const module of ["a", "b"]) {
      fs.writeFileSync(path.join(workspace, module, "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
      fs.writeFileSync(path.join(workspace, module, "oh-package.json5"), JSON.stringify({
        name: module, main: "./src/main/ets/Local.ets", dependencies: {} }))
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    const file = "a/src/main/ets/Query.ets", text = files[file]
    const position = positionAt(text, text.lastIndexOf("selected.") + "selected.".length)
    session.openDocument({ uri: uri(file), version: 1, text })
    const complete = async () => {
      const response = await session.request("textDocument/completion", {
        textDocument: { uri: uri(file) }, position, context: { triggerKind: 1 } })
      assert.equal(response.error, undefined, JSON.stringify(response))
      const items = Array.isArray(response.result) ? response.result : response.result.items
      for (const label of ["aMarker", "ambient", "augmented"]) {
        assert.ok(items.some(item => item.label === label), `preserve complete member ${label}`)
      }
      assert.equal(events().filter(row => row.event === "completion.program.complete").at(-1)?.programProjectRootFiles, 4,
        "the module and both ambient declarations are roots; the two unrelated B files are excluded")
      const item = items.find(candidate => candidate.label === "aMarker")
      const resolved = await session.request("completionItem/resolve", item)
      assert.equal(resolved.error, undefined, JSON.stringify(resolved))
      assert.equal(resolved.result.detail, "(property) LocalA.aMarker: number")
      assert.deepEqual(resolved.result.data, item.data, "resolve preserves its server-owned handle")
      assert.equal(events().filter(row => row.event === "completion.resolve.program.complete").at(-1)?.programProjectRootFiles, 4,
        "member resolve must use the same stable module and ambient scope as its list")
    }
    await complete()
    const created = events().filter(row => row.event === "semantic.context.create").length
    await complete()
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: uri(file) } } })
    session.documentVersions.delete(uri(file))
    session.openDocument({ uri: uri(file), version: 1, text })
    await complete()
    assert.equal(events().filter(row => row.event === "semantic.context.create").length, created,
      "close/reopen synchronizes authority in the retained module LS: " + JSON.stringify(events()
        .filter(row => row.event === "semantic.prepare.complete" || row.event === "semantic.context.evict").slice(-12)))
    const rename = await session.request("textDocument/rename", {
      textDocument: { uri: uri(file) }, position, newName: "renamed" })
    assert.equal(rename.error, undefined, JSON.stringify(rename))
    assert.equal(rename.result.documentChanges.flatMap(change => change.edits).length, 2,
      "the complete owner still finds both current field locations after the group consumed the close delta")
    assert.equal(events().filter(row => row.event === "semantic.context.create").length, created,
      "a group query must not consume the evidence needed to incrementally synchronize the complete owner")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a retained module consumes an unrelated closed-file edit without scanning its compiler input versions",
  { timeout: 30_000 }, async t => {
    const { session, directory, workspace, sdk, rootUri, uri, events } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${fileURLToPath(new URL("../fixtures/semantic-group-version-counter.cjs", import.meta.url))}` })
    const modules = ["a", "b"]
    const source = name => `export class Local${name.toUpperCase()} { marker: number = 1 }\nexport const result = new Local${name.toUpperCase()}()\n`
    fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default" }] }, modules: modules.map(name => ({
        name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
    for (const name of modules) {
      const module = path.join(workspace, name)
      fs.mkdirSync(path.join(module, "src/main/ets"), { recursive: true })
      fs.writeFileSync(path.join(module, "src/main/ets/Query.ets"), source(name))
      fs.writeFileSync(path.join(module, "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
      fs.writeFileSync(path.join(module, "oh-package.json5"), JSON.stringify({
        name, main: "./src/main/ets/Query.ets", dependencies: {} }))
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const progress = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    await session.transport.progress(progress.params.token, message => message.params.value.kind === "end", 10_000)
    const a = "a/src/main/ets/Query.ets", b = "b/src/main/ets/Query.ets"
    const checks = () => fs.readFileSync(path.join(directory, "group-program-checks.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse).filter(row => row.roots.includes(path.join(workspace, a))
        && !row.roots.includes(path.join(workspace, b)))
    const query = async () => {
      const response = await session.request("textDocument/definition", { textDocument: { uri: uri(a) },
        position: positionAt(source("a"), source("a").lastIndexOf("LocalA") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: uri(a), range: {
        start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }])
    }
    await query()
    await query()
    const before = checks().length
    const buildsBefore = events().filter(row => row.event === "semantic.context.create").length
    fs.writeFileSync(path.join(workspace, b), `// unrelated body edit\n${source("b")}`)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri(b), type: 2 }] } })
    await query()
    const observed = checks().length - before
    t.diagnostic(JSON.stringify({ unrelatedEditCompilerScans: observed,
      contextCreates: events().filter(row => row.event === "semantic.context.create").length - buildsBefore,
      preparations: events().filter(row => row.event === "semantic.prepare.complete").slice(-2) }))
    assert.equal(observed, 0,
      "an unrelated closed-file edit must not run isProgramUptoDate over the retained module's sources")
    assert.equal(events().filter(row => row.event === "semantic.context.create").length, buildsBefore)
    await query()
    assert.equal(checks().length, before, "the consumed root event stays consumed on a repeated query")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("group deltas retain actual cross-root compiler dependencies beyond the delivered text window",
  { timeout: 45_000 }, async t => {
    const query = "a/src/main/ets/Query.ets", deep = "b/src/main/ets/Deep.ets"
    const text = 'import { Deep } from "./Chain000"\nexport const result = new Deep().marker\n'
    const target = "export class Deep { marker: number = 1 }\n"
    const files = { [query]: text, [deep]: target, "b/src/main/ets/Query.ets": "export const unrelated = 1\n" }
    for (let index = 0; index < 270; index++) files[`a/src/main/ets/Chain${String(index).padStart(3, "0")}.ets`] =
      `export { Deep } from "${index === 269 ? "../../../../b/src/main/ets/Deep"
        : `./Chain${String(index + 1).padStart(3, "0")}`}"\n`
    const { session, uri, write, watch, define, events, preparation } = await groupInputWorkspace(t, files)
    assert.equal(preparation.semanticState, "ready", JSON.stringify(preparation))
    const expected = line => [{ uri: uri(deep), range: {
      start: { line, character: 13 }, end: { line, character: 17 } } }]
    const first = await define(query, text, "Deep")
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.deepEqual(first.result, expected(0))
    const observed = events().filter(row => row.event === "semantic.definition.complete").at(-1)
    assert.equal(observed.programProjectRootFiles, 271)
    assert.equal(observed.programProjectFiles, 272, "the compiler really loaded the B dependency outside A's roots")
    t.diagnostic(JSON.stringify({ actualProjectFiles: observed.programProjectFiles,
      compilerRootFiles: observed.programProjectRootFiles, rawTextWindowLimit: 256 }))
    write(deep, `// changed disk declaration\n${target}`)
    watch(deep)
    const changed = await define(query, text, "Deep")
    assert.equal(changed.error, undefined, JSON.stringify(changed))
    assert.deepEqual(changed.result, expected(1), "root exclusion must not discard an actually loaded dependency")
    session.openDocument({ uri: uri(deep), version: 1, text: `// changed disk declaration\n${target}` })
    session.changeDocument({ uri: uri(deep), version: 2, text: `// overlay one\n// overlay two\n${target}` })
    const overlay = await define(query, text, "Deep")
    assert.equal(overlay.error, undefined, JSON.stringify(overlay))
    assert.deepEqual(overlay.result, expected(2), "an out-of-root overlay keeps its authoritative edited text")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("group clocks preserve negative resolution recovery and ambient edits from another module",
  { timeout: 30_000 }, async t => {
    const query = "a/src/main/ets/Query.ets", missing = "a/src/main/ets/Missing.ets"
    const ambient = "b/src/main/ets/Globals.d.ts"
    const text = 'import { Missing } from "./Missing"\ndeclare const ambient: GlobalMarker\nexport const result = ambient.oldMarker\nexport const usage = new Missing()\n'
    const globals = "interface GlobalMarker { oldMarker: number }\n"
    const { session, uri, write, watch, define, preparation } = await groupInputWorkspace(t, {
      [query]: text, [ambient]: globals, "b/src/main/ets/Query.ets": "export const unrelated = 1\n" })
    assert.equal(preparation.semanticState, "degraded", "the unresolved input must remain visible")
    const expected = (file, source, symbol) => [{ uri: uri(file), range: {
      start: positionAt(source, source.indexOf(symbol)), end: positionAt(source, source.indexOf(symbol) + symbol.length) } }]
    const old = await define(query, text, "oldMarker")
    assert.equal(old.error, undefined, JSON.stringify(old))
    assert.deepEqual(old.result, expected(ambient, globals, "oldMarker"))
    const unresolved = await define(query, text, "Missing")
    assert.equal(unresolved.error, undefined, JSON.stringify(unresolved))
    assert.ok(!(unresolved.result ?? []).some(location => location.uri === uri(missing)))
    const created = "export class Missing {}\n"
    write(missing, created)
    watch(missing, 1)
    const recovered = await define(query, text, "Missing")
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, expected(missing, created, "Missing"), "a previous negative lookup cannot remain cached")
    const nextGlobals = globals.replace("oldMarker", "newMarker")
    write(ambient, nextGlobals)
    watch(ambient)
    const next = text.replace("oldMarker", "newMarker")
    session.openDocument({ uri: uri(query), version: 1, text })
    session.changeDocument({ uri: uri(query), version: 2, text: next })
    const augmented = await define(query, next, "newMarker")
    assert.equal(augmented.error, undefined, JSON.stringify(augmented))
    assert.deepEqual(augmented.result, expected(ambient, nextGlobals, "newMarker"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("compiler input metadata overflow revokes group exclusions instead of treating a truncated set as complete",
  { timeout: 30_000 }, async t => {
    const query = "a/src/main/ets/Query.ets", other = "b/src/main/ets/Query.ets"
    const text = "export class Marker {}\nexport const result = new Marker()\n"
    const { session, directory, workspace, uri, write, watch, define } = await groupInputWorkspace(t, {
      [query]: text, [other]: "export const unused = 1\n" }, {
      ARKTS_TEST_GROUP_INPUT_OVERFLOW: "1",
      NODE_OPTIONS: `--require=${fileURLToPath(new URL("../fixtures/semantic-group-version-counter.cjs", import.meta.url))}` })
    const expected = [{ uri: uri(query), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }]
    assert.deepEqual((await define(query, text, "Marker")).result, expected)
    const checks = () => fs.readFileSync(path.join(directory, "group-program-checks.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse).filter(row => row.roots.includes(path.join(workspace, query))
        && !row.roots.includes(path.join(workspace, other))).length
    const before = checks()
    write(other, "export const unused = 2\n")
    watch(other)
    const response = await define(query, text, "Marker")
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, expected)
    assert.ok(checks() > before, "overflowed metadata must retain the whole source delta and synchronize conservatively")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a transient group source read failure recovers on the next witnessed same-membership catalog update",
  { timeout: 30_000 }, async t => {
    const query = "a/src/main/ets/000Query.ets", other = "b/src/main/ets/Query.ets"
    const text = "declare const recovered: Recovered\nexport const result = recovered.restoredMember\n"
    const files = { [query]: text, [other]: "export const unused = 1\n",
      "a/src/main/ets/ZRecovered.ets": "class Recovered { restoredMember: number = 1 }\n" }
    for (let index = 0; index < 270; index++) files[`a/src/main/ets/Filler${String(index).padStart(3, "0")}.ets`] =
      `export const filler${index} = ${index}\n`
    const { session, directory, uri, write, watch } = await groupInputWorkspace(t, files, {
      NODE_OPTIONS: `--require=${fileURLToPath(new URL("../fixtures/semantic-group-source-read-failure.cjs", import.meta.url))}` })
    const failure = JSON.parse(fs.readFileSync(path.join(directory, "group-source-read-failure.json"), "utf8"))
    assert.equal(failure.pid, session.transport.child.pid)
    assert.ok(failure.threadId > 0 && failure.stack.includes("TypeScriptLazySnapshots.load"))
    const complete = () => session.request("textDocument/completion", { textDocument: { uri: uri(query) },
      position: positionAt(text, text.indexOf("recovered.") + "recovered.".length), context: { triggerKind: 1 } })
    const first = await complete()
    assert.equal(first.error, undefined, JSON.stringify(first))
    const labels = response => (Array.isArray(response.result) ? response.result : response.result.items).map(item => item.label)
    assert.ok(!labels(first).includes("restoredMember"), "the failed group input is actually missing before recovery")
    write(other, "export const unused = 2\n")
    watch(other)
    const recovered = await complete()
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.ok(labels(recovered).includes("restoredMember"), "catalog recovery must synchronize the previously unavailable source")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
