import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("module groups keep only their dependency roots and reuse the original Program across A B A",
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
    assert.notEqual(samples[1].programSequence, samples[5].programSequence, "the least recent B is rebuilt after C admission")
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
