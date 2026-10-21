import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { canonicalCompletion, positionAt } from "../support/resident-interactive-lsp.mjs"

test("relative import discovery excludes a quote-free suffix without changing public completion or definition",
  { timeout: 30_000 }, async t => {
    const { session, workspace, directory, sdk, rootUri, uri } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${fileURLToPath(new URL("../fixtures/import-specifier-counter.cjs", import.meta.url))}` })
    const entry = 'import { Graph } from "./Graph"\nexport const value = new Graph().value\n'
    const leaf = "export class Leaf { value: number = 1 }\n"
    const graph = '// import-specifier-work-bound Graph.ts\nimport { Leaf } from "./Unopened"\n'
      + "export class Graph extends Leaf {}\n" + " ".repeat(16_384) + "\n"
    for (const [name, content] of Object.entries({ "Main.ets": entry, "Unopened.ets": leaf, "Graph.ts": graph })) {
      fs.writeFileSync(path.join(workspace, name), content)
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const progress = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
    await session.transport.progress(progress.params.token, message => message.params.value.kind === "end", 10_000)
    const offset = entry.lastIndexOf("value"), range = {
      start: positionAt(entry, offset), end: positionAt(entry, offset + "value".length) }
    const completion = await session.request("textDocument/completion", {
      textDocument: { uri: uri("Main.ets") }, position: range.end })
    assert.equal(completion.error, undefined, JSON.stringify(completion))
    assert.deepEqual({ ...completion.result, items: completion.result.items.map(canonicalCompletion) }, {
      isIncomplete: false, items: [{ label: "value", detail: "TypeScript property", kind: 5,
        insertText: "value", sortText: "11", textEdit: { range, newText: "value" } }] })
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") }, position: positionAt(entry, offset + 1) })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    const declaration = leaf.indexOf("value:")
    assert.deepEqual(definition.result, [{ uri: uri("Unopened.ets"), range: {
      start: positionAt(leaf, declaration), end: positionAt(leaf, declaration + "value".length) } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const rows = fs.readFileSync(path.join(directory, "import-specifier-inputs.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const quoteBound = Math.max(graph.lastIndexOf("'"), graph.lastIndexOf('"')) + 1
    t.diagnostic(JSON.stringify({ phase: "public completion and definition semantics passed", projectSources: 3,
      sourceCodeUnits: graph.length, quoteBound, completion, definition, observations: rows }))
    assert.ok(rows.length > 0, "observe the actual import regex in the semantic worker")
    assert.ok(rows.every(row => row.pid === session.transport.child.pid && row.threadId > 0))
    assert.ok(rows.every(row => row.codeUnits === quoteBound),
      "the import regex must receive only the prefix through the last quote, excluding the impossible suffix")
  })
