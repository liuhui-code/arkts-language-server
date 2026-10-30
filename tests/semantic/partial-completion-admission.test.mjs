import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("partial projects retain the Program when an unchanged compiler dependency becomes resident",
  { timeout: 60_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_SEMANTIC_QUEUE_TRACE: "1", ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "10000",
    })
    const sources = {
      "Main.ets": "export const main = 1\n",
      "First.ts": 'import { value1 } from "./Dep1"\nexport const first = value1\n',
      "Second.ts": 'import { value2 } from "./Dep2"\nexport const second = value2\n',
      "Dep1.ts": "export const value1 = 1\n",
      "Dep2.ts": "export const value2 = 2\n",
    }
    for (const [name, text] of Object.entries(sources)) fs.writeFileSync(path.join(f.workspace, name), text)
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 20_001; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), "export {}\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      m => m.params.phase === "complete", 20_000)
    assert.ok(prepared.params.report.unavailableReasons.includes("project-membership-incomplete"))
    for (const name of ["Main.ets", "First.ts", "Second.ts"]) {
      f.session.openDocument({ uri: f.uri(name), version: 1, text: sources[name] })
    }
    const targets = [["Main.ets", "main", "Main.ets"], ["First.ts", "value1", "Dep1.ts"],
      ["Second.ts", "value2", "Dep2.ts"]]
    const observations = []
    for (const [name, token, expected] of targets) {
      const source = sources[name], offset = source.lastIndexOf(token) + 1
      const position = { line: source.slice(0, offset).split("\n").length - 1,
        character: offset - source.lastIndexOf("\n", offset - 1) - 1 }
      const result = await f.session.request("textDocument/definition", {
        textDocument: { uri: f.uri(name) }, position,
      })
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.equal(result.result[0]?.uri, f.uri(expected))
      observations.push(f.events().filter(e => e.event === "semantic.definition.complete").at(-1))
    }
    assert.ok(observations.every(Boolean), "each real query has a Program identity observation")
    assert.ok(observations[0].programProjectFiles >= 5, "both unopened dependencies already belong to the Program")
    assert.equal(observations[1].programSequence, observations[0].programSequence,
      "storage promotion must not reconstruct an unchanged Program")
    assert.equal(observations[2].programSequence, observations[0].programSequence)
    assert.equal(observations[2].programRootFiles, observations[0].programRootFiles,
      "a cache-residency change must not grow the semantic root list")
    f.session.openDocument({ uri: f.uri("Dep1.ts"), version: 1, text: sources["Dep1.ts"] })
    f.session.changeDocument({ uri: f.uri("Dep1.ts"), version: 2,
      text: 'export let value1: string = "updated"\n' })
    const consumer = { textDocument: { uri: f.uri("First.ts") }, position: { line: 1, character: 22 } }
    const edited = await f.session.request("textDocument/hover", consumer)
    assert.equal(edited.error, undefined, JSON.stringify(edited))
    assert.match(edited.result.contents.value, /value1: string/u,
      "preserving cache promotion cannot hide a real unsaved dependency edit")
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: f.uri("Dep1.ts") } } })
    f.session.documentVersions.delete(f.uri("Dep1.ts"))
    const closed = await f.session.request("textDocument/hover", consumer)
    assert.equal(closed.error, undefined, JSON.stringify(closed))
    assert.match(closed.result.contents.value, /value1: (?:1|number)/u)
    fs.writeFileSync(path.join(f.workspace, "Dep2.ts"), "export let value2: boolean = true\n")
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("Dep2.ts"), type: 2 }] } })
    const disk = await f.session.request("textDocument/hover", {
      textDocument: { uri: f.uri("Second.ts") }, position: { line: 1, character: 23 },
    })
    assert.equal(disk.error, undefined, JSON.stringify(disk))
    assert.match(disk.result.contents.value, /value2: boolean/u,
      "a new disk identity must invalidate the old compiler-input promotion witness")
  })

test("an edited comment completion does not demand complete project membership",
  { timeout: 60_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-initialization-observation.cjs"))}`,
    })
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 20_001; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), "export {}\n")
    fs.writeFileSync(path.join(f.workspace, "ZNeedle.ts"), "export class ExactNeedle { value: number = 1 }\n")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    const prepared = await f.session.transport.notification("arkts/semanticPreparation",
      m => m.params.phase === "complete", 20_000)
    assert.ok(prepared.params.report.unavailableReasons.includes("project-membership-incomplete"))
    const uri = f.uri("Main.ets"), original = f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 1, text: original })
    const definition = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 } })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.equal(definition.result[0].uri, f.uri("Unopened.ets"))
    const observations = () => fs.readFileSync(path.join(f.directory, "partial-initialization.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const scans = () => observations().filter(row => row.kind === "noise-directory-open").length
    const initialScans = scans()
    assert.ok(initialScans > 0)
    const comment = "// ui30k editable while indexing"
    for (let i = 1; i <= comment.length; i++) f.session.changeDocument({
      uri, version: i + 1, text: original + "\n" + comment.slice(0, i),
    })
    const response = await f.session.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 3, character: comment.length },
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result.items, [])
    f.session.changeDocument({ uri, version: comment.length + 2, text: original + "\nres" })
    const local = await f.session.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 3, character: 3 },
    }, { timeoutMs: 20_000 })
    assert.equal(local.error, undefined, JSON.stringify(local))
    const item = local.result.items.find(candidate => candidate.label === "result")
    assert.ok(item, JSON.stringify(local))
    assert.equal(local.result.isIncomplete, true, "the unproven full-project scope is explicit")
    const details = await f.session.request("completionItem/resolve", item)
    assert.equal(details.error, undefined, JSON.stringify(details))
    assert.match(details.result.detail, /result: number/)
    await f.session.transport.progress(progress.params.token, m => m.params.value.kind === "end", 30_000)
    const indexed = await f.session.request("workspace/symbol", { query: "ExactNeedle" })
    assert.ok(indexed.result.some(symbol => symbol.name === "ExactNeedle"))
    f.session.changeDocument({ uri, version: comment.length + 3, text: original + "\nconst pick = ExactNee" })
    const imported = await f.session.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 3, character: 21 },
    }, { timeoutMs: 20_000 })
    assert.equal(imported.error, undefined, JSON.stringify(imported))
    const exported = imported.result.items.find(candidate => candidate.label === "ExactNeedle")
    assert.ok(exported, JSON.stringify(imported))
    const resolvedImport = await f.session.request("completionItem/resolve", exported)
    assert.equal(resolvedImport.error, undefined, JSON.stringify(resolvedImport))
    assert.match(resolvedImport.result.additionalTextEdits?.[0]?.newText ?? "", /ZNeedle/)
    assert.equal(scans(), initialScans, "partial membership cannot trigger a whole-project rescan on completion or details")
    const parsed = observations().filter(row => row.kind === "parse").map(row => row.value)
    const candidatePath = path.join(f.workspace, "ZNeedle.ts"), physical = fs.realpathSync.native(candidatePath)
    t.diagnostic(JSON.stringify({ candidatePath, observed: parsed.filter(file => /ZNeedle\.ts$/.test(file)) }))
    assert.ok(parsed.some(file => {
      try { return fs.realpathSync.native(file) === physical } catch { return false }
    }), "the compiler must parse the exact physical candidate, regardless of host path separators")
    assert.ok(parsed.every(file => !/[\\/]noise[\\/]/.test(file)), "irrelevant files stay outside the Program")
    const references = await f.session.request("textDocument/references", {
      textDocument: { uri }, position: { line: 1, character: 25 }, context: { includeDeclaration: true },
    })
    assert.equal(references.error?.code, -32803, "completion fallback does not grant full reference coverage")
  })
