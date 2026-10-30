import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

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
