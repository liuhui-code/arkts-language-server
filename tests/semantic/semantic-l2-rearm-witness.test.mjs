import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("L2 is rearmed only after a compiler query rebuilds a Program", { timeout: 60_000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l2-witness-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  const logDirectory = path.join(directory, "logs")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ apiVersion: "24", version: "test" }))
  const source = "export class RegistryThing {}\nexport const value = new RegistryThing()\n"
  const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
  fs.writeFileSync(path.join(workspace, "Query.ets"), source)
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
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_MEMORY_BUDGET_MB: "1024",
      ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L01_REARM_TRIM: "1",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
  session.openDocument({ uri, version: 1, text: source })
  await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === 1, 20_000)

  const initialDefinition = await session.request("textDocument/definition", {
    textDocument: { uri }, position: { line: 1, character: 26 },
  }, { timeoutMs: 20_000 })
  assert.equal(initialDefinition.error, undefined, JSON.stringify(initialDefinition.error))
  assert.equal(initialDefinition.result.length, 1)

  const pressure = async () => {
    const response = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
    assert.deepEqual(response.result, { applied: "level2" }, JSON.stringify(response.error))
  }
  await pressure()
  await waitForTrimCount(logDirectory, 1)

  const reuseBeforeInvalid = readEvents(logDirectory).filter(entry => entry.event === "semantic.context.reuse").length
  const invalidRename = async () => {
    const response = await session.request("textDocument/rename", {
      textDocument: { uri }, position: { line: 0, character: 14 }, newName: "not valid",
    }, { timeoutMs: 20_000 })
    assert.deepEqual(response.error, { code: -32602, message: "Rename requires a valid identifier." })
  }
  await invalidRename()
  const reuseAfterInvalid = readEvents(logDirectory).filter(entry => entry.event === "semantic.context.reuse").length
  assert.ok(reuseAfterInvalid > reuseBeforeInvalid,
    "the invalid rename must reach the resident semantic context")
  await pressure()
  await invalidRename() // A second worker request fences the asynchronous pressure control.
  assert.equal(trimCount(logDirectory), 1,
    "an invalid rename must not rearm L2 when it did not rebuild a Program")

  const definition = await session.request("textDocument/definition", {
    textDocument: { uri }, position: { line: 1, character: 26 },
  }, { timeoutMs: 20_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  assert.equal(definition.result.length, 1)
  await pressure()
  await waitForTrimCount(logDirectory, 2)
  assert.equal(trimCount(logDirectory), 2,
    "an actual post-trim compiler rebuild must rearm L2 exactly once")
})

test("observed compiler rebuild costs stay attached to the leased context without inventing hot-query work",
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-rebuild-cost-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const workspace = path.join(directory, "workspace")
    const sdk = path.join(directory, "sdk")
    const logs = path.join(directory, "logs")
    fs.mkdirSync(workspace)
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))
    const source = "export class RegistryThing {}\nexport const value = new RegistryThing()\n"
    const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
    fs.writeFileSync(path.join(workspace, "Query.ets"), source)
    const session = new LspSession({
      command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
      cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_TRACE: "1",
        ARKTS_MEMORY_BUDGET_MB: "1024", ARKTS_BENCHMARK_CONTROL: "1",
        ARKTS_L01_REARM_TRIM: "1",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    session.openDocument({ uri, version: 1, text: source })
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 1, 20_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    const costs = () => readEvents(logs).filter(event => event.event === "semantic.context.cost")
    assert.equal(costs().length, 1, "normal diagnostics observed one compiler rebuild")
    const initial = costs()[0]
    assert.ok(Number.isFinite(initial.rebuildCostMs) && initial.rebuildCostMs > 0)
    assert.equal(initial.leaseCount, 1)
    assert.equal(initial.reason, "compiler-build")
    const define = async (declarationLine = 0) => {
      const response = await session.request("textDocument/definition", {
        textDocument: { uri }, position: { line: declarationLine + 1, character: 26 },
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [{ uri, range: {
        start: { line: declarationLine, character: 13 }, end: { line: declarationLine, character: 26 },
      } }])
    }
    await define()
    assert.equal(costs().length, 1, "a hot definition did not observe another compiler build")
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
    assert.deepEqual(pressure.result, { applied: "level2" }, JSON.stringify(pressure.error))
    await define()
    assert.equal(costs().length, 2, "a nested traced post-trim definition retains its build observation")
    const rebuilt = costs().at(-1)
    const timing = readEvents(logs).findLast(event => event.event === "semantic.definition.complete")
    assert.equal(rebuilt.contextSequence, initial.contextSequence)
    assert.equal(rebuilt.leaseCount, 1)
    assert.ok(Number.isFinite(rebuilt.rebuildCostMs) && rebuilt.rebuildCostMs > 0)
    assert.ok(timing.createProgramMs > 0)
    assert.ok(Math.abs(rebuilt.rebuildCostMs - timing.createProgramMs) < 0.000001,
      "the owner stores observed grouped compiler time, not total request latency or a file-count estimate")
    session.changeDocument({ uri, version: 2, text: `// 😀 latest\n${source}` })
    const latest = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 2, 20_000)
    assert.deepEqual(latest.params.diagnostics, [])
    assert.equal(costs().length, 3, "the latest overlay may observe a new compiler build")
    await define(1)
    assert.equal(costs().length, 3, "a hot query of the edited overlay must not invent a build")
    const level3 = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(level3.result, { applied: "level3" }, JSON.stringify(level3.error))
    await define(1)
    assert.equal(costs().length, 4)
    const fresh = costs().at(-1)
    assert.notEqual(fresh.contextSequence, initial.contextSequence)
    const creation = readEvents(logs).find(event => event.event === "semantic.context.create"
      && event.contextSequence === fresh.contextSequence)
    assert.ok(creation)
    assert.equal("rebuildCostMs" in creation, false, "a recreated context has no inherited cost proof")
    assert.ok(Number.isFinite(fresh.rebuildCostMs) && fresh.rebuildCostMs > 0)
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

for (const [name, benchmarkControl, costFlag, rearmFlag] of [
  ["normal pressure retains all owners with cost observation and preserves every latest overlay", "1", "1", "1"],
  ["normal pressure retains all owners without cost opt-in", "1", "0", "1"],
  ["default normal pressure retains all owners without benchmark control", "0", undefined, "1"],
  ["normal retention observes builds without enabling L2 rearm", "1", "1", "0"],
]) {
  const observesCost = (costFlag ?? "1") === "1"
  test(name,
    { timeout: 60_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cost-eviction-"))
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
      const sdk = path.join(directory, "sdk")
      const logs = path.join(directory, "logs")
      fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
      fs.mkdirSync(path.join(sdk, "toolchains"))
      fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
      fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
        JSON.stringify({ apiVersion: "24", version: "test" }))
      const disk = "export class RegistryThing {}\nexport const value = new RegistryThing()\n"
      const roots = ["a", "b", "c"].map(name => {
        const workspace = path.join(directory, name)
        fs.mkdirSync(workspace)
        const file = path.join(workspace, "Query.ets")
        fs.writeFileSync(file, disk)
        return { name, rootUri: pathToFileURL(workspace).href, uri: pathToFileURL(file).href,
          text: `/* 😀 */ ${disk}export const unsaved = new RegistryThing()\n` }
      })
      const session = new LspSession({
        command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
        cwd: projectRoot,
        env: {
          ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
          ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_TRACE: "1",
          ARKTS_MEMORY_BUDGET_MB: "1024", ARKTS_BENCHMARK_CONTROL: benchmarkControl,
          ARKTS_L01_REARM_TRIM: rearmFlag, ARKTS_L03_COST_AWARE_EVICTION: costFlag,
        },
      })
      t.after(() => session.close().catch(() => {}))
      const initialized = await session.request("initialize", {
        processId: process.pid, rootUri: roots[0].rootUri,
        workspaceFolders: roots.map(root => ({ name: root.name, uri: root.rootUri })),
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        initializationOptions: { sdk: { path: sdk } },
      }, { timeoutMs: 10_000 })
      assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
      session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
      session.initialized = true
      for (const root of roots) await session.transport.notification("arkts/semanticPreparation",
        message => message.params.rootUri === root.rootUri && message.params.phase === "complete", 20_000)
      const initialEvents = readEvents(logs).length
      const events = () => readEvents(logs).slice(initialEvents)
      const open = async root => {
        session.openDocument({ uri: root.uri, version: 1, text: root.text })
        const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === root.uri && message.params.version === 1, 20_000)
        assert.deepEqual(diagnostic.params.diagnostics, [])
      }
      const define = async root => {
        const response = await session.request("textDocument/definition", {
          textDocument: { uri: root.uri }, position: { line: 1, character: 26 },
        }, { timeoutMs: 20_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        assert.deepEqual(response.result, [registryLocation(root, 0)])
        root.sequence = events().filter(event => event.event === "semantic.context.reuse").at(-1)?.contextSequence
      }
      await open(roots[0])
      await open(roots[1])
      const costs = [...new Map(events().filter(event => event.event === "semantic.context.cost")
        .map(event => [event.contextSequence, event])).values()].slice(-2)
      const measured = observesCost || (benchmarkControl === "1" && rearmFlag === "1")
      assert.equal(costs.length, measured ? 2 : 0)
      assert.ok(costs.every(event => Number.isFinite(event.rebuildCostMs) && event.rebuildCostMs > 0))
      if (measured) assert.notEqual(costs[0].rebuildCostMs, costs[1].rebuildCostMs,
        "choose by the measurements actually obtained, not an assumed project-size ranking")
      const expensiveIndex = measured ? (costs[0].rebuildCostMs > costs[1].rebuildCostMs ? 0 : 1) : 0
      const cheapIndex = 1 - expensiveIndex
      await define(roots[expensiveIndex])
      await define(roots[cheapIndex]) // Make the expensive context older than the cheap one.
      const capacityFence = events().length
      await open(roots[2])
      const evicted = events().slice(capacityFence).find(event => event.event === "semantic.context.evict"
        && event.reason.startsWith("capacity-"))
      assert.equal(evicted, undefined, "normal pressure must not impose a two-owner capacity")
      const before = events().filter(event => event.event === "semantic.context.create").length
      await define(roots[cheapIndex])
      assert.equal(events().filter(event => event.event === "semantic.context.create").length, before,
        "the retained context is reused rather than rebuilt")
      const edited = roots[cheapIndex]
      edited.text += "export const latest = new RegistryThing()\n"
      session.changeDocument({ uri: edited.uri, version: 2, text: edited.text })
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === edited.uri && message.params.version === 2, 20_000)
      assert.deepEqual(latest.params.diagnostics, [])
      for (const root of roots) {
        const response = await session.request("textDocument/references", {
          textDocument: { uri: root.uri }, position: { line: 1, character: 26 },
          context: { includeDeclaration: true },
        }, { timeoutMs: 20_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        assert.deepEqual(response.result.toSorted((a, b) => a.range.start.line - b.range.start.line),
          (root === edited ? [0, 1, 2, 3] : [0, 1, 2]).map(line => registryLocation(root, line)))
      }
      assert.ok(events().filter(event => event.event === "semantic.context.create")
        .every(event => event.residentContextCount <= roots.length))
      if (observesCost && rearmFlag === "0") {
        await define(roots[2])
        const pressure = async () => {
          const response = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
          assert.deepEqual(response.result, { applied: "level2" }, JSON.stringify(response.error))
        }
        await pressure()
        await define(roots[2])
        const first = trimCount(logs)
        assert.ok(first > 0)
        await pressure()
        await define(roots[2])
        assert.equal(trimCount(logs), first, "cost observation alone must not change L2 rearm policy")
      }
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
    })
}

for (const [name, costFlag, rearmFlag] of [
  ["L3 pressure recovery uses LRU and stops once live RSS reaches the target", "1", "0"],
  ["L3 pressure recovery resamples live RSS without cost observation", "0", "1"],
]) {
test(name,
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-pressure-cost-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const sdk = path.join(directory, "sdk")
    const logs = path.join(directory, "logs")
    const metrics = path.join(directory, "metrics.jsonl")
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))
    const disk = "export class RegistryThing {}\nexport const value = new RegistryThing()\n"
    const roots = ["a", "b"].map(name => {
      const workspace = path.join(directory, name)
      fs.mkdirSync(workspace)
      const file = path.join(workspace, "Query.ets")
      fs.writeFileSync(file, disk)
      return { name, rootUri: pathToFileURL(workspace).href, uri: pathToFileURL(file).href,
        text: `/* 😀 */ ${disk}export const unsaved = new RegistryThing()\n` }
    })
    const session = new LspSession({
      command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
      cwd: projectRoot,
      env: {
        ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_TRACE: "1",
        ARKTS_MEMORY_BUDGET_MB: "1024", ARKTS_MEMORY_METRICS_FILE: metrics,
        ARKTS_BENCHMARK_CONTROL: "1", ARKTS_L03_COST_AWARE_EVICTION: costFlag,
        ARKTS_L01_REARM_TRIM: rearmFlag,
      },
    })
    t.after(() => session.close().catch(() => {}))
    const initialized = await session.request("initialize", {
      processId: process.pid, rootUri: roots[0].rootUri,
      workspaceFolders: roots.map(root => ({ name: root.name, uri: root.rootUri })),
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      initializationOptions: { sdk: { path: sdk } },
    }, { timeoutMs: 10_000 })
    assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
    session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
    session.initialized = true
    for (const root of roots) await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === root.rootUri && message.params.phase === "complete", 20_000)
    for (const root of roots) {
      session.openDocument({ uri: root.uri, version: 1, text: root.text })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === root.uri && message.params.version === 1, 20_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
    }
    const costs = [...new Map(readEvents(logs).filter(event => event.event === "semantic.context.cost")
      .map(event => [event.contextSequence, event])).values()].slice(-2)
    assert.equal(costs.length, 2)
    assert.ok(costs.every(event => Number.isFinite(event.rebuildCostMs) && event.rebuildCostMs > 0))
    assert.notEqual(costs[0].rebuildCostMs, costs[1].rebuildCostMs)
    const expensive = costs[0].rebuildCostMs > costs[1].rebuildCostMs ? 0 : 1
    const cheap = 1 - expensive
    const define = async root => {
      const response = await session.request("textDocument/definition", {
        textDocument: { uri: root.uri }, position: { line: 1, character: 26 },
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [registryLocation(root, 0)])
    }
    await define(roots[expensive])
    await define(roots[cheap]) // Expensive is older, so LRU would choose the other victim.
    const before = readEvents(logs).filter(event => event.event === "semantic.context.create").length
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await define(roots[expensive]) // Public query fences asynchronous pressure application.
    const evictions = readEvents(logs).filter(event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    assert.equal(evictions.length, 1,
      "runtime pressure stops when the fresh RSS sample reaches the target")
    assert.equal(evictions[0].contextSequence, costs[expensive].contextSequence)
    assert.equal(readEvents(logs).filter(event => event.event === "semantic.context.create").length,
      before + 1, "the older context must rebuild after LRU eviction")
    const samples = fs.readFileSync(metrics, "utf8").trim().split("\n").map(JSON.parse)
    assert.ok(samples.length > 0 && samples.every(sample => sample.rss < 1024 * 1024 * 1024 * 0.85),
      "this functional intervention uses genuinely low process RSS, not invented reclaimed bytes")
    const edited = roots[cheap]
    edited.text += "export const latest = new RegistryThing()\n"
    session.changeDocument({ uri: edited.uri, version: 2, text: edited.text })
    const latest = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === edited.uri && message.params.version === 2, 20_000)
    assert.deepEqual(latest.params.diagnostics, [])
    for (const root of roots) {
      const response = await session.request("textDocument/references", {
        textDocument: { uri: root.uri }, position: { line: 1, character: 26 },
        context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result.toSorted((a, b) => a.range.start.line - b.range.start.line),
        (root === edited ? [0, 1, 2, 3] : [0, 1, 2]).map(line => registryLocation(root, line)))
    }
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })
}

function registryLocation(root, line) {
  const character = root.text.split("\n")[line].indexOf("RegistryThing")
  return { uri: root.uri, range: {
    start: { line, character }, end: { line, character: character + 13 },
  } }
}

async function waitForTrimCount(logDirectory, expected) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (trimCount(logDirectory) >= expected) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail(`expected ${expected} L2 trims, saw ${trimCount(logDirectory)}`)
}

function trimCount(logDirectory) {
  return readEvents(logDirectory).filter(entry => entry.event === "semantic.context.trim"
    && entry.reason === "memory-level2").length
}

function readEvents(logDirectory) {
  const logFile = path.join(logDirectory, "server.log")
  if (!fs.existsSync(logFile)) return []
  return fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}
