import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"

for (const fileCount of [128, 400, 1024]) {
  test(`retained edited Program avoids unchanged project text rereads with ${fileCount} actual roots`,
    { timeout: 30_000 }, async t => {
      const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
        ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
        NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/lazy-source-read-counter.cjs")}` })
      const source = "export class Target { value: number = 1; read(): number { return this.value } }\n"
        + "export const result = new Target().value\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), source)
      fs.writeFileSync(path.join(workspace, "Broken.ets"), 'import missing from "@ohos.missing"\nexport { missing }\n')
      for (let index = 0; index < fileCount; index++) fs.writeFileSync(path.join(workspace,
        `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
      await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
      const initialized = await session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
      assert.equal(initialized.params.report.semanticState, "partial")
      const target = uri("Main.ets"), position = positionAt(source, source.indexOf("value:") + 1)
      session.openDocument({ uri: target, version: 1, text: source })
      const query = () => session.request("textDocument/references", {
        textDocument: { uri: target }, position, context: { includeDeclaration: true } })
      const before = await query()
      assert.equal(before.error, undefined, JSON.stringify(before)); assert.equal(before.result.length, 3)
      assert.ok(events().some(event => event.event === "semantic.references.complete"
        && event.programProjectFiles >= fileCount + 3), "filler roots actually participate in the searched Program")
      const rename = await session.request("textDocument/rename", {
        textDocument: { uri: target }, position, newName: "probe" })
      assert.equal(rename.error, undefined, JSON.stringify(rename))
      const updated = applyWorkspaceEdit(new Map([[target, source]]), rename.result,
        { documentVersions: new Map([[target, 1]]) }).get(target)
      const contextCount = events().filter(event => event.event === "semantic.context.create").length
      fs.writeFileSync(path.join(directory, "lazy-read-phase"), "edited")
      session.changeDocument({ uri: target, version: 2, text: updated })
      const response = await query()
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [...updated.matchAll(/\bprobe\b/g)].map(match => ({ uri: target, range: {
        start: positionAt(updated, match.index), end: positionAt(updated, match.index + 5) } })))
      assert.equal(events().filter(event => event.event === "semantic.context.create").length, contextCount)
      const observations = fs.readdirSync(directory).filter(file => /^lazy-source-reads-\d+\.json$/.test(file))
        .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")))
      assert.equal(observations.length, 1, "one actual initialized semantic owner")
      const reads = Object.values(observations[0].phases.edited ?? {})
      const count = reads.reduce((sum, row) => sum + row.successes, 0)
      t.diagnostic(JSON.stringify({ fileCount, phase: "edited overlay through complete response", actualReadFiles: reads.length,
        actualSuccessfulLazyTextReads: count, actualReadBytes: reads.reduce((sum, row) => sum + row.bytes, 0),
        actualReadDurationMs: reads.reduce((sum, row) => sum + row.durationMs, 0),
        compiler: events().filter(event => event.event === "semantic.references.complete").at(-1), observations }))
      assert.equal(count, 0, "unchanged actual compiler inputs must not reread text because a separate LRU is smaller than the Program")
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    })
}

test("edited references keep the compiler's actual project snapshots reusable after collection",
  { timeout: 30_000 }, async t => {
    const { session, sdk, workspace, directory, rootUri, uri } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: ["lazy-source-read-counter.cjs", "lazy-snapshot-gc.cjs"]
        .map(file => `--require=${path.resolve("tests/fixtures", file)}`).join(" ") })
    const source = "export class Target { value: number = 1; read(): number { return this.value } }\n"
      + "export const result = new Target().value\n"
    const main = "app/src/main/ets/Target.ets", noise = "noise/src/main/ets"
    for (const module of ["app", "noise"]) {
      fs.mkdirSync(path.join(workspace, module, "src/main/ets"), { recursive: true })
      fs.writeFileSync(path.join(workspace, module, "build-profile.json5"), "{targets:[{name:'default'}]}")
      fs.writeFileSync(path.join(workspace, module, "oh-package.json5"), JSON.stringify({ name: module }))
    }
    fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default" }] }, modules: ["app", "noise"].map(name => ({ name,
        srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
    fs.writeFileSync(path.join(workspace, main), source)
    fs.writeFileSync(path.join(workspace, "app/src/main/ets/Broken.ets"),
      'import missing from "@ohos.missing"\nexport { missing }\n')
    for (let index = 0; index < 400; index++) fs.writeFileSync(path.join(workspace,
      noise, `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "partial")
    const target = uri(main), position = positionAt(source, source.indexOf("value:") + 1)
    session.openDocument({ uri: target, version: 1, text: source })
    const query = () => session.request("textDocument/references", {
      textDocument: { uri: target }, position, context: { includeDeclaration: true } })
    assert.equal((await query()).result.length, 3)
    const renamed = await session.request("textDocument/rename", {
      textDocument: { uri: target }, position, newName: "probe" })
    assert.equal(renamed.error, undefined, JSON.stringify(renamed))
    const edited = applyWorkspaceEdit(new Map([[target, source]]), renamed.result,
      { documentVersions: new Map([[target, 1]]) }).get(target)
    session.changeDocument({ uri: target, version: 2, text: edited })
    assert.equal((await query()).result.length, 3)
    fs.writeFileSync(path.join(directory, "collect-lazy-snapshot-gc"), "collect")
    const receipt = path.join(directory, "lazy-snapshot-gc.json"), deadline = Date.now() + 5000
    while (!fs.existsSync(receipt) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.ok(fs.existsSync(receipt), "collect in the actual semantic Worker between requests")
    const gc = JSON.parse(fs.readFileSync(receipt, "utf8"))
    assert.equal(gc.pid, session.transport.child.pid); assert.ok(gc.threadId > 0); assert.equal(gc.collections, 2)
    fs.writeFileSync(path.join(directory, "lazy-read-phase"), "after-gc")
    const current = edited.replace("number = 1", "number = 2")
    session.changeDocument({ uri: target, version: 3, text: current })
    const response = await query()
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [...current.matchAll(/\bprobe\b/g)].map(match => ({ uri: target, range: {
      start: positionAt(current, match.index), end: positionAt(current, match.index + 5) } })))
    const rows = fs.readdirSync(directory).filter(file => /^lazy-source-reads-\d+\.json$/.test(file))
      .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")))
    const reads = rows.flatMap(row => Object.values(row.phases["after-gc"] ?? {}))
    const count = reads.reduce((sum, row) => sum + row.successes, 0)
    t.diagnostic(JSON.stringify({ gc, projectRoots: 404, rereadsAfterCollection: count }))
    assert.equal(count, 0, "GC must not discard the input mapping of a still compiler-owned snapshot")
    assert.deepEqual((await session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
  })
