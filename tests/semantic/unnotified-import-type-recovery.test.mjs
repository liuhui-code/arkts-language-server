import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const scenario of [
  { name: "unchanged reopen", reopen: true, directory: true },
  { name: "new directory without reopen", reopen: false, directory: false },
  { name: "new namespace during a body edit", reopen: false, directory: true, edit: true },
  { name: "partial catalog", reopen: false, directory: true, partial: true },
  { name: "partial catalog and new directory after reopen", reopen: true, directory: false, partial: true },
]) test(`a subsequent explicit query recovers an unnotified import-type dependency creation (${scenario.name})`,
  { timeout: scenario.partial ? 60_000 : 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined, ARKTS_SEMANTIC_QUEUE_TRACE: "1" })
    const text = 'type Alias = import("./nested/Lazy").Lazy\nexport let selected: Alias\nexport const result = selected.value\n'
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), text)
    if (scenario.directory) fs.mkdirSync(path.join(f.workspace, "nested"))
    if (scenario.partial) {
      fs.mkdirSync(path.join(f.workspace, "noise"))
      for (let i = 0; i < 20_001; i++) fs.writeFileSync(path.join(f.workspace, "noise", `Unused${i}.ts`), "export {}\n")
    }
    const responses = []
    try {
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
      f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
      await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
      const uri = f.uri("Main.ets")
      const hover = async () => {
        const start = performance.now()
        const response = await f.session.request("textDocument/hover", { textDocument: { uri },
          position: { line: 2, character: 32 } }, { timeoutMs: 10_000 })
        responses.push({ durationMs: performance.now() - start, response })
        return response
      }
      f.session.openDocument({ uri, version: 7, text })
      const before = await hover()
      assert.equal(before.error, undefined, JSON.stringify(before))
      assert.match(JSON.stringify(before.result), /any/)
      if (scenario.reopen) f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
      fs.mkdirSync(path.join(f.workspace, "nested"), { recursive: true })
      fs.writeFileSync(path.join(f.workspace, "nested/Lazy.ets"), "export class Lazy { value = 1 }\n")
      if (scenario.reopen) f.session.openDocument({ uri, version: 1, text })
      if (scenario.edit) f.session.changeDocument({ uri, version: 8, text: text + "\n// body edit\n" })
      const first = await hover()
      if (scenario.name === "unchanged reopen") assert.equal(first.error?.code, -32803,
        "the unnotified change still rejects the prepared request")
      else if (first.error) assert.equal(first.error.code, -32803, JSON.stringify(first))
      else assertCurrent(first)
      assertCurrent(await hover())
      const owners = f.events().filter(e => e.event === "semantic.context.create").length
      for (let repeat = 0; repeat < 3; repeat++) assertCurrent(await hover())
      assert.equal(f.events().filter(e => e.event === "semantic.context.create").length, owners,
        "healthy repeated queries retain their consumer instead of rebuilding on every request")
      const definition = await f.session.request("textDocument/definition", { textDocument: { uri },
        position: { line: 2, character: 32 } })
      assert.equal(definition.error, undefined, JSON.stringify(definition))
      assert.deepEqual(definition.result, [{ uri: f.uri("nested/Lazy.ets"), range: {
        start: { line: 0, character: 20 }, end: { line: 0, character: 25 } } }])
      if (scenario.name === "unchanged reopen") for (let cycle = 0; cycle < 2; cycle++) {
        fs.unlinkSync(path.join(f.workspace, "nested/Lazy.ets"))
        fs.rmdirSync(path.join(f.workspace, "nested"))
        const removed = await hover()
        if (removed.error) assert.equal(removed.error.code, -32803, JSON.stringify(removed))
        else assert.deepEqual(removed.result, before.result, "a removed dependency cannot keep the old property")
        const missing = await hover()
        assert.equal(missing.error, undefined, JSON.stringify(missing))
        assert.deepEqual(missing.result, before.result)
        fs.mkdirSync(path.join(f.workspace, "nested"))
        fs.writeFileSync(path.join(f.workspace, "nested/Lazy.ets"), "export class Lazy { value = 1 }\n")
        const restored = await hover()
        if (restored.error) assert.equal(restored.error.code, -32803, JSON.stringify(restored))
        else assertCurrent(restored)
        assertCurrent(await hover())
      }
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    } finally {
      t.diagnostic(JSON.stringify({ responses }))
      if (process.env.NAV_INPUT_EVIDENCE_DIR) {
        const output = path.resolve(process.env.NAV_INPUT_EVIDENCE_DIR, scenario.name.replaceAll(" ", "-"))
        fs.mkdirSync(output, { recursive: true })
        fs.writeFileSync(path.join(output, "responses.json"), JSON.stringify(responses, null, 2))
        fs.cpSync(path.join(f.directory, "logs"), path.join(output, "logs"), { recursive: true })
      }
    }
  })

function assertCurrent(response) {
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(response.result, { contents: { kind: "markdown", value: "```arkts\n(property) Lazy.value: number\n```" },
    range: { start: { line: 2, character: 31 }, end: { line: 2, character: 36 } } })
}

for (const changedInput of ["SDK metadata", "SDK declaration"]) test(
  `source namespace recovery cannot renew a concurrent unnotified ${changedInput}`,
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined })
    const text = 'type Alias = import("./nested/Lazy").Lazy\nexport let selected: Alias\nexport const result = selected.value\n'
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), text)
    fs.mkdirSync(path.join(f.workspace, "nested"))
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    const uri = f.uri("Main.ets")
    f.session.openDocument({ uri, version: 7, text })
    const hover = () => f.session.request("textDocument/hover", { textDocument: { uri },
      position: { line: 2, character: 32 } })
    assert.equal((await hover()).error, undefined)
    fs.writeFileSync(path.join(f.workspace, "nested/Lazy.ets"), "export class Lazy { value = 1 }\n")
    const file = path.join(f.sdk, "ets", changedInput === "SDK metadata" ? "oh-uni-package.json" : "component/common.d.ts")
    fs.writeFileSync(file, fs.readFileSync(file, "utf8") + "\n ")
    for (let repeat = 0; repeat < 3; repeat++) {
      const response = await hover()
      assert.equal(response.error?.code, -32803, JSON.stringify(response))
      assert.equal(response.result, undefined)
    }
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: f.sdk } } } } })
    assertCurrent(await hover())
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })
