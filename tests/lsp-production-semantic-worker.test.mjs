import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"
import { LspSession } from "./support/lsp-session.mjs"
import { diagnostic, location, waitForEvent } from "./support/semantic-recycle-lsp.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "basic")

test("production semantics run in one worker and report the bounded resident set", async (t) => {
  const metricsPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-worker-")),
    "memory.jsonl",
  )
  t.after(() => fs.rmSync(path.dirname(metricsPath), { recursive: true, force: true }))
  assert.ok(
    fs.existsSync(path.join(projectRoot, "dist", "semantic-worker.cjs")),
    "pnpm build must emit dist/semantic-worker.cjs",
  )

  const server = new LspProcess({ env: {
    ARKTS_MEMORY_METRICS_FILE: metricsPath,
    ARKTS_BENCHMARK_CONTROL: "1",
  } })
  t.after(() => server.close())
  const rootUri = pathToFileURL(fixtureRoot).href
  const uri = pathToFileURL(path.join(fixtureRoot, "Profile.ets")).href
  const text = [
    "struct Profile {",
    "  title: string = \"Ada\"",
    "  build(): void {",
    "    this.",
    "  }",
    "}",
  ].join("\n")

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri, capabilities: {} },
  })
  assert.equal((await server.response(1)).error, undefined)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri, languageId: "arkts", version: 1, text } },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: { textDocument: { uri }, position: { line: 3, character: 9 } },
  })

  const response = await server.response(2, 15_000)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result.items
  assert.ok(items.some((item) => item.label === "title"))

  server.send({
    jsonrpc: "2.0",
    id: 5,
    method: "arkts/benchmark/applyMemoryPressure",
    params: { level: "level3" },
  })
  assert.deepEqual((await server.response(5, 10_000)).result, { applied: "level3" })

  const changedText = text.replace(
    "  title: string = \"Ada\"",
    "  subtitle: string = \"Grace\"",
  )
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: changedText }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "textDocument/completion",
    params: { textDocument: { uri }, position: { line: 3, character: 9 } },
  })
  const rebuilt = await server.response(4, 15_000)
  assert.equal(rebuilt.error, undefined, JSON.stringify(rebuilt.error))
  const rebuiltItems = Array.isArray(rebuilt.result) ? rebuilt.result : rebuilt.result.items
  assert.ok(rebuiltItems.some((item) => item.label === "subtitle"))
  assert.equal(rebuiltItems.some((item) => item.label === "title"), false)

  server.send({ jsonrpc: "2.0", id: 3, method: "shutdown", params: null })
  assert.equal((await server.response(3, 10_000)).error, undefined)
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  await server.close()

  const metrics = fs.readFileSync(metricsPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  assert.ok(metrics.length > 0)
  assert.ok(metrics.every((sample) => sample.semanticWorkerCount === 1))
  assert.ok(metrics.every((sample) => sample.residentContextCount <= 2))
  assert.ok(metrics.some((sample) => sample.openDocuments === 1))
})

test("completion recovers after module visit mutations and L3 pressure", { timeout: 30_000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-pressure-recovery-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const uri = pathToFileURL(path.join(directory, "Entry.ets")).href
  const source = "export class Entry {\n  stableMember: number = 1\n  build() { return this. }\n}\n"
  fs.writeFileSync(path.join(directory, "Entry.ets"), source)
  const calls = "export function target(): number { return 1 }\nexport function caller(): number { return target() }\n"
  const callsUri = pathToFileURL(path.join(directory, "Calls.ets")).href
  fs.writeFileSync(path.join(directory, "Calls.ets"), calls)
  const otherRoot = path.join(directory, "other")
  fs.mkdirSync(otherRoot)
  const otherUri = pathToFileURL(path.join(otherRoot, "Other.ets")).href
  fs.writeFileSync(path.join(otherRoot, "Other.ets"), source)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(directory).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
      ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1500",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "Entry.ets",
      ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
      ARKTS_LSP_LOG_DIR: path.join(directory, "logs"),
    },
  })
  t.after(() => session.close().catch(() => {}))
  const initialized = await session.request("initialize", {
    processId: process.pid, rootUri: pathToFileURL(directory).href,
    workspaceFolders: [directory, otherRoot].map((root, index) => ({
      name: `root-${index}`, uri: pathToFileURL(root).href,
    })),
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
  }, { timeoutMs: 10_000 })
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
  session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  session.initialized = true
  session.openDocument({ uri: otherUri, version: 1, text: source })
  const otherParams = { textDocument: { uri: otherUri }, position: { line: 2, character: 24 } }
  assert.equal((await session.request("textDocument/completion", otherParams,
    { timeoutMs: 15_000 })).error, undefined)
  session.openDocument({ uri: callsUri, version: 1, text: calls })
  const prepared = await session.request("textDocument/prepareCallHierarchy", {
    textDocument: { uri: callsUri }, position: { line: 1, character: 17 },
  }, { timeoutMs: 15_000 })
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  assert.equal(prepared.result.length, 1)
  const callParams = { item: prepared.result[0] }
  const baselineCalls = await session.request("callHierarchy/outgoingCalls", callParams, { timeoutMs: 15_000 })
  assert.equal(baselineCalls.error, undefined, JSON.stringify(baselineCalls.error))
  assert.equal(baselineCalls.result.length, 1)
  assert.equal(baselineCalls.result[0].to.name, "target")
  assert.deepEqual(baselineCalls.result[0].to.selectionRange, location(callsUri, calls, 0, "target").range)
  session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
    params: { textDocument: { uri: callsUri } } })
  session.openDocument({ uri, version: 1, text: source })
  const params = { textDocument: { uri }, position: { line: 2, character: 24 } }
  const initial = await session.request("textDocument/completion", params, { timeoutMs: 15_000 })
  assert.equal(initial.error, undefined, JSON.stringify(initial.error))
  const items = response => Array.isArray(response.result) ? response.result : response.result?.items ?? []
  assert.ok(items(initial).some(item => item.label === "stableMember"))
  await waitForEvent(path.join(directory, "logs"), entry => entry.event === "semantic.test.diagnose.hold.start")
  const otherLatest = source.replace("stableMember", "otherLatestMember")
  session.changeDocument({ uri: otherUri, version: 2, text: otherLatest })
  for (let index = 0; index < 20; index += 1) {
    const file = path.join(directory, `Visit${index}.ets`)
    const text = `export class Visit${index} { member: number = ${index} }\n`
    fs.writeFileSync(file, text)
    const visitUri = pathToFileURL(file).href
    session.openDocument({ uri: visitUri, version: 1, text })
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: visitUri } } })
  }
  const latest = `${source.replace("stableMember", "latestMember")}\nmissingAfterRecovery\n`
  session.changeDocument({ uri, version: 2, text: latest })
  const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
  assert.deepEqual(pressure.result, { applied: "level3" })
  const waitingCalls = session.request("callHierarchy/outgoingCalls", callParams, { timeoutMs: 15_000 })
  const cancelId = session.nextRequestId++
  session.transport.send({ jsonrpc: "2.0", id: cancelId, method: "textDocument/completion", params })
  session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: cancelId } })
  const cancelled = await session.transport.response(cancelId, 15_000)
  assert.equal(cancelled.result, undefined)
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled.error))
  const recoveredCalls = await waitingCalls
  assert.equal(recoveredCalls.error, undefined, JSON.stringify(recoveredCalls.error))
  assert.deepEqual(recoveredCalls.result, baselineCalls.result)
  const recovered = await session.request("textDocument/completion", params, { timeoutMs: 15_000 })
  assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
  assert.ok(items(recovered).some(item => item.label === "latestMember"))
  assert.equal(items(recovered).some(item => item.label === "stableMember"), false)
  assert.ok((await diagnostic(session, uri, 2)).params.diagnostics.some(entry => entry.code === 2304))
  const recovery = await waitForEvent(path.join(directory, "logs"),
    entry => entry.event === "semantic.worker.recovery.complete")
  assert.ok(recovery.oldThreadId > 0 && recovery.newThreadId > 0)
  assert.notEqual(recovery.oldThreadId, recovery.newThreadId)
  // Apply pressure again after replacement: recovery must also rebuild evicted state.
  assert.deepEqual((await session.request("arkts/benchmark/applyMemoryPressure",
    { level: "level3" })).result, { applied: "level3" })
  const repeated = await session.request("textDocument/completion", params, { timeoutMs: 15_000 })
  assert.equal(repeated.error, undefined, JSON.stringify(repeated.error))
  assert.ok(items(repeated).some(item => item.label === "latestMember"))
  assert.equal(items(repeated).some(item => item.label === "stableMember"), false)
  const otherRecovered = await session.request("textDocument/completion", otherParams, { timeoutMs: 15_000 })
  assert.equal(otherRecovered.error, undefined, JSON.stringify(otherRecovered.error))
  assert.ok(items(otherRecovered).some(item => item.label === "otherLatestMember"))
  assert.equal(items(otherRecovered).some(item => item.label === "stableMember"), false)
  await diagnostic(session, otherUri, 2)
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
})

for (const [name, trace, cancel, jointPolicy = false] of [
  ["metrics account for physical transient references without double-counting resident RSS", "1", false],
  ["physical transient metrics do not depend on compiler tracing", "0", false],
  ["cancelled physical transient occupancy reaches zero before exact recovery", "1", true],
  ["joint RSS policy preserves resident and verifier overlap with exact latest diagnostics", "1", false, true],
  ["joint RSS policy cancellation and recovery remain correct without compiler tracing", "0", true, true],
]) {
  test(name,
    { timeout: 60_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-transient-occupancy-"))
      t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
      const workspace = path.join(directory, "workspace")
      const sdk = path.join(directory, "sdk")
      const logs = path.join(directory, "logs")
      const metricsPath = path.join(directory, "memory.jsonl")
      fs.mkdirSync(workspace)
      fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
      fs.mkdirSync(path.join(sdk, "toolchains"))
      fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
      fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
        JSON.stringify({ apiVersion: "24", version: "test" }))
      const source = "/* 😀 */ export class AlphaThing {}\nexport const value = new AlphaThing()\n"
      const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
      fs.writeFileSync(path.join(workspace, "Query.ets"), source)
      const caller = 'import { AlphaThing } from "./Query"\nexport const value = new AlphaThing()\n'
      for (const name of ["CallerA", "CallerB"]) fs.writeFileSync(path.join(workspace, `${name}.ets`), caller)
      const session = new LspSession({
        command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
        cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: {
          ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
          ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_MEMORY_METRICS_FILE: metricsPath, ARKTS_MEMORY_BUDGET_MB: "1024",
          ARKTS_REFERENCES_STRATEGY: "batched", ARKTS_REFERENCES_BATCH_ROOTS: "64",
          ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware", ARKTS_REFERENCES_TRACE: trace,
          ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "1500",
          ARKTS_BENCHMARK_CONTROL: jointPolicy ? "1" : "0",
          ARKTS_L03_COST_AWARE_EVICTION: jointPolicy ? "1" : "0",
          ARKTS_L01_PRESSURE_ADMISSION: jointPolicy ? "1" : "0",
          ARKTS_L03_PRESSURE_WORKER_RECYCLE: jointPolicy ? "1" : "0",
          ARKTS_L01_TRANSIENT_DIAGNOSTICS: jointPolicy ? "1" : "0",
        },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
      session.openDocument({ uri, version: 1, text: source })
      assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
      const params = {
        textDocument: { uri }, position: { line: 1, character: 26 },
        context: { includeDeclaration: true },
      }
      if (cancel) {
        const id = session.nextRequestId++
        session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params })
        const pending = session.transport.response(id, 20_000)
        const started = await waitForRuntimeMetric(metricsPath, sample => sample.activeReferenceVerifierCount === 1)
        session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
        const cancelled = await pending
        assert.equal(cancelled.result, undefined)
        assert.equal(cancelled.error?.code, -32800)
        await waitForRuntimeMetric(metricsPath, sample => sample.transientVerifierCount === 0
          && BigInt(sample.monotonicNs) > BigInt(started.monotonicNs))
      }
      const response = await session.request("textDocument/references", params, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const expected = [location(uri, source, 0, "AlphaThing"), location(uri, source, 1, "AlphaThing")]
      for (const name of ["CallerA", "CallerB"]) {
        const target = pathToFileURL(path.join(workspace, `${name}.ets`)).href
        for (const line of [0, 1]) expected.push(location(target, caller, line, "AlphaThing"))
      }
      assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
      if (trace === "1") await waitForEvent(logs, entry => entry.event === "references.batch.complete")
      const samples = readRuntimeMetrics(metricsPath)
      assert.ok(samples.some(sample => sample.activeReferenceVerifierCount === 1
        && sample.residentContextCount === 1 && sample.totalSemanticWorkerCount === 2),
      "a live resident LS and a physical verifier share one Node PID RSS, not one Worker lifetime")
      assert.equal(samples.at(-1).transientVerifierCount, 0,
        "the physical Worker exit is recorded before publishing the complete response")
      assert.ok(samples.every(sample => sample.transientVerifierCount === sample.activeReferenceVerifierCount
        + sample.activeAnchorVerifierCount + sample.activeDiagnosticVerifierCount
        && sample.totalSemanticWorkerCount === 1 + sample.transientVerifierCount
        && sample.transientVerifierCount >= 0))
      const transitions = []
      for (const sample of samples) {
        if (transitions.length === 0 && sample.transientVerifierCount === 0) continue
        if (transitions.at(-1) !== sample.transientVerifierCount) transitions.push(sample.transientVerifierCount)
      }
      assert.deepEqual(transitions, cancel ? [1, 0, 1, 0] : [1, 0])
      assert.ok(samples.every(sample => sample.processId === session.transport.child.pid
        && sample.rssScope === "node-process" && sample.heapScope === "semantic-worker-isolate"
        && Number.isFinite(sample.rss) && sample.rss > 0
        && Number.isSafeInteger(sample.epochMs) && sample.epochMs > 0
        && typeof sample.monotonicNs === "string" && /^\d+$/.test(sample.monotonicNs)),
      "occupancy samples need clocks to align physical phases with process memory observations")
      const overlay = `${source}export const later = new AlphaThing()\nmissingAfterOccupancy\n`
      session.changeDocument({ uri, version: 2, text: overlay })
      assert.ok((await diagnostic(session, uri, 2)).params.diagnostics.some(entry => entry.code === 2304))
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri }, position: { line: 2, character: 26 },
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [location(uri, overlay, 0, "AlphaThing")])
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
    })
}

async function waitForRuntimeMetric(file, predicate) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const sample = readRuntimeMetrics(file).find(predicate)
    if (sample) return sample
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail("timed out waiting for physical Worker occupancy")
}

function readRuntimeMetrics(file) {
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}
