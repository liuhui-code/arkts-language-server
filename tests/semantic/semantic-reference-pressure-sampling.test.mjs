import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { diagnostic, location, waitForEvent } from "../support/semantic-recycle-lsp.mjs"

for (const [name, strategy, benchmark, pressureFlag, batchRoots, trace] of [
  ["references refresh aggregate RSS before admitting a stale-pressure multi-batch plan", "batched", "1", "1", "1", "1"],
  ["legacy references refresh aggregate RSS before resident pressure admission", "legacy", "1", "1", "1", "1"],
  ["indexed references refresh aggregate RSS before pressure admission", "indexed-batched", "1", "1", "1", "1"],
  ["RSS admission stays active with reference tracing disabled", "legacy", "1", "1", "1", "0"],
  ["fresh RSS admission still permits complete single-batch coverage", "batched", "1", "1", "64", "1"],
  ["RSS admission stays disabled without pressure opt-in", "batched", "1", "0", "1", "1"],
  ["RSS admission defaults on without benchmark control", "batched", "0", undefined, "1", "1"],
]) {
  const rejected = (pressureFlag ?? "1") === "1" && batchRoots === "1"
  test(name,
    { timeout: 60_000 }, async t => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-pressure-sample-"))
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
      for (const name of ["CallerA", "CallerB"]) fs.writeFileSync(path.join(workspace, `${name}.ets`),
        'import { AlphaThing } from "./Query"\nexport const value = new AlphaThing()\n')
      const session = new LspSession({
        command: process.execPath,
        args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
        cwd: projectRoot,
        rootUri: pathToFileURL(workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: {
          ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
          ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_MEMORY_METRICS_FILE: metricsPath, ARKTS_MEMORY_BUDGET_MB: "1",
          ARKTS_REFERENCES_STRATEGY: strategy, ARKTS_REFERENCES_TRACE: trace,
          ARKTS_REFERENCES_BATCH_ROOTS: batchRoots, ARKTS_BENCHMARK_CONTROL: benchmark,
          ARKTS_L01_PRESSURE_ADMISSION: pressureFlag,
          ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: strategy === "batched" ? "1500" : "0",
        },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
      session.openDocument({ uri, version: 1, text: source })
      assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
      if (trace === "1") await waitForEvent(logs,
        entry => (entry.event === "semantic.context.evict" && entry.reason === "memory-level3")
          || entry.event === "diagnostics.transient.complete")
      assert.ok(metrics(metricsPath).at(-1).rss > 1024 * 1024,
        "the actual process RSS, not summed per-thread samples, exceeds this functional budget")

      // Make the recorded grade stale without changing the actual RSS. Send the
      // reference request immediately, within the existing one-second sample window.
      if (benchmark === "1") {
        const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
        assert.deepEqual(pressure.result, { applied: "level2" }, JSON.stringify(pressure.error))
      }
      const response = await session.request("textDocument/references", {
        textDocument: { uri }, position: { line: 1, character: 26 },
        context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      if (rejected) {
        assert.equal(response.result, undefined, "incomplete coverage must not be published as Locations")
        assert.equal(response.error?.code, -32803)
      } else {
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        assertLocations(response.result, expectedLocations(uri, source, workspace, true))
      }
      if (trace === "1") {
        const entries = events(logs)
        assert.ok(entries.some(entry => entry.event === "references.plan.complete"
          && (batchRoots === "1" ? entry.batchCount > 1 : entry.batchCount === 1)))
        const starts = entries.filter(entry => entry.event === "references.batch.start").length
        if (rejected) assert.equal(starts, 0,
          "fresh aggregate RSS must reject a multi-batch plan before paying for its first verifier")
        else assert.ok(starts > 0 && starts <= (batchRoots === "1" ? 3 : 1),
          "complete-scope proof may finish before consuming every planned batch")
        if (rejected) assert.equal(entries.findLast(entry => entry.event === "references.pressure.rejected")?.admissionPhase, "plan")
      }

      const overlay = `${source}export const later = new AlphaThing()\nmissingAfterPressureSampling\n`
      session.changeDocument({ uri, version: 2, text: overlay })
      const latest = await diagnostic(session, uri, 2)
      assert.ok(latest.params.diagnostics.some(entry => entry.code === 2304))
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri }, position: { line: 2, character: 26 },
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [location(uri, overlay, 0, "AlphaThing")])
      const again = await session.request("textDocument/references", {
        textDocument: { uri }, position: { line: 2, character: 26 },
        context: { includeDeclaration: false },
      }, { timeoutMs: 20_000 })
      if (rejected) {
        assert.equal(again.result, undefined, "a refused query must not leave a partial success cache")
        assert.equal(again.error?.code, -32803)
      } else {
        assert.equal(again.error, undefined, JSON.stringify(again.error))
        assertLocations(again.result, expectedLocations(uri, overlay, workspace, false))
      }
      const samples = metrics(metricsPath)
      assert.ok(samples.every(sample => sample.semanticWorkerCount === 1 && sample.residentContextCount <= 2))
      const closed = await session.close({ timeoutMs: 5_000 })
      assert.deepEqual(closed.exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
    })
}

for (const [name, budget, benchmark, pressureFlag, batchRoots, trace, cancel = false,
  jointPolicy = false, resident = false] of [
  ["high RSS skips discovery-only anchor without losing exact full-scope references", "1", "1", "1", "64", "1"],
  ["L3 discovery skips anchor and refuses incomplete multi-batch coverage", "1", "1", "1", "1", "1"],
  ["L3 anchor skipping remains active with compiler tracing disabled", "1", "1", "1", "64", "0"],
  ["anchor pressure admission stays disabled without opt-in", "1", "1", "0", "64", "1"],
  ["anchor pressure admission defaults on without benchmark control", "1", "0", undefined, "64", "1"],
  ["low RSS retains compiler anchor preparation under pressure opt-in", "1024", "1", "1", "64", "1"],
  ["cancelled full-scope fallback after L3 anchor skip permits exact recovery", "1", "1", "1", "64", "1", true],
  ["joint RSS policy preserves complete scope and transient diagnosis at high pressure", "1", "1", "1", "64", "1", false, true],
  ["joint RSS policy rejects incomplete coverage without compiler tracing", "1", "1", "1", "1", "0", false, true],
  ["joint RSS policy keeps low-pressure anchor preparation and latest diagnostics", "1024", "1", "1", "64", "1", false, true],
  ["joint RSS policy cancels and recovers the high-pressure complete verifier", "1", "1", "1", "64", "1", true, true],
  ["L04 selected policy refuses resident proof at high RSS and verifies the complete scope", "1", "1", "1", "64", "1", false, true, true],
  ["L04 selected policy rejects incomplete coverage without tracing or partial success", "1", "1", "1", "1", "0", false, true, true],
  ["L04 selected policy cancels and recovers a complete verifier with current diagnostics", "1", "1", "1", "64", "1", true, true, true],
]) {
  const skipAnchor = budget === "1" && (pressureFlag ?? "1") === "1"
  const reject = skipAnchor && batchRoots === "1"
  test(name,
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-anchor-pressure-"))
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
    const sources = {
      "Target.ets": "export class Thing {}\n",
      "Barrel.ets": 'export { Thing as PublicThing } from "./Target"\n',
      "Query.ets": 'import { PublicThing } from "./Barrel"\n/* 😀 */ export const query = new PublicThing()\n',
      "Use.ets": 'import { PublicThing } from "./Barrel"\nexport const use = new PublicThing()\n',
      "SameName.ets": "export class PublicThing {}\nexport const unrelated = new PublicThing()\n",
    }
    for (const [file, text] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, file), text)
    const uri = file => pathToFileURL(path.join(workspace, file)).href
    const session = new LspSession({
      command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
      cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
      capabilities: { window: { workDoneProgress: true },
        textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
        ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests/fixtures/index/scripted-catalog-sidecar.mjs"),
        ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_MEMORY_METRICS_FILE: metricsPath, ARKTS_MEMORY_BUDGET_MB: budget,
        ARKTS_REFERENCES_STRATEGY: "indexed-batched", ARKTS_REFERENCES_TRACE: trace,
        ARKTS_REFERENCES_BATCH_ROOTS: batchRoots, ARKTS_REFERENCES_ANCHOR_REUSE: "0",
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: resident ? "1" : "0", ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "0",
        ARKTS_BENCHMARK_CONTROL: benchmark, ARKTS_L01_PRESSURE_ADMISSION: pressureFlag,
        ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: cancel ? "1000" : "0",
        ARKTS_L03_COST_AWARE_EVICTION: jointPolicy ? "1" : "0",
        ARKTS_REFERENCES_CONTEXT_RETENTION: jointPolicy ? "budget-aware" : "dispose",
        ARKTS_L01_TRANSIENT_DIAGNOSTICS: jointPolicy ? "1" : "0",
        ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0", ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
    session.openDocument({ uri: uri("Query.ets"), version: 1, text: sources["Query.ets"] })
    assert.deepEqual((await diagnostic(session, uri("Query.ets"), 1)).params.diagnostics, [])
    if (budget === "1" && trace === "1") {
      await waitForEvent(logs, entry => (entry.event === "semantic.context.evict" && entry.reason === "memory-level3")
        || entry.event === "diagnostics.transient.complete")
    }
    const sampledRss = metrics(metricsPath).at(-1).rss
    assert.ok(budget === "1" ? sampledRss > 1024 * 1024 : sampledRss < 1024 * 1024 * 1024)
    if (benchmark === "1") {
      const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
      assert.deepEqual(pressure.result, { applied: "level2" })
    }
    const params = {
      textDocument: { uri: uri("Query.ets") },
      position: { line: 1, character: sources["Query.ets"].split("\n")[1].indexOf("PublicThing") + 1 },
      context: { includeDeclaration: true },
    }
    if (cancel) {
      const id = session.nextRequestId++
      session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params })
      const pending = session.transport.response(id, 20_000)
      const started = await waitForMetric(metricsPath, sample => sample.activeReferenceJobCount === 1)
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
      const cancelled = await pending
      assert.equal(cancelled.result, undefined)
      assert.equal(cancelled.error?.code, -32800)
      await waitForMetric(metricsPath, sample => sample.activeVerifierJobCount === 0
        && BigInt(sample.monotonicNs) > BigInt(started.monotonicNs))
    }
    const response = await session.request("textDocument/references", params, { timeoutMs: 20_000 })
    const expected = [location(uri("Target.ets"), sources["Target.ets"], 0, "Thing"),
      location(uri("Barrel.ets"), sources["Barrel.ets"], 0, "Thing"),
      location(uri("Barrel.ets"), sources["Barrel.ets"], 0, "PublicThing")]
    for (const file of ["Query.ets", "Use.ets"]) {
      for (const line of [0, 1]) expected.push(location(uri(file), sources[file], line, "PublicThing"))
    }
    if (reject) {
      assert.equal(response.result, undefined)
      assert.equal(response.error?.code, -32803)
    } else {
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assertLocations(response.result, expected)
    }
    assert.equal(metrics(metricsPath).some(sample => sample.activeAnchorJobCount > 0), !skipAnchor,
      "only high RSS with both opt-ins skips discovery preparation; exact verification remains required")
    assert.equal(metrics(metricsPath).some(sample => sample.activeReferenceJobCount === 1), !reject)
    assert.equal(metrics(metricsPath).at(-1).transientVerifierCount, 0)
    if (trace === "1") {
      assert.equal(events(logs).some(entry => entry.event === "references.pressure.anchor-skipped"), skipAnchor)
      if (resident) {
        assert.ok(events(logs).some(entry => entry.event === "references.resident.miss"))
        assert.ok(!events(logs).some(entry => entry.event === "references.resident.hit"))
      }
      if (skipAnchor) assert.ok(events(logs).some(entry => entry.event === "references.plan.complete"
        && entry.candidateMode === "conservative"), "skipped discovery must restore the complete scope")
    }
    const overlay = `${sources["Query.ets"]}export const later = new PublicThing()\nmissingAfterAnchorPressure\n`
    session.changeDocument({ uri: uri("Query.ets"), version: 2, text: overlay })
    assert.ok((await diagnostic(session, uri("Query.ets"), 2)).params.diagnostics.some(entry => entry.code === 2304))
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Query.ets") }, position: { line: 2, character: 26 },
    }, { timeoutMs: 20_000 })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [location(uri("Target.ets"), sources["Target.ets"], 0, "Thing")])
    const changedExpected = [...expected, location(uri("Query.ets"), overlay, 2, "PublicThing")]
    for (const includeDeclaration of [false, true]) {
      const changed = await session.request("textDocument/references", {
        ...params, position: { line: 2, character: 26 }, context: { includeDeclaration },
      }, { timeoutMs: 20_000 })
      if (reject) {
        assert.equal(changed.result, undefined)
        assert.equal(changed.error?.code, -32803)
      } else {
        assert.equal(changed.error, undefined, JSON.stringify(changed.error))
        assertLocations(changed.result, changedExpected.filter(item => includeDeclaration || item.uri !== uri("Target.ets")))
      }
    }
    assert.ok(metrics(metricsPath).every(sample => sample.transientVerifierCount >= 0))
    assert.equal(metrics(metricsPath).at(-1).transientVerifierCount, 0)
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })
}

async function waitForMetric(file, predicate) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const sample = metrics(file).find(predicate)
    if (sample) return sample
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail("timed out waiting for physical verifier lifecycle")
}

function expectedLocations(uri, source, workspace, includeDeclaration) {
  const locations = [location(uri, source, 1, "AlphaThing")]
  if (includeDeclaration) locations.push(location(uri, source, 0, "AlphaThing"))
  if (source.includes("export const later")) locations.push(location(uri, source, 2, "AlphaThing"))
  for (const name of ["CallerA", "CallerB"]) {
    const target = pathToFileURL(path.join(workspace, `${name}.ets`)).href
    for (const [line, character] of [[0, 9], [1, 25]]) locations.push({ uri: target, range: {
      start: { line, character }, end: { line, character: character + 10 },
    } })
  }
  return locations
}

function assertLocations(actual, expected) {
  assert.deepEqual(actual.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
}

function events(logs) {
  return fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

function metrics(file) {
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}
