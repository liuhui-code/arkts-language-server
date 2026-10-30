import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("opening and editing during a finite cold synchronization preserves initialization and its Worker",
  { timeout: 25_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/save-during-synchronization.cjs"))}`,
    })
    fs.writeFileSync(path.join(f.directory, "finite-save-sync.json"), JSON.stringify({ remaining: 1, holdMs: 1800 }))
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
    const uri = f.uri("Main.ets"), current = "// current unsaved version\n" + f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
    f.session.changeDocument({ uri, version: 2, text: current })
    const terminal = await f.session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === f.rootUri && message.params.phase !== "started", 12_000)
    t.diagnostic(JSON.stringify({ terminal: terminal.params,
      lifecycle: f.events().filter(e => /semantic\.(worker|initialization)/.test(e.event)) }))
    assert.equal(terminal.params.phase, "complete", "ordinary startup input must not make shared initialization fail")
    const response = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 2, character: 23 },
    }, { timeoutMs: 10_000 })
    assert.deepEqual(response.result, [{ uri: f.uri("Unopened.ets"),
      range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }], JSON.stringify(response))
    assert.ok(fs.existsSync(path.join(f.directory, "finite-save-returned.json")), "the finite compiler call must actually return")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.unresponsive"))
    const diagnostics = await f.session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostics.params.diagnostics, [])
  })

async function until(check) {
  const deadline = Date.now() + 8000
  while (!check()) {
    if (Date.now() > deadline) throw Error("cold compiler synchronization did not start")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test("cancelling a read during finite synchronization preserves its compiler for the following request",
  { timeout: 25_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "5000",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/save-during-synchronization.cjs"))}`,
    })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    const uri = f.uri("Main.ets")
    f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
    fs.writeFileSync(path.join(f.directory, "finite-save-sync.json"), JSON.stringify({ remaining: 1, holdMs: 1800 }))
    f.session.changeDocument({ uri, version: 2, text: f.sources["Main.ets"] + "\n// latest edit\n" })
    const id = f.session.nextRequestId++, params = { textDocument: { uri }, position: { line: 1, character: 23 } }
    f.session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/definition", params })
    await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
    f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await f.session.transport.response(id, 5000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    const fresh = await f.session.request("textDocument/definition", params, { timeoutMs: 10_000 })
    t.diagnostic(JSON.stringify({ fresh, lifecycle: f.events().filter(e => /semantic\.worker/.test(e.event)) }))
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.equal(fresh.result[0].uri, f.uri("Unopened.ets"))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.ok(!f.events().some(e => e.event === "semantic.worker.unresponsive"))
    assert.ok(fs.existsSync(path.join(f.directory, "finite-save-returned.json")))
    const responses = f.session.transport.transcriptEntries.filter(({ entry }) => entry.direction === "receive"
      && entry.id === id && entry.method === null)
    assert.equal(responses.length, 1, "a cancelled read still has exactly one public terminal")
  })

test("thirty thousand sources and repeated edits do not turn finite synchronization into a recovery storm",
  { timeout: 180_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/save-during-synchronization.cjs"))}`,
    })
    const noise = path.join(f.workspace, "noise")
    fs.mkdirSync(noise)
    for (let i = 0; i < 29_998; i++) fs.writeFileSync(path.join(noise, `Unused${i}.ts`), `export const unused${i} = ${i}\n`)
    // Filesystem setup/cleanup has its own envelope; semantic work keeps its original limit.
    await t.test("serves current inputs through finite synchronization within the original behavior budget",
      { timeout: 75_000 }, async child => {
      const arm = () => {
        for (const name of ["finite-save-entered.json", "finite-save-returned.json"]) fs.rmSync(path.join(f.directory, name), { force: true })
        fs.writeFileSync(path.join(f.directory, "finite-save-sync.json"), JSON.stringify({ remaining: 1, holdMs: 1400 }))
      }
      arm()
      await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
      await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
      const uri = f.uri("Main.ets"), original = f.sources["Main.ets"]
      let version = 1
      f.session.openDocument({ uri, version, text: original })
      const prepared = await f.session.transport.notification("arkts/semanticPreparation",
        m => m.params.phase === "complete", 20_000)
      assert.equal(prepared.params.report.semanticState, "degraded", "a partial catalog cannot certify complete readiness")
      assert.deepEqual(prepared.params.report.unavailableReasons, ["project-membership-incomplete"])
      await diagnostic(version, [])
      const params = { textDocument: { uri }, position: { line: 1, character: 23 } }
      const expected = [{ uri: f.uri("Unopened.ets"),
        range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }]
      for (let round = 0; round < 4; round++) {
        arm()
        f.session.changeDocument({ uri, version: ++version, text: original + `\n// starts round ${round}\n` })
        await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
        const current = round % 2 === 0 ? original.replace("result =", "result: string =") : original
        for (let key = 0; key < 8; key++) f.session.changeDocument({ uri, version: ++version,
          text: current + `\n// current round ${round}, key ${key}\n` })
        const response = await f.session.request("textDocument/definition", { ...params,
          position: { line: 1, character: current.split("\n")[1].indexOf("neverQueried") + 1 } }, { timeoutMs: 10_000 })
        assert.deepEqual(response.result, expected, JSON.stringify(response))
        await diagnostic(version, round % 2 === 0 ? [2322] : [])
        assert.ok(fs.existsSync(path.join(f.directory, "finite-save-returned.json")))
      }
      const references = await f.session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
      assert.equal(references.error?.code, -32803, "the liveness fix cannot return truncated global results")
      assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
      assert.ok(!f.events().some(e => /semantic\.worker\.(unresponsive|recovery)/.test(e.event)))
      assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
      child.diagnostic(JSON.stringify({ qualification: "PRIVATE_SDK_30000_SOURCES_NOT_REAL_PROJECT_UI",
        rounds: 4, finalVersion: version, workerStarts: 1, recoveries: 0 }))
      async function diagnostic(selectedVersion, codes) {
        const message = await f.session.transport.notification("textDocument/publishDiagnostics",
          m => m.params.uri === uri && m.params.version === selectedVersion, 12_000)
        assert.deepEqual(message.params.diagnostics.map(d => d.code), codes)
      }
    })
  })
