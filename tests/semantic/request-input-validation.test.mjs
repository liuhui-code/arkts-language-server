import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("one warm LSP query validates each loaded SDK identity before use and once at final publication",
  { timeout: 30_000 }, async t => {
    const { session, sdk, workspace, directory, rootUri, uri } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/request-input-validation-counter.cjs")}` })
    const api = path.join(sdk, "ets", "api")
    fs.mkdirSync(api)
    for (let index = 0; index < 96; index++) fs.writeFileSync(path.join(api, `@ohos.inputcheck${index}.d.ts`),
      `export declare class Check${index} { value: number }\n`)
    const source = Array.from({ length: 96 }, (_, index) =>
      `import { Check${index} } from '@ohos.inputcheck${index}'`).join("\n")
      + "\nexport const selected = new Check95()\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const initialized = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(initialized.params.report.semanticState, "ready", JSON.stringify(initialized.params))
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: source })
    const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(diagnostics.params.diagnostics, [])
    const query = async () => {
      const response = await session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
        position: positionAt(source, source.lastIndexOf("Check95") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: pathToFileURL(path.join(api, "@ohos.inputcheck95.d.ts")).href,
        range: { start: { line: 0, character: 21 }, end: { line: 0, character: 28 } } }])
    }
    await query()
    fs.writeFileSync(path.join(directory, "arm-input-validation"), "query")
    await query()
    const observations = fs.readdirSync(directory).filter(name => /^input-validation-\d+\.json$/.test(name))
      .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")))
      .filter(row => Object.keys(row.paths).length > 0)
    assert.equal(observations.length, 1, "all observations belong to the actual initialized semantic owner")
    const counts = Object.values(observations[0].paths)
    assert.equal(counts.length, 96, "every loaded SDK input retains a fresh identity check")
    assert.ok(counts.every(count => count === 2),
      `equivalent witness validations must be shared inside the query: ${JSON.stringify(counts)}`)
    t.diagnostic(JSON.stringify({ sdkInputs: counts.length, validations: counts.reduce((sum, value) => sum + value, 0),
      perInput: [...new Set(counts)], owners: observations.length }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

for (const degraded of [false, true]) {
test(`retained ${degraded ? "degraded" : "READY"} full-scope references never publish stale locations from an unnotified source beyond preload`,
  { timeout: 30_000 }, async t => {
    const { session, sdk, workspace, rootUri, uri } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1" })
    const target = "export class TargetOne {}\nexport class TargetTwo {}\n"
    const caller = 'import { TargetOne, TargetTwo } from "./Target"\nclass UnusedOne {}\n'
      + "export const one = new TargetOne()\nexport const two = new UnusedOne()\n"
    fs.writeFileSync(path.join(workspace, "Target.ets"), target)
    if (degraded) fs.writeFileSync(path.join(workspace, "Broken.ets"), 'import missing from "@ohos.unavailable"\nexport { missing }\n')
    const disk = path.join(workspace, "ZZCaller.ets")
    fs.writeFileSync(disk, caller)
    for (let index = 0; index < 320; index++) fs.writeFileSync(
      path.join(workspace, `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const initialized = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(initialized.params.report.semanticState, degraded ? "degraded" : "ready", JSON.stringify(initialized.params))
    session.openDocument({ uri: uri("Target.ets"), version: 1, text: target })
    const query = symbol => session.request("textDocument/references", {
      textDocument: { uri: uri("Target.ets") }, position: positionAt(target, target.indexOf(symbol) + 1),
      context: { includeDeclaration: false } })
    const first = await query("TargetOne")
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.equal(first.result.length, 2)
    const before = fs.statSync(disk)
    const changed = caller.replace("new UnusedOne()", "new TargetTwo()")
    assert.equal(changed.length, caller.length)
    fs.writeFileSync(disk, changed)
    fs.utimesSync(disk, before.atime, before.mtime)
    const current = await query("TargetTwo")
    if (current.error) assert.equal(current.error.code, -32803, JSON.stringify(current))
    else {
      const expected = [...changed.matchAll(/\bTargetTwo\b/g)].map(match => ({ uri: uri("ZZCaller.ets"), range: {
        start: positionAt(changed, match.index), end: positionAt(changed, match.index + 9) } }))
      assert.deepEqual(current.result, expected, "an uncached symbol must include the new usage or explicitly reject stale inputs")
    }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

for (const queueTrace of ["0", "1"]) {
test(`references cannot publish an old result after READY identity construction changes an unpreloaded source (trace=${queueTrace})`,
  { timeout: 30_000 }, async t => {
    const { session, sdk, workspace, directory, rootUri, uri } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      ARKTS_SEMANTIC_QUEUE_TRACE: queueTrace,
      NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/reference-ready-final-window.cjs")}` })
    const target = "export class TargetOne {}\nexport class TargetTwo {}\n"
    const caller = 'import { TargetOne, TargetTwo } from "./Target"\nclass UnusedOne {}\n'
      + "export const one = new TargetOne()\nexport const two = new UnusedOne()\n"
    fs.writeFileSync(path.join(workspace, "Target.ets"), target)
    fs.writeFileSync(path.join(workspace, "ZZCaller.ets"), caller)
    for (let index = 0; index < 320; index++) fs.writeFileSync(path.join(workspace,
      `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    session.openDocument({ uri: uri("Target.ets"), version: 1, text: target })
    const query = symbol => session.request("textDocument/references", { textDocument: { uri: uri("Target.ets") },
      position: positionAt(target, target.indexOf(symbol) + 1), context: { includeDeclaration: false } })
    assert.equal((await query("TargetOne")).result.length, 2)
    const changed = caller.replace("new UnusedOne()", "new TargetTwo()")
    fs.writeFileSync(path.join(directory, "arm-reference-ready-final.json"), JSON.stringify({ triggerText: caller, text: changed }))
    session.changeDocument({ uri: uri("Target.ets"), version: 2, text: target + "// ordinary query refresh\n" })
    const response = await query("TargetTwo")
    const witness = JSON.parse(fs.readFileSync(path.join(directory, "reference-ready-final-mutated.json"), "utf8"))
    assert.equal(witness.pid, session.transport.child.pid); assert.ok(witness.threadId > 0)
    assert.ok(witness.caller.some(line => line.includes("prepareOfficialReadiness")), JSON.stringify(witness))
    assert.equal(witness.originalSize, witness.currentSize)
    if (response.error) assert.equal(response.error.code, -32803, JSON.stringify(response))
    else assert.deepEqual(response.result, [...changed.matchAll(/\bTargetTwo\b/g)].map(match => ({
      uri: uri("ZZCaller.ets"), range: { start: positionAt(changed, match.index), end: positionAt(changed, match.index + 9) } })),
    "a pre-certification query result cannot outlive a failed final input proof")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

for (const [degraded, fileCount] of [[false, 320], [true, 320], [true, 8250]]) {
test(`references retain all Program disk inputs through the final publication fence (degraded=${degraded}, files=${fileCount})`,
  { timeout: fileCount > 8192 ? 60_000 : 30_000 }, async t => {
    const { session, sdk, workspace, directory, rootUri, uri, events } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      ARKTS_REFERENCES_STRATEGY: "legacy",
      NODE_OPTIONS: `--require=${path.resolve("tests/fixtures/reference-publication-final-window.cjs")}` })
    const target = "export class TargetOne {}\nexport class TargetTwo {}\n"
    const caller = 'import { TargetOne, TargetTwo } from "./Target"\nclass UnusedOne {}\n'
      + "export const one = new TargetOne()\nexport const two = new UnusedOne()\n"
    fs.writeFileSync(path.join(workspace, "Target.ets"), target)
    fs.writeFileSync(path.join(workspace, "ZZCaller.ets"), caller)
    if (degraded) fs.writeFileSync(path.join(workspace, "Broken.ets"), 'import unavailable from "@ohos.missing"\nexport { unavailable }\n')
    for (let index = 0; index < fileCount; index++) fs.writeFileSync(path.join(workspace,
      `Filler${String(index).padStart(4, "0")}.ets`), `export const filler${index} = ${index}\n`)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, degraded ? "degraded" : "ready", JSON.stringify(prepared.params))
    session.openDocument({ uri: uri("Target.ets"), version: 1, text: target })
    const query = symbol => session.request("textDocument/references", { textDocument: { uri: uri("Target.ets") },
      position: positionAt(target, target.indexOf(symbol) + 1), context: { includeDeclaration: false } })
    assert.equal((await query("TargetOne")).result.length, 2)
    if (fileCount > 8192) assert.ok(events().some(event => event.event === "semantic.references.complete"
      && event.programProjectFiles > 8192), "actual searched Program inputs exceed the phase-cache capacity")
    const changed = caller.replace("new UnusedOne()", "new TargetTwo()")
    fs.writeFileSync(path.join(directory, "arm-reference-publication.json"), JSON.stringify({ text: changed }))
    const response = await query("TargetTwo")
    const witness = JSON.parse(fs.readFileSync(path.join(directory, "reference-publication-mutated.json"), "utf8"))
    assert.equal(witness.pid, session.transport.child.pid); assert.ok(witness.threadId > 0)
    assert.ok(witness.caller.some(line => line.includes("assertCurrentWorkspaceSources")), JSON.stringify(witness))
    assert.equal(witness.originalSize, witness.currentSize)
    t.diagnostic(JSON.stringify({ response, witness }))
    assert.equal(response.error?.code, -32803, "a disk change during the final fence revokes the computed reference result")
    const contextCount = events().filter(event => event.event === "semantic.context.create").length
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("ZZCaller.ets"), type: 2 }] } })
    const recoveryStarted = performance.now()
    const recovered = await query("TargetTwo")
    if (fileCount > 8192) {
      assert.equal(events().filter(event => event.event === "semantic.context.create").length, contextCount,
        "a known changed source outside the full raw snapshot window must update the retained compiler host")
      t.diagnostic(JSON.stringify({ largeRecoveryMs: performance.now() - recoveryStarted,
        compilerStats: events().filter(event => event.event === "semantic.references.complete").at(-1) }))
    }
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [...changed.matchAll(/\bTargetTwo\b/g)].map(match => ({ uri: uri("ZZCaller.ets"), range: {
      start: positionAt(changed, match.index), end: positionAt(changed, match.index + 9) } })))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}
