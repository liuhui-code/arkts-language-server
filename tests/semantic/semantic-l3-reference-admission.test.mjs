import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

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
        textDocument: { uri }, position: { line: 0, character: 14 },
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

test("experimental L3 admission rejects multi-batch references before verifier work",
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
    fs.writeFileSync(path.join(workspace, "OtherA.ets"), "export const a = 1\n")
    fs.writeFileSync(path.join(workspace, "OtherB.ets"), "export const b = 2\n")
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
        ARKTS_REFERENCES_BATCH_ROOTS: "1",
        ARKTS_MEMORY_BUDGET_MB: "1",
        ARKTS_BENCHMARK_CONTROL: "1",
        ARKTS_L01_PRESSURE_ADMISSION: "1",
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

    const response = await session.request("textDocument/references", {
      textDocument: { uri }, position: { line: 0, character: 14 },
      context: { includeDeclaration: true },
    }, { timeoutMs: 20_000 })
    assert.equal(response.result, undefined, "a rejected plan must not return Locations")
    assert.equal(response.error?.code, -32803)
    assert.match(response.error.message, /semantic memory budget/)
    await session.close({ timeoutMs: 5_000 })

    const logged = events(logDirectory)
    assert.ok(logged.some(event => event.event === "references.plan.complete"
      && event.batchCount > 1), "the compiler plan exceeded one batch")
    assert.equal(logged.filter(event => event.event === "references.pressure.rejected").length, 1)
    assert.equal(logged.filter(event => event.event === "references.batch.start").length, 0)
  })

test("experimental L3 diagnosis publishes the current overlay without resident readmission",
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l3-diagnosis-"))
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

function events(logDirectory) {
  const logFile = path.join(logDirectory, "server.log")
  if (!fs.existsSync(logFile)) return []
  return fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

async function waitForEvent(logDirectory, predicate, count = 1) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (events(logDirectory).filter(predicate).length >= count) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail(`timed out waiting for ${count} matching events`)
}
