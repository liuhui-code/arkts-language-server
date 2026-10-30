import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("a disk notification for the authoritative open overlay drains finite synchronization without retiring its Worker",
  { timeout: 25_000 }, async t => {
    const f = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_SEMANTIC_QUEUE_TRACE: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/save-during-synchronization.cjs"))}`,
    })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    const uri = f.uri("Main.ets"), original = f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 1, text: original })
    await diagnostics(1)
    fs.writeFileSync(path.join(f.directory, "finite-save-sync.json"), JSON.stringify({ remaining: 1, holdMs: 1800 }))
    const current = original + "\n// edited and then saved\n"
    f.session.changeDocument({ uri, version: 2, text: current })
    await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), current)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri, type: 2 }] } })
    await diagnostics(2)
    const result = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 },
    }, { timeoutMs: 10_000 })
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.deepEqual(result.result, [{ uri: f.uri("Unopened.ets"),
      range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
    assert.ok(fs.existsSync(path.join(f.directory, "finite-save-returned.json")), "the original finite compiler call must actually return")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1,
      "recovering a replacement Worker is not equivalent to retaining the healthy one")
    assert.ok(!f.events().some(e => e.event === "semantic.worker.unresponsive"))
    async function diagnostics(version) {
      const message = await f.session.transport.notification("textDocument/publishDiagnostics",
        m => m.params.uri === uri && m.params.version === version, 12_000)
      assert.deepEqual(message.params.diagnostics, [])
    }
  })

async function until(check) {
  const deadline = Date.now() + 5000
  while (!check()) {
    if (Date.now() > deadline) throw Error("diagnosis did not enter the finite actual Program call")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

for (const changedAgain of [false, true]) test(changedAgain
  ? "a later overlay edit revokes publication while the same synchronization retains its original execution deadline"
  : "an endless synchronization admitted by a save still reaches its original absolute deadline",
  { timeout: 20_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_SEMANTIC_REQUEST_TIMEOUT_MS: "2200",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/save-during-synchronization.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    const uri = f.uri("Main.ets"), original = f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 1, text: original })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 1, 10_000)
    fs.writeFileSync(path.join(f.directory, "finite-save-sync.json"), JSON.stringify({ remaining: 1, endless: true }))
    const current = original + "\n// saved overlay\n"
    f.session.changeDocument({ uri, version: 2, text: current })
    await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), current)
    const watch = () => f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri, type: 2 }] } })
    watch()
    if (changedAgain) {
      f.session.changeDocument({ uri, version: 3, text: original + "\n// genuine later edit\n" })
      watch() // Repeated invalidations cannot renew the original execution deadline.
    }
    await until(() => f.events().some(e => e.event === "semantic.worker.recovery.complete"))
    const stopped = f.events().find(e => e.event === "semantic.worker.unresponsive")
    assert.equal(stopped.reason, "execution-deadline")
    assert.equal(stopped.limitMs, 2200)
    assert.equal(stopped.cancellationPolicy, "finish-sync")
    const response = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 },
    })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.equal(response.result[0].uri, f.uri("Unopened.ets"))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
  })

test("external disk bytes never replace an open overlay, and closing applies the deferred disk authority",
  { timeout: 25_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/save-during-synchronization.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    const uri = f.uri("Main.ets"), original = f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 1, text: original })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 1, 10_000)
    fs.writeFileSync(path.join(f.directory, "finite-save-sync.json"), JSON.stringify({ remaining: 1, holdMs: 1800 }))
    f.session.changeDocument({ uri, version: 2, text: original + "\n// overlay remains authoritative\n" })
    await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
    const disk = 'import { neverQueried as diskOnly } from "./Unopened"\nexport const onDisk = diskOnly()\n'
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), disk)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri, type: 2 }] } })
    const diagnostics = await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 2, 12_000)
    assert.deepEqual(diagnostics.params.diagnostics, [])
    const query = (line, character) => f.session.request("textDocument/hover", { textDocument: { uri }, position: { line, character } })
    const overlay = await query(1, 14)
    assert.match(JSON.stringify(overlay.result?.contents), /result: number/)
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
    f.session.documentVersions.delete(uri)
    f.session.openDocument({ uri, version: 1, text: disk })
    const reopened = await query(1, 14)
    assert.equal(reopened.error, undefined, JSON.stringify(reopened))
    assert.match(JSON.stringify(reopened.result.contents), /onDisk: number/)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })

test("a completed save drain with a lost terminal retains the original bounded delivery grace",
  { timeout: 20_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/save-during-synchronization.cjs"))}` })
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    const uri = f.uri("Main.ets"), original = f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 1, text: original })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 1, 10_000)
    fs.writeFileSync(path.join(f.directory, "finite-save-sync.json"), JSON.stringify({ remaining: 1, holdMs: 1400, dropTerminal: true }))
    const current = original + "\n// save then lose only the cancelled terminal\n"
    f.session.changeDocument({ uri, version: 2, text: current })
    await until(() => fs.existsSync(path.join(f.directory, "finite-save-entered.json")))
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), current)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri, type: 2 }] } })
    await until(() => f.events().some(e => e.event === "semantic.worker.recovery.complete"))
    const stopped = f.events().find(e => e.event === "semantic.worker.unresponsive")
    assert.equal(stopped.reason, "cancellation-deadline")
    assert.equal(stopped.limitMs, 1000)
    assert.equal(stopped.cancellationPolicy, "settling")
    assert.equal(stopped.terminalState, "sent", "produced/sent is not a received terminal")
    assert.ok(fs.existsSync(path.join(f.directory, "finite-save-terminal-dropped.json")))
    const response = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 },
    })
    assert.equal(response.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(response))
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 2)
  })
