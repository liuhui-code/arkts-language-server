import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { diagnostic, location, navigation, waitForEvent } from "../support/semantic-recycle-lsp.mjs"

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

for (const costPolicy of [false, true]) {
test(costPolicy ? "cost-aware Worker recycle rejects a stale L3 witness after live RSS recovers"
  : "explicit post-L3 Worker recycle replays an unsaved overlay before answering navigation",
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
        ARKTS_L03_COST_AWARE_EVICTION: costPolicy ? "1" : "0",
        ARKTS_MEMORY_METRICS_FILE: path.join(directory, "metrics.jsonl"),
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
    const cacheHits = () => fs.readFileSync(path.join(logs, "server.log"), "utf8")
      .split("\n").filter(Boolean).map(JSON.parse).filter(event => event.event === "references.cache.hit").length
    const hitsBefore = cacheHits()

    const premature = await session.request("arkts/benchmark/recycleSemanticWorker", {})
    assert.equal(premature.result, undefined)
    assert.equal(premature.error?.code, -32600)
    assert.match(premature.error.message, /no-l3-eviction/)
    if (costPolicy) {
      assert.deepEqual(await navigation(session, uri), before)
      assert.equal(cacheHits(), hitsBefore + 1, "refused recycling must retain a verified identical result")
    }

    const pressure = await session.request("arkts/benchmark/applyMemoryPressure",
      { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(logs, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    const recycled = await session.request("arkts/benchmark/recycleSemanticWorker", {},
      { timeoutMs: 20_000 })
    if (costPolicy) {
      const samples = fs.readFileSync(path.join(directory, "metrics.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.ok(samples.every(sample => sample.rss < 1024 * 1024 * 1024 * 0.85))
      assert.equal(recycled.result, undefined, "do not replace the Worker on a recovered pressure witness")
      assert.equal(recycled.error?.code, -32600)
      assert.match(recycled.error.message, /pressure-recovered/)
    } else {
      assert.equal(recycled.error, undefined, JSON.stringify(recycled.error))
      assert.equal(recycled.result.recycled, true)
      assert.ok(recycled.result.oldThreadId > 0)
      assert.ok(recycled.result.newThreadId > 0)
      assert.notEqual(recycled.result.newThreadId, recycled.result.oldThreadId)
    }

    assert.deepEqual(await navigation(session, uri), before,
      "the same no-edit requests still read the unsaved v2 overlay")
    session.changeDocument({ uri, version: 3,
      text: `${overlay}export const broken = missingAfterRecycle\n` })
    const latest = await diagnostic(session, uri, 3)
    assert.ok(latest.params.diagnostics.some(diagnostic => diagnostic.code === 2304
      && diagnostic.message.includes("missingAfterRecycle")))
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
    const emptyManual = await session.request("arkts/benchmark/recycleSemanticWorker", {})
    assert.equal(emptyManual.result, undefined)
    assert.equal(emptyManual.error?.code, -32600)
    assert.match(emptyManual.error.message, /requires one quiescent root/)
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })
}

for (const [name, method, cancelWaitingRequest, supersedeWaitingRequest] of [
  ["a timed-out recycle witness preserves waiting navigation and flushes edits to the live Worker",
    "textDocument/definition", false],
  ["navigation waiting for recycle remains cancellable before the witness finishes",
    "textDocument/definition", true],
  ["references arriving during recycle preserve the complete latest overlay result",
    "textDocument/references", false],
  ["an edit supersedes waiting navigation without replaying the old overlay",
    "textDocument/definition", false, true],
]) {
  test(name,
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
      if (cancelWaitingRequest) {
        const id = session.nextRequestId
        const waiting = session.request("textDocument/definition", {
          textDocument: { uri }, position: { line: 1, character: 27 },
        }, { timeoutMs: 2_000 })
        session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
        const cancelled = await waiting
        assert.equal(cancelled.result, undefined)
        assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled.error))
      }
      session.changeDocument({ uri, version: 2, text: overlay })
      const position = { line: 2, character: location(uri, overlay, 2, "TimeoutThing")
        .range.start.character + 1 }
      const waitingNavigation = session.request(method, {
        textDocument: { uri }, position,
        ...(method === "textDocument/references" ? { context: { includeDeclaration: true } } : {}),
      }, { timeoutMs: 20_000 })
      const latestText = supersedeWaitingRequest ? `// 😀 latest overlay\n${overlay}` : overlay
      const latestVersion = supersedeWaitingRequest ? 3 : 2
      if (supersedeWaitingRequest) {
        session.changeDocument({ uri, version: latestVersion, text: latestText })
      }
      const rejected = await recycling
      assert.equal(rejected.result, undefined)
      assert.equal(rejected.error?.code, -32600)
      assert.match(rejected.error.message, /witness timed out/)

      const navigation = await waitingNavigation
      assert.equal(navigation.error, undefined, JSON.stringify(navigation.error))
      assert.deepEqual(navigation.result.toSorted((a, b) => a.range.start.line - b.range.start.line),
        (supersedeWaitingRequest ? [] : method === "textDocument/references" ? [0, 1, 2] : [0])
          .map(line => location(uri, overlay, line, "TimeoutThing")))
      const latestPosition = supersedeWaitingRequest ? { ...position, line: position.line + 1 } : position
      if (supersedeWaitingRequest) {
        const latestDefinition = await session.request("textDocument/definition", {
          textDocument: { uri }, position: latestPosition,
        }, { timeoutMs: 20_000 })
        assert.equal(latestDefinition.error, undefined, JSON.stringify(latestDefinition.error))
        assert.deepEqual(latestDefinition.result, [location(uri, latestText, 1, "TimeoutThing")])
      }
      const references = await session.request("textDocument/references", {
        textDocument: { uri }, position: latestPosition, context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.equal(references.error, undefined, JSON.stringify(references.error))
      assert.deepEqual(references.result.toSorted((a, b) => a.range.start.line - b.range.start.line),
        (supersedeWaitingRequest ? [1, 2, 3] : [0, 1, 2])
          .map(line => location(uri, latestText, line, "TimeoutThing")))
      const latest = await diagnostic(session, uri, latestVersion)
      assert.ok(latest.params.diagnostics.some(item => item.code === 2304
        && item.message.includes("missingAfterTimeout")))
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
    })
}

for (const [name, trace, benchmarkControl = "1", automaticFlag = "1", queuedNavigation = false, jointPolicy = false] of [
  ["automatic post-L3 Worker recycle preserves unsaved navigation and normal diagnostics", "1"],
  ["automatic pressure Worker recycle does not depend on compiler tracing", "0"],
  ["automatic pressure Worker recycle stays disabled without benchmark control", "1", "0"],
  ["automatic pressure Worker recycle stays disabled without its opt-in", "1", "1", "0"],
  ["automatic pressure recycle preserves navigation queued before the L3 event", "1", "1", "1", true],
  ["joint cost and pressure policy preserves automatic Worker recovery and latest overlays", "1", "1", "1", false, true],
]) {
  test(name,
    { timeout: 60_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-auto-recycle-"))
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
      const disk = "export class PressureThing {}\nexport const first = new PressureThing()\n"
      const overlay = `/* 😀 */ ${disk}export const second = new PressureThing()\n`
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
          ARKTS_REFERENCES_TRACE: trace,
          // This legacy resident-diagnosis control must create a context before natural eviction.
          ARKTS_MEMORY_BUDGET_MB: "64", ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0",
          ARKTS_BENCHMARK_CONTROL: benchmarkControl,
          ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0",
          ARKTS_L03_PRESSURE_WORKER_RECYCLE: automaticFlag,
          ARKTS_L03_COST_AWARE_EVICTION: jointPolicy ? "1" : "0",
        },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
      session.openDocument({ uri, version: 2, text: overlay })
      const alreadyQueued = queuedNavigation ? navigation(session, uri) : undefined
      void alreadyQueued?.catch(() => {})
      assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics, [])
      if (trace === "1") {
        await waitForEvent(logs, event => event.event === "semantic.context.evict"
          && event.reason === "memory-level3")
      }
      const automaticEnabled = benchmarkControl === "1" && automaticFlag === "1"
      if (automaticEnabled) {
        const recycled = await waitForEvent(logs,
          event => event.event === "semantic.worker.pressure-recycle.complete")
        assert.ok(recycled.oldThreadId > 0)
        assert.ok(recycled.newThreadId > 0)
        assert.notEqual(recycled.newThreadId, recycled.oldThreadId)
      }
      assert.deepEqual(await (alreadyQueued ?? navigation(session, uri)), {
        definition: [location(uri, overlay, 0, "PressureThing")],
        references: [0, 1, 2].map(line => location(uri, overlay, line, "PressureThing")),
      })
      const latestText = `${overlay}export const third = new PressureThing()\n`
        + "export const broken = missingAfterAutomaticRecycle\n"
      session.changeDocument({ uri, version: 3, text: latestText })
      const latest = await diagnostic(session, uri, 3)
      assert.ok(latest.params.diagnostics.some(item => item.code === 2304
        && item.message.includes("missingAfterAutomaticRecycle")))
      assert.deepEqual(await navigation(session, uri), {
        definition: [location(uri, latestText, 0, "PressureThing")],
        references: [0, 1, 2, 3].map(line => location(uri, latestText, line, "PressureThing")),
      })
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
      if (!automaticEnabled) {
        const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
          .trim().split("\n").map(JSON.parse)
        assert.equal(events.filter(event => event.event === "semantic.worker.started").length, 1)
        assert.equal(events.filter(event => event.event === "semantic.worker.pressure-recycle.complete")
          .length, 0)
      }
    })
}

for (const [closedRoots, benchmarkControl = "1", automaticFlag = "1", costPolicy = false] of [
  [false], [true], [true, "0"], [true, "1", "0"],
  [false, "1", "1", true], [true, "1", "1", true],
]) {
  const enabled = benchmarkControl === "1" && automaticFlag === "1"
  test((costPolicy ? "joint RSS policy: " : "") + (!enabled ? `closed-buffer pressure recycle stays disabled without ${benchmarkControl === "0" ? "benchmark control" : "its opt-in"}`
    : closedRoots ? "automatic post-L3 Worker recycle remains available after every registered root closes its documents"
    : "automatic post-L3 Worker recycle replays independent latest overlays for every registered root"),
    { timeout: 60_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-multi-root-recycle-"))
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
      const sdk = path.join(directory, "sdk")
      const logs = path.join(directory, "logs")
      fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
      fs.mkdirSync(path.join(sdk, "toolchains"))
      fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
        "interface FixtureAmbient {}\n")
      fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
        JSON.stringify({ apiVersion: "24", version: "test" }))
      const disk = "export class PressureThing {}\nexport const first = new PressureThing()\n"
      const roots = ["a", "b"].map((name, index) => {
        const workspace = path.join(directory, name)
        fs.mkdirSync(workspace)
        const queryPath = path.join(workspace, "Query.ets")
        fs.writeFileSync(queryPath, disk)
        return { name, rootUri: pathToFileURL(workspace).href,
          uri: pathToFileURL(queryPath).href,
          overlay: `/* 😀 */ ${disk}export const second = new PressureThing()\n`
            + (index === 1 ? "export const third = new PressureThing()\n" : ""),
          lines: index === 1 ? [0, 1, 2, 3] : [0, 1, 2] }
      })
      const session = new LspSession({
        command: process.execPath,
        args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
        cwd: projectRoot,
        env: {
          ARKLINE_HARMONY_SDK_PATH: sdk,
          DEVECO_SDK_HOME: sdk,
          ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
          ARKTS_LSP_LOG_DIR: logs,
          ARKTS_REFERENCES_STRATEGY: closedRoots ? "batched" : "legacy",
          ARKTS_REFERENCES_TRACE: "1",
          // Default transient diagnosis has its own no-resident pressure transcript.
          ARKTS_MEMORY_BUDGET_MB: "64", ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0",
          ARKTS_BENCHMARK_CONTROL: benchmarkControl,
          ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0",
          ARKTS_L03_PRESSURE_WORKER_RECYCLE: automaticFlag,
          ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: closedRoots ? "1500" : "0",
          ARKTS_L03_COST_AWARE_EVICTION: costPolicy ? "1" : "0",
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
      for (const root of roots) session.openDocument({ uri: root.uri, version: 2, text: root.overlay })
      for (const root of roots) {
        assert.deepEqual((await diagnostic(session, root.uri, 2)).params.diagnostics, [])
      }
      let recycleStart = 0
      if (closedRoots) {
        const pending = session.request("textDocument/references", {
          textDocument: { uri: roots[0].uri }, position: { line: 1, character: 28 },
          context: { includeDeclaration: true },
        }, { timeoutMs: 20_000 })
        await waitForEvent(logs, event => event.event === "references.batch.start")
        recycleStart = fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).length
        const definition = await session.request("textDocument/definition", {
          textDocument: { uri: roots[0].uri }, position: { line: 1, character: 28 },
        }, { timeoutMs: 20_000 })
        assert.equal(definition.error, undefined, JSON.stringify(definition.error))
        assert.deepEqual(definition.result, [location(roots[0].uri, roots[0].overlay, 0, "PressureThing")])
        await waitForEvent(logs, event => event.event === "semantic.context.evict"
          && event.reason === "memory-level3", recycleStart)
        const busyEvents = fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
        assert.equal(busyEvents.slice(recycleStart).some(event => event.event === "semantic.worker.pressure-recycle.complete"),
          false, "an in-flight references request still prevents replacement")
        for (const root of roots) session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
          params: { textDocument: { uri: root.uri } } })
        const cancelled = await pending
        assert.equal(cancelled.error?.code, -32801)
        assert.equal(cancelled.result, undefined, "closing the last buffers cannot publish partial references")
      }
      await waitForEvent(logs, event => event.event === "semantic.context.evict"
        && event.reason === "memory-level3")
      if (enabled) {
        const recycled = await waitForEvent(logs,
          event => event.event === "semantic.worker.pressure-recycle.complete"
            || event.event === "semantic.worker.pressure-recycle.skipped", recycleStart)
        assert.equal(recycled.event, "semantic.worker.pressure-recycle.complete", JSON.stringify(recycled))
        assert.ok(recycled.oldThreadId > 0)
        assert.ok(recycled.newThreadId > 0)
        assert.notEqual(recycled.newThreadId, recycled.oldThreadId)
      }
      if (closedRoots) {
        for (const root of roots) {
          root.overlay += "export const reopened = new PressureThing()\n"
          root.lines.push(root.lines.length)
          session.openDocument({ uri: root.uri, version: 2, text: root.overlay })
        }
        for (const root of roots) assert.deepEqual((await diagnostic(session, root.uri, 2)).params.diagnostics, [])
      }
      for (const root of roots) {
        assert.deepEqual(await navigation(session, root.uri), {
          definition: [location(root.uri, root.overlay, 0, "PressureThing")],
          references: root.lines.map(line => location(root.uri, root.overlay, line, "PressureThing")),
        })
      }
      const edited = roots[0]
      const latestText = `${edited.overlay}export const third = new PressureThing()\n`
        + "export const broken = missingAfterMultiRootRecycle\n"
      session.changeDocument({ uri: edited.uri, version: 3, text: latestText })
      const latest = await diagnostic(session, edited.uri, 3)
      assert.ok(latest.params.diagnostics.some(item => item.code === 2304
        && item.message.includes("missingAfterMultiRootRecycle")))
      assert.deepEqual(await navigation(session, edited.uri), {
        definition: [location(edited.uri, latestText, 0, "PressureThing")],
        references: [...edited.lines, edited.lines.length].map(line => location(edited.uri, latestText, line, "PressureThing")),
      })
      const unchanged = roots[1]
      assert.deepEqual(await navigation(session, unchanged.uri), {
        definition: [location(unchanged.uri, unchanged.overlay, 0, "PressureThing")],
        references: unchanged.lines.map(line => location(unchanged.uri, unchanged.overlay, line, "PressureThing")),
      })
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
      if (!enabled) {
        const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
        assert.equal(events.filter(event => event.event === "semantic.worker.started").length, 1)
        assert.equal(events.filter(event => event.event === "semantic.worker.pressure-recycle.complete").length, 0)
      }
    })
}
