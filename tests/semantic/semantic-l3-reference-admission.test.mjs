import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { completeLogEvents } from "../support/complete-log-events.mjs"

test("experimental L3 admission verifies uncached references without rebuilding a resident context",
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l3-admission-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const workspace = path.join(directory, "workspace")
    const sdk = path.join(directory, "sdk")
    const logDirectory = path.join(directory, "logs")
    const metricsFile = path.join(directory, "memory.jsonl")
    fs.mkdirSync(workspace)
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
      "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))
    const source = [
      "export class AlphaThing {}",
      "export class BetaThing {}",
      "export const alpha = new AlphaThing()",
      "export const beta = new BetaThing()",
      "",
    ].join("\n")
    const sourcePath = path.join(workspace, "Query.ets")
    const uri = pathToFileURL(sourcePath).href
    fs.writeFileSync(sourcePath, source)
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
        ARKTS_MEMORY_METRICS_FILE: metricsFile,
        ARKTS_REFERENCES_STRATEGY: "legacy",
        ARKTS_REFERENCES_TRACE: "1",
        ARKTS_MEMORY_BUDGET_MB: "1",
        ARKTS_BENCHMARK_CONTROL: "1",
        ARKTS_L01_PRESSURE_ADMISSION: "1",
        ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    session.openDocument({ uri, version: 1, text: source })
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 1, 20_000)
    assert.deepEqual(diagnostic.params.diagnostics, [], "automatic diagnostics remain enabled")
    await waitForEvent(logDirectory, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    const createdBeforeReferences = events(logDirectory)
      .filter(event => event.event === "semantic.context.create").length

    for (const [index, symbol, declarationLine, usageLine] of [
      [1, "AlphaThing", 0, 2], [2, "BetaThing", 1, 3],
    ]) {
      const response = await session.request("textDocument/references", {
        textDocument: { uri },
        position: { line: declarationLine, character: source.split("\n")[declarationLine].indexOf(symbol) + 1 },
        context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const expected = [declarationLine, usageLine].map(line => {
        const character = source.split("\n")[line].indexOf(symbol)
        return { uri, range: { start: { line, character },
          end: { line, character: character + symbol.length } } }
      })
      assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
      await waitForEvent(logDirectory, event => event.event === "references.cache.miss", index)
    }
    const overlay = `${source}export const later = new AlphaThing()\n`
    const evictionsBeforeEdit = events(logDirectory)
      .filter(event => event.event === "semantic.context.evict" && event.reason === "memory-level3").length
    session.changeDocument({ uri, version: 2, text: overlay })
    const changedDiagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 2, 20_000)
    assert.deepEqual(changedDiagnostic.params.diagnostics, [])
    const diagnosis = events(logDirectory).findLast(event => event.event === "diagnostics.program.complete")
    assert.equal(diagnosis?.documentVersion, 2, "diagnostic trace identifies the published overlay")
    assert.match(diagnosis?.memoryLevel ?? "", /^level[0-3]$/,
      "diagnostic trace records the effective admission pressure")
    await waitForEvent(logDirectory, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3", evictionsBeforeEdit + 1)
    const createdAfterEditDiagnosis = events(logDirectory)
      .filter(event => event.event === "semantic.context.create").length
    for (const includeDeclaration of [false, true]) {
      const response = await session.request("textDocument/references", {
        textDocument: { uri }, position: { line: 0, character: 14 + Number(includeDeclaration) },
        context: { includeDeclaration },
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const expected = (includeDeclaration ? [0, 2, 4] : [2, 4]).map(line => {
        const character = overlay.split("\n")[line].indexOf("AlphaThing")
        return { uri, range: { start: { line, character },
          end: { line, character: character + "AlphaThing".length } } }
      })
      assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort(),
        "the unsaved overlay and includeDeclaration policy remain authoritative")
    }
    assert.equal(events(logDirectory).filter(event => event.event === "semantic.context.create").length,
      createdAfterEditDiagnosis, "references must not readmit a resident context after overlay diagnostics")
    await session.close({ timeoutMs: 5_000 })

    const logged = events(logDirectory)
    assert.equal(logged.filter(event => event.event === "references.cache.miss").length, 4,
      "both symbols and both post-edit policies must be cold cache misses")
    assert.equal(logged.filter(event => event.event === "semantic.context.create").length,
      createdBeforeReferences + 1, "only automatic overlay diagnostics may readmit a resident context")
    assert.equal(logged.filter(event => event.event === "references.pressure.fallback").length, 4)
    const metrics = fs.readFileSync(metricsFile, "utf8").trim().split("\n").map(JSON.parse)
    assert.ok(metrics.some(sample => sample.rss >= 1_000_000), "automatic RSS sampling applied L3")
  })

for (const [strategy, benchmarkControl, pressureAdmission, batchRootLimit = "1"] of [
  ["legacy", "1", "1"], ["batched", "1", "1"], ["indexed-batched", "1", "1"],
  ["indexed-batched", "0", undefined], ["indexed-batched", "1", "0"],
  ["indexed-batched", "1", "1", "64"],
]) {
  const enabled = (pressureAdmission ?? "1") === "1"
  const rejected = enabled && batchRootLimit === "1"
  test(benchmarkControl === "0" ? "default L3 admission rejects incomplete indexed references without benchmark control"
    : rejected ? `experimental L3 admission rejects multi-batch references before verifier work (${strategy})`
    : enabled ? "experimental L3 admission permits a complete single-batch indexed query"
    : `indexed L3 admission stays disabled without ${benchmarkControl === "0" ? "benchmark control" : "opt-in"}`,
    { timeout: 60_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l3-multibatch-"))
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
      const workspace = path.join(directory, "workspace")
      const sdk = path.join(directory, "sdk")
      const logDirectory = path.join(directory, "logs")
      fs.mkdirSync(workspace)
      fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
      fs.mkdirSync(path.join(sdk, "toolchains"))
      fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
        "interface FixtureAmbient {}\n")
      fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
        JSON.stringify({ apiVersion: "24", version: "test" }))
      const source = "export class AlphaThing {}\nexport const alpha = new AlphaThing()\n"
      const sourcePath = path.join(workspace, "Query.ets")
      const uri = pathToFileURL(sourcePath).href
      fs.writeFileSync(sourcePath, source)
      fs.writeFileSync(path.join(workspace, "OtherA.ets"), strategy === "legacy" ? "export const a = 1\n"
        : 'import { AlphaThing } from "./Query"\nexport const a = new AlphaThing()\n')
      fs.writeFileSync(path.join(workspace, "OtherB.ets"), strategy === "legacy" ? "export const b = 2\n"
        : 'import { AlphaThing } from "./Query"\nexport const b = new AlphaThing()\n')
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
          ARKTS_REFERENCES_STRATEGY: strategy,
          ARKTS_REFERENCES_TRACE: "1",
          ARKTS_REFERENCES_BATCH_ROOTS: batchRootLimit,
          ARKTS_MEMORY_BUDGET_MB: "1",
          ARKTS_BENCHMARK_CONTROL: benchmarkControl,
          ARKTS_L01_PRESSURE_ADMISSION: pressureAdmission,
        },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
      session.openDocument({ uri, version: 1, text: source })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 1, 20_000)
      assert.deepEqual(diagnostic.params.diagnostics, [], "automatic diagnostics remain enabled")
      await waitForEvent(logDirectory, event => (event.event === "semantic.context.evict"
        && event.reason === "memory-level3") || event.event === "diagnostics.transient.complete")

      const createdBeforeReferences = events(logDirectory)
        .filter(event => event.event === "semantic.context.create").length
      const response = await session.request("textDocument/references", {
        textDocument: { uri }, position: { line: 0, character: 14 },
        context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.ok(events(logDirectory).some(event => event.event === "references.plan.complete"
        && (batchRootLimit === "1" ? event.batchCount > 1 : event.batchCount === 1)),
      "the compiler plan matches the configured functional pressure intervention")
      if (rejected) {
        assert.equal(response.result, undefined, "a rejected plan must not return Locations")
        assert.equal(response.error?.code, -32803)
        assert.match(response.error.message, /semantic memory budget/)
      } else {
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const expected = [
          [uri, 0, 13], [uri, 1, 25],
          [pathToFileURL(path.join(workspace, "OtherA.ets")).href, 0, 9],
          [pathToFileURL(path.join(workspace, "OtherA.ets")).href, 1, 21],
          [pathToFileURL(path.join(workspace, "OtherB.ets")).href, 0, 9],
          [pathToFileURL(path.join(workspace, "OtherB.ets")).href, 1, 21],
        ].map(([uri, line, character]) => ({ uri, range: {
          start: { line, character }, end: { line, character: character + 10 },
        } }))
        assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
        const withoutDeclaration = await session.request("textDocument/references", {
          textDocument: { uri }, position: { line: 0, character: 14 },
          context: { includeDeclaration: false },
        }, { timeoutMs: 20_000 })
        assert.equal(withoutDeclaration.error, undefined, JSON.stringify(withoutDeclaration.error))
        assert.deepEqual(withoutDeclaration.result.map(JSON.stringify).sort(), expected
          .filter(item => item.uri !== uri || item.range.start.line !== 0).map(JSON.stringify).sort())
      }

      const logged = events(logDirectory)
      assert.equal(logged.filter(event => event.event === "references.pressure.rejected").length,
        rejected ? 1 : 0)
      if (rejected) assert.equal(logged.filter(event => event.event === "references.batch.start").length, 0)
      else assert.ok(logged.some(event => event.event === "references.batch.start"))
      assert.equal(logged.filter(event => event.event === "semantic.context.create").length,
        createdBeforeReferences, "references cannot readmit an interactive resident context at L3")
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri }, position: { line: 1, character: 27 },
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [{ uri, range: {
        start: { line: 0, character: 13 }, end: { line: 0, character: 23 },
      } }], "admission cannot poison subsequent interactive queries")
      const overlay = `${source}export const broken = missingAfterAdmission\n`
      session.changeDocument({ uri, version: 2, text: overlay })
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 2, 20_000)
      assert.ok(latest.params.diagnostics.some(item => item.code === 2304
        && item.message.includes("missingAfterAdmission")))
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
    })

}

for (const jointPolicy of [false, true]) {
test(jointPolicy ? "joint RSS policy preserves latest transient diagnosis under persistent L3"
  : "experimental L3 diagnosis publishes the current overlay without resident readmission",
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l3-diagnosis-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const workspace = path.join(directory, "workspace")
    const sdk = path.join(directory, "sdk")
    const logDirectory = path.join(directory, "logs")
    const metricsFile = path.join(directory, "memory.jsonl")
    fs.mkdirSync(workspace)
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
      "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))
    const source = "export class AlphaThing {}\nexport const alpha = new AlphaThing()\n"
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
        ARKTS_REFERENCES_TRACE: "1",
        ARKTS_MEMORY_BUDGET_MB: "1",
        ARKTS_BENCHMARK_CONTROL: "1",
        ARKTS_L01_TRANSIENT_DIAGNOSTICS: "1",
        ARKTS_L01_TRANSIENT_DIAGNOSTICS_TRACE: "1",
        ARKTS_MEMORY_METRICS_FILE: metricsFile,
        ARKTS_L03_COST_AWARE_EVICTION: jointPolicy ? "1" : "0",
        ARKTS_L01_PRESSURE_ADMISSION: jointPolicy ? "1" : "0",
        ARKTS_REFERENCES_CONTEXT_RETENTION: jointPolicy ? "budget-aware" : "dispose",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    session.openDocument({ uri, version: 1, text: source })
    const initial = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 1, 20_000)
    assert.deepEqual(initial.params.diagnostics, [])
    await waitForEvent(logDirectory, event => event.event === "semantic.context.evict"
      || event.event === "diagnostics.transient.complete")
    const createdBeforeEdit = events(logDirectory)
      .filter(event => event.event === "semantic.context.create").length

    const changed = `${source}export const broken = notDefinedName\n`
    session.changeDocument({ uri, version: 2, text: changed })
    const latest = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 2, 20_000)
    assert.ok(latest.params.diagnostics.some(diagnostic => diagnostic.code === 2304
      && diagnostic.message.includes("notDefinedName")),
    "the current unsaved overlay keeps its exact compiler diagnostic")
    assert.equal(events(logDirectory).filter(event => event.event === "semantic.context.create").length,
      createdBeforeEdit, "active L3 must not readmit a resident diagnostic context")
    await session.close({ timeoutMs: 5_000 })

    assert.match(session.transport.stderr, /"event":"diagnostics\.transient\.phase"/,
      "diagnostic phases are emitted to stderr, not the LSP protocol stream")
    const metrics = fs.readFileSync(metricsFile, "utf8").split("\n").filter(Boolean).map(JSON.parse)
    assert.ok(metrics.some(sample => sample.activeDiagnosticVerifierCount === 1
      && sample.totalSemanticWorkerCount === 2), "physical diagnostic occupancy must be recorded")
    assert.equal(metrics.at(-1).transientVerifierCount, 0,
      "physical diagnostic exit must release occupancy before versioned publication")
    const trace = events(logDirectory)
      .filter(event => event.event === "diagnostics.transient.phase" && event.documentVersion === 2)
      .sort((a, b) => Number(BigInt(a.monotonicNs) - BigInt(b.monotonicNs)))
    assert.deepEqual(trace.map(event => event.phase), [
      "spawn.before", "spawn.after", "engine.configure.start", "engine.configure.end",
      "engine.sync.start", "engine.sync.end", "engine.diagnose.start", "engine.diagnose.end",
      "engine.dispose.start", "engine.dispose.end", "response", "terminate.start", "terminate.end",
    ], "one diagnostic trace connects parent and verifier phases")
    assert.equal(new Set(trace.map(event => event.traceId)).size, 1)
    assert.equal(new Set(trace.map(event => event.pid)).size, 1,
      "worker-thread RSS belongs to the same Node PID")
    assert.equal(new Set(trace.map(event => event.threadId)).size, 2)
    for (const event of trace) {
      assert.equal(typeof event.traceId, "string")
      assert.ok(event.traceId.length > 0)
      assert.ok(Number.isSafeInteger(event.epochMs))
      assert.ok(BigInt(event.monotonicNs) > 0n)
      assert.ok(Number.isSafeInteger(event.pid) && event.pid > 0)
      assert.ok(Number.isSafeInteger(event.threadId) && event.threadId >= 0)
      assert.ok(Number.isSafeInteger(event.rssBytes) && event.rssBytes > 0)
      assert.ok(Number.isSafeInteger(event.heapUsedBytes) && event.heapUsedBytes > 0)
      assert.equal("uri" in event, false, "trace does not reveal an absolute source path")
    }
  })

}

for (const [strategy, pressureAdmission = "1", cancelFirst = false, batchRoots = "1", jointPolicy = false] of [
  ["batched"], ["indexed-batched"], ["batched", "0"], ["batched", "1", true], ["batched", "1", false, "64"],
  ["batched", "1", false, "1", true], ["batched", "1", true, "64", true],
]) {
  const rejectedByPressure = pressureAdmission === "1" && !cancelFirst && batchRoots === "1"
  test((jointPolicy ? "joint RSS policy: " : "") + (cancelFirst ? "client cancellation wins before in-flight pressure admission"
    : pressureAdmission === "0" ? "disabled pressure admission preserves complete in-flight references"
    : batchRoots === "64" ? "complete one-batch coverage remains valid across an in-flight L3 transition"
    : `experimental admission stops later verifier batches after an in-flight L3 transition (${strategy})`),
    { timeout: 60_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-midflight-admission-"))
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
      const source = "/* 😀 */ export class AlphaThing {}\nexport const alpha = new AlphaThing()\n"
      const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
      fs.writeFileSync(path.join(workspace, "Query.ets"), source)
      for (const name of ["CallerA", "CallerB"]) fs.writeFileSync(path.join(workspace, `${name}.ets`),
        'import { AlphaThing } from "./Query"\nexport const value = new AlphaThing()\n')
      const session = new LspSession({
        command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
        cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: {
          ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
          ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_REFERENCES_STRATEGY: strategy, ARKTS_REFERENCES_TRACE: "1",
          ARKTS_REFERENCES_BATCH_ROOTS: batchRoots, ARKTS_MEMORY_BUDGET_MB: "1024",
          ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
          ARKTS_BENCHMARK_CONTROL: "1", ARKTS_L01_PRESSURE_ADMISSION: pressureAdmission,
          ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "1500",
          ARKTS_L03_COST_AWARE_EVICTION: jointPolicy ? "1" : "0",
          ARKTS_REFERENCES_CONTEXT_RETENTION: jointPolicy ? "budget-aware" : "dispose",
        },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
      session.openDocument({ uri, version: 1, text: source })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 1, 20_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
      const parameters = { textDocument: { uri }, position: { line: 1, character: 27 },
        context: { includeDeclaration: true } }
      const requestId = session.nextRequestId
      const pending = session.request("textDocument/references", parameters, { timeoutMs: 20_000 })
      void pending.catch(() => {})
      let settled = false
      void pending.then(() => { settled = true }, () => { settled = true })
      await waitForEvent(logs, event => event.event === "references.batch.start")
      assert.ok(events(logs).some(event => event.event === "references.plan.complete"
        && (batchRoots === "1" ? event.batchCount > 1 : event.batchCount === 1)))
      const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri }, position: parameters.position,
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [{ uri, range: {
        start: { line: 0, character: 22 }, end: { line: 0, character: 32 },
      } }], "the interactive response fences the Worker control while references remain detached")
      assert.equal(settled, false)
      if (cancelFirst) session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: requestId } })
      const rejected = await pending
      if (rejectedByPressure || cancelFirst) {
        assert.equal(rejected.result, undefined, "rejection or cancellation cannot publish first-batch Locations")
        assert.equal(rejected.error?.code, cancelFirst ? -32800 : -32803, JSON.stringify(rejected.error))
        if (rejectedByPressure) assert.match(rejected.error.message, /semantic memory budget/)
      } else assert.equal(rejected.error, undefined, JSON.stringify(rejected.error))
      const firstQueryEvents = events(logs)
      const starts = firstQueryEvents.filter(event => event.event === "references.batch.start").length
      if (pressureAdmission === "0") assert.ok(starts > 1)
      else assert.equal(starts, 1)
      assert.equal(firstQueryEvents.filter(event => event.event === "references.batch.complete").length, cancelFirst ? 0 : starts)
      if (!cancelFirst) assert.ok(firstQueryEvents.some(event => event.event === "references.batch.complete" && event.locations > 0))
      assert.equal(firstQueryEvents.filter(event => event.event === "references.pressure.rejected").length, rejectedByPressure ? 1 : 0)
      const recovered = await session.request("textDocument/references", parameters, { timeoutMs: 20_000 })
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      const expected = [[uri, 0, 22], [uri, 1, 25], ...["CallerA", "CallerB"].flatMap(name => [
        [pathToFileURL(path.join(workspace, `${name}.ets`)).href, 0, 9],
        [pathToFileURL(path.join(workspace, `${name}.ets`)).href, 1, 25],
      ])].map(([uri, line, character]) => ({ uri, range: {
        start: { line, character }, end: { line, character: character + 10 },
      } }))
      assert.deepEqual(recovered.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort(),
        "a new request is neither poisoned by the old pressure witness nor served partial cached results")
      if (!rejectedByPressure && !cancelFirst) assert.deepEqual(rejected.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
      session.changeDocument({ uri, version: 2, text: `${source}export const later = new AlphaThing()\nexport const broken = missingAfterMidflightPressure\n` })
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 2, 20_000)
      assert.ok(latest.params.diagnostics.some(item => item.code === 2304
        && item.message.includes("missingAfterMidflightPressure")))
      const edited = await session.request("textDocument/references", {
        ...parameters, context: { includeDeclaration: false },
      }, { timeoutMs: 20_000 })
      assert.equal(edited.error, undefined, JSON.stringify(edited.error))
      assert.deepEqual(edited.result.map(JSON.stringify).sort(), [...expected
        .filter(item => item.uri !== uri || item.range.start.line !== 0), { uri, range: {
          start: { line: 2, character: 25 }, end: { line: 2, character: 35 },
        } }].map(JSON.stringify).sort(), "latest overlay and declaration policy survive pressure or cancellation")
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
    })
}

function events(logDirectory) {
  const logFile = path.join(logDirectory, "server.log")
  if (!fs.existsSync(logFile)) return []
  return completeLogEvents(logFile)
}

async function waitForEvent(logDirectory, predicate, count = 1) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (events(logDirectory).filter(predicate).length >= count) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail(`timed out waiting for ${count} matching events`)
}

test("in-flight pressure transcript polling waits for complete lines and rejects corrupt complete records", t => {
  const logs = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-pressure-log-reader-"))
  t.after(() => fs.rmSync(logs, { recursive: true, force: true }))
  const file = path.join(logs, "server.log"), first = { event: "references.batch.start", source: "😀" }
  fs.writeFileSync(file, `${JSON.stringify(first)}\n{"event":"par`)
  assert.deepEqual(events(logs), [first])
  fs.appendFileSync(file, 'tial"}\n')
  assert.deepEqual(events(logs), [first, { event: "partial" }])
  fs.appendFileSync(file, "corrupt-complete-record\n")
  assert.throws(() => events(logs), SyntaxError)
})
