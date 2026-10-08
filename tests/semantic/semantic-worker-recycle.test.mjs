import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

for (const [name, benchmarkControl, recycleFlag] of [
  ["benchmark control", "0", "1"],
  ["recycle opt-in", "1", "0"],
]) {
  test(`semantic Worker recycle stays unavailable without ${name}`,
    { timeout: 20_000 }, async t => {
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-recycle-gate-"))
      t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
      const session = new LspSession({
        command: process.execPath,
        args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
        cwd: projectRoot,
        rootUri: pathToFileURL(workspace).href,
        env: {
          ARKTS_INDEX_CACHE_DIR: path.join(workspace, "cache"),
          ARKTS_BENCHMARK_CONTROL: benchmarkControl,
          ARKTS_L01_SEMANTIC_WORKER_RECYCLE: recycleFlag,
        },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000 })
      const response = await session.request("arkts/benchmark/recycleSemanticWorker", {})
      assert.equal(response.result, undefined)
      assert.equal(response.error?.code, -32601)
      await session.close({ timeoutMs: 5_000 })
    })
}

test("explicit post-L3 Worker recycle replays an unsaved overlay before answering navigation",
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-recycle-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const workspace = path.join(directory, "workspace")
    const sdk = path.join(directory, "sdk")
    const logs = path.join(directory, "logs")
    fs.mkdirSync(workspace)
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
      "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))

    const disk = "export class RecycledThing {}\nexport const first = new RecycledThing()\n"
    const overlay = `${disk}export const second = new RecycledThing()\n`
    const queryPath = path.join(workspace, "Query.ets")
    const uri = pathToFileURL(queryPath).href
    fs.writeFileSync(queryPath, disk)
    const session = new LspSession({
      command: process.execPath,
      args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
      cwd: projectRoot,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: sdk,
        DEVECO_SDK_HOME: sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
        ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_STRATEGY: "legacy",
        ARKTS_REFERENCES_TRACE: "1",
        ARKTS_MEMORY_BUDGET_MB: "1024",
        ARKTS_BENCHMARK_CONTROL: "1",
        ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    session.openDocument({ uri, version: 1, text: disk })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    session.changeDocument({ uri, version: 2, text: overlay })
    assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics, [])

    const before = await navigation(session, uri)
    assert.deepEqual(before.definition, [location(uri, overlay, 0, "RecycledThing")])
    assert.deepEqual(before.references, [0, 1, 2].map(line =>
      location(uri, overlay, line, "RecycledThing")))

    const premature = await session.request("arkts/benchmark/recycleSemanticWorker", {})
    assert.equal(premature.result, undefined)
    assert.equal(premature.error?.code, -32600)
    assert.match(premature.error.message, /no-l3-eviction/)

    const pressure = await session.request("arkts/benchmark/applyMemoryPressure",
      { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(logs, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    const recycled = await session.request("arkts/benchmark/recycleSemanticWorker", {},
      { timeoutMs: 20_000 })
    assert.equal(recycled.error, undefined, JSON.stringify(recycled.error))
    assert.equal(recycled.result.recycled, true)
    assert.ok(recycled.result.oldThreadId > 0)
    assert.ok(recycled.result.newThreadId > 0)
    assert.notEqual(recycled.result.newThreadId, recycled.result.oldThreadId)

    assert.deepEqual(await navigation(session, uri), before,
      "the same no-edit requests still read the unsaved v2 overlay")
    session.changeDocument({ uri, version: 3,
      text: `${overlay}export const broken = missingAfterRecycle\n` })
    const latest = await diagnostic(session, uri, 3)
    assert.ok(latest.params.diagnostics.some(diagnostic => diagnostic.code === 2304
      && diagnostic.message.includes("missingAfterRecycle")))
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

test("a timed-out recycle witness flushes edits back to the live Worker",
  { timeout: 40_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-recycle-timeout-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const workspace = path.join(directory, "workspace")
    const sdk = path.join(directory, "sdk")
    const logs = path.join(directory, "logs")
    fs.mkdirSync(workspace)
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
      "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))
    const disk = "export class TimeoutThing {}\nexport const first = new TimeoutThing()\n"
    const overlay = `${disk}export const second = new TimeoutThing()\n`
      + "export const broken = missingAfterTimeout\n"
    const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
    fs.writeFileSync(path.join(workspace, "Query.ets"), disk)
    const session = new LspSession({
      command: process.execPath,
      args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
      cwd: projectRoot,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: sdk,
        DEVECO_SDK_HOME: sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
        ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_STRATEGY: "legacy",
        ARKTS_REFERENCES_TRACE: "1",
        ARKTS_MEMORY_BUDGET_MB: "1024",
        ARKTS_BENCHMARK_CONTROL: "1",
        ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1",
        ARKTS_TEST_WORKER_RECYCLE_WITNESS_TIMEOUT: "1",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    session.openDocument({ uri, version: 1, text: disk })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    const baseline = await session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 27 },
    })
    assert.deepEqual(baseline.result, [location(uri, disk, 0, "TimeoutThing")])
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure",
      { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(logs, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")

    const recycling = session.request("arkts/benchmark/recycleSemanticWorker", {},
      { timeoutMs: 12_000 })
    await waitForEvent(logs, event => event.event === "semantic.worker.recycle.witness.waiting")
    session.changeDocument({ uri, version: 2, text: overlay })
    const rejected = await recycling
    assert.equal(rejected.result, undefined)
    assert.equal(rejected.error?.code, -32600)
    assert.match(rejected.error.message, /witness timed out/)

    const position = { line: 2, character: location(uri, overlay, 2, "TimeoutThing")
      .range.start.character + 1 }
    const definition = await session.request("textDocument/definition",
      { textDocument: { uri }, position }, { timeoutMs: 20_000 })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [location(uri, overlay, 0, "TimeoutThing")])
    const references = await session.request("textDocument/references", {
      textDocument: { uri }, position, context: { includeDeclaration: true },
    }, { timeoutMs: 20_000 })
    assert.equal(references.error, undefined, JSON.stringify(references.error))
    assert.deepEqual(references.result.toSorted((a, b) => a.range.start.line - b.range.start.line),
      [0, 1, 2].map(line => location(uri, overlay, line, "TimeoutThing")))
    const latest = await diagnostic(session, uri, 2)
    assert.ok(latest.params.diagnostics.some(item => item.code === 2304
      && item.message.includes("missingAfterTimeout")))
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
  })

async function navigation(session, uri) {
  const position = { line: 1, character: 28 }
  const definition = await session.request("textDocument/definition",
    { textDocument: { uri }, position }, { timeoutMs: 20_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  const references = await session.request("textDocument/references", {
    textDocument: { uri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  assert.equal(references.error, undefined, JSON.stringify(references.error))
  return {
    definition: definition.result,
    references: references.result.toSorted((a, b) => a.range.start.line - b.range.start.line),
  }
}

function location(uri, source, line, symbol) {
  const character = source.split("\n")[line].indexOf(symbol)
  assert.ok(character >= 0)
  return { uri, range: {
    start: { line, character }, end: { line, character: character + symbol.length },
  } }
}

function diagnostic(session, uri, version) {
  return session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 20_000)
}

async function waitForEvent(logs, predicate) {
  const file = path.join(logs, "server.log")
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const entries = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
      if (entries.some(predicate)) return
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail("timed out waiting for real L3 context eviction")
}
