import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { projectRoot } from "./lsp-process.mjs"
import { macosWorkflow } from "./macos-workflow-fixture.mjs"
import { freshWorkflowDiagnostics } from "./macos-diagnostic-control.mjs"
import { registerMacosOracleCases } from "./macos-workflow-oracle-cases.mjs"

/** Public CLI execution/oracle/lifecycle cases, registered by the product-gate entry. */
export function registerMacosWorkflowCases() {
  test("macOS explicit start rejects a warm suffix without its original cache lineage", async (t) => {
    const { report, result } = await macosWorkflow(t, { startAt: "warm:1", expectedStatus: 1 })
    if (process.platform !== "darwin") return
    assert.equal(report, null, "invalid cache lineage must be rejected before a report or server is created")
    assert.match(result.stderr, /invalid workflow start: warm:1/u)
    assert.doesNotMatch(result.stdout, /MACOS_E2E=(?:PASS|PARTIAL)/u)
  })

  test("macOS explicit start retains the full plan and never promotes a passing suffix to complete", async (t) => {
    const { report, result } = await macosWorkflow(t, { oracle: true, completionOracle: true, startAt: "cold:2" })
    if (process.platform !== "darwin") return
    assert.deepEqual(report.workflowRuns, { cold: 3, warm: 10, stress: 5 })
    assert.deepEqual(report.workflowSelection, { startAt: "cold:2", selectedRuns: 16,
      excludedRuns: [{ kind: "cold", index: 0 }, { kind: "cold", index: 1 }] })
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 16, completedRuns: 16, unexecutedRuns: 2 })
    assert.deepEqual(report.unexecutedRuns, report.workflowSelection.excludedRuns)
    assert.equal(report.measurementStatus, "partial")
    assert.equal(report.failure, null)
    assert.equal(report.correctness.locationOracle.status, "PASS")
    assert.equal(report.correctness.completionOracle.status, "PASS")
    assert.deepEqual(report.runs.map(({ kind, index }) => ({ kind, index })), [
      { kind: "cold", index: 2 }, ...Array.from({ length: 10 }, (_, index) => ({ kind: "warm", index })),
      ...Array.from({ length: 5 }, (_, index) => ({ kind: "stress", index })),
    ])
    assert.ok(report.runs.every(run => run.status === "COMPLETE" && run.catalog.status === "READY"))
    assert.ok(report.runs.every(run => run.closeResult.exit.code === 0 && run.closeResult.exit.signal === null))
    assert.equal(report.releasePssComparable, false)
    assert.match(result.stdout, /MACOS_E2E=PARTIAL/u)
    assert.doesNotMatch(result.stdout, /MACOS_E2E=PASS/u)
  })

  test("macOS catalog observes real degraded progress and end without waiting the original deadline", async (t) => {
    const { report, result } = await macosWorkflow(t, { oracle: true, sidecarUnavailable: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    assert.ok(report, "an admitted degraded catalog must retain its actual terminal frames")
    assert.match(report.failure.message, /MACOS_CATALOG_DEGRADED/u)
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = report.runs[0], catalog = run.catalog
    assert.equal(catalog.status, "DEGRADED")
    assert.equal(catalog.timeoutMs, 180_000)
    assert.ok(catalog.elapsedMs < 5_000, "native terminal rejection must not pay the full deadline")
    assert.equal(catalog.createRequest.method, "window/workDoneProgress/create")
    assert.deepEqual(catalog.createResponse, { jsonrpc: "2.0", id: catalog.createRequest.id, result: null })
    assert.equal(catalog.events[0].params.value.kind, "begin")
    assert.equal(catalog.events.at(-1).params.value.kind, "end")
    assert.ok(catalog.events.every(event => event.method === "$/progress"
      && event.params.token === catalog.createRequest.params.token))
    assert.ok(catalog.events.some(event => event.params.value.kind === "report"
      && event.params.value.message.startsWith("Indexing degraded after ")))
    assert.ok(run.runtime.events.some(event => event.event === "index.catalog.terminal" && event.phase === "degraded"))
    assert.deepEqual(run.receipts, [])
    assert.equal(run.indexedFiles, null)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    assert.doesNotMatch(result.stdout, /MACOS_E2E=PASS/u)
  })

  test("macOS workflow retains complete original runtime logs and each native session lifecycle", async (t) => {
    const { report } = await macosWorkflow(t)
    if (process.platform !== "darwin") return
    assert.equal(report.runs.length, 18)
    for (const run of report.runs) {
      assert.equal(run.catalog.status, "READY")
      assert.equal(run.catalog.timeoutMs, 180_000)
      assert.equal(run.catalog.createRequest.method, "window/workDoneProgress/create")
      assert.deepEqual(run.catalog.createResponse,
        { jsonrpc: "2.0", id: run.catalog.createRequest.id, result: null })
      assert.equal(run.catalog.events[0].params.value.kind, "begin")
      assert.equal(run.catalog.events.at(-1).params.value.kind, "end")
      assert.ok(run.catalog.events.every(event => event.params.token === run.catalog.createRequest.params.token))
      assert.equal(run.catalog.terminalReport.params.value.percentage, 100)
      assert.match(run.catalog.terminalReport.params.value.message, /^Indexed 24\/24 files; skipped 0 entries$/u)
      assert.equal(typeof run.runtime?.rawJsonLines, "string", "temporary logs must survive their cache cleanup")
      assert.equal(run.runtime.logError, null)
      const originals = run.runtime.rawJsonLines.trim().split("\n").filter(Boolean).map(JSON.parse)
      assert.deepEqual(run.runtime.events, originals.filter(event => event.pid === run.targetPid))
      assert.equal(run.runtime.events.filter(event => event.event === "server.started").length, 1)
      assert.equal(run.runtime.events.filter(event => event.event === "server.stopped").length, 1)
      assert.ok(run.runtime.events.some(event => event.event === "semantic.worker.started"
        && event.semanticWorkerCount === 1))
      assert.ok(run.runtime.events.every(event => event.pid === run.targetPid))
      assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    }
    assert.equal(report.releasePssComparable, false)
  })

  test("macOS workflow reports the selected SDK instead of the repository lock", async (t) => {
    const { report, expectedDigest } = await macosWorkflow(t)
    if (process.platform !== "darwin") return
    const lock = JSON.parse(fs.readFileSync(
      path.join(projectRoot, "docs", "toolchains", "arkts-toolchain.lock.json"), "utf8"))
    assert.notEqual(expectedDigest, lock.sdkDeclarationDigest)
    assert.equal(report.comparisonIdentity.sdkDeclarationDigest, expectedDigest)
    assert.equal(report.comparisonIdentity.sdkApiLevel, 24)
    assert.deepEqual(report.workflowRuns, { cold: 3, warm: 10, stress: 5 })
    assert.equal(report.runs.length, 18)
    assert.equal(report.releasePssComparable, false)
  })

  test("macOS workflow retains every full semantic response and pressure receipt", async (t) => {
    const { report, workspace } = await macosWorkflow(t)
    if (process.platform !== "darwin") return
    const entry = path.join(workspace, "entry/src/main/ets/Main.ets")
    const lines = fs.readFileSync(entry, "utf8").split("\n")
    const location = line => {
      const character = lines[line].indexOf("stableMember")
      return { uri: pathToFileURL(entry).href, range: {
        start: { line, character }, end: { line, character: character + "stableMember".length },
      } }
    }
    const expected = [location(lines.findIndex(line => line.includes("stableMember:"))),
      location(lines.findIndex(line => line.includes("return this.stableMember")))]
    for (const run of report.runs) {
      assert.equal(run.initializeReceipt.status, "RECEIVED")
      assert.equal(run.initializeReceipt.response.id, run.initializeReceipt.request.id)
      const methods = ["textDocument/completion", "textDocument/definition",
        "textDocument/references", "textDocument/completion"]
      const versions = [1, 2, 2, 3]
      if (run.kind === "stress") {
        methods.push("arkts/benchmark/applyMemoryPressure", "textDocument/completion")
        versions.push(null, 4)
      }
      assert.ok(Array.isArray(run.receipts), "retain native responses, not only label/count summaries")
      assert.deepEqual(run.receipts.map(item => item.method), methods)
      assert.deepEqual(run.receipts.map(item => item.documentVersion), versions)
      const query = { textDocument: { uri: pathToFileURL(entry).href }, position: expected[1].range.start }
      assert.deepEqual(run.receipts[0].params, { ...query, context: { triggerKind: 1 } })
      assert.deepEqual(run.receipts[1].params, query)
      assert.deepEqual(run.receipts[2].params, { ...query, context: { includeDeclaration: true } })
      assert.deepEqual(run.receipts[3].params, run.receipts[0].params)
      if (run.kind === "stress") {
        assert.deepEqual(run.receipts[4].params, { level: "level3" })
        assert.deepEqual(run.receipts[5].params, run.receipts[0].params)
      }
      const ids = run.receipts.map(item => item.response.id)
      assert.equal(new Set(ids).size, ids.length)
      assert.ok(run.receipts.every(item => item.response.jsonrpc === "2.0"
        && Number.isSafeInteger(item.response.id) && Object.hasOwn(item.response, "result")
        && !Object.hasOwn(item.response, "error")))
      assert.deepEqual(run.receipts[1].response.result, [expected[0]])
      assert.deepEqual(run.receipts[2].response.result.map(item => JSON.stringify(item)).sort(),
        expected.map(item => JSON.stringify(item)).sort())
      for (const item of run.receipts.filter(item => item.method === "textDocument/completion")) {
        const result = item.response.result
        const items = Array.isArray(result) ? result : result.items
        assert.ok(items.some(item => item.label === "stableMember" && item.data))
      }
      if (run.kind === "stress") assert.equal(run.receipts[4].response.result.applied, "level3")
    }
    assert.equal(report.releasePssComparable, false)
  })

  registerMacosOracleCases()

  test("macOS workflow rejects and retains a real nonzero server exit", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, nonzeroExit: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    assert.ok(fixture.report, "native exit failure must retain the actual session")
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.match(report.failure.message, /WORKFLOW_NATIVE_EXIT/u)
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = report.runs[0]
    assert.equal(run.status, "FAIL")
    assert.deepEqual(run.closeResult.exit, { code: 17, signal: null })
    assert.equal(run.closeResult.shutdown.result, null)
    assert.equal(run.receipts.length, 4)
    assert.equal(run.receipts[2].correctness.equal, true)
    assert.equal(report.unexecutedRuns.length, 17)
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
  test("macOS workflow retains a native rejected pressure response without claiming applied", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, controlOff: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 14, completedRuns: 13, unexecutedRuns: 4 })
    const run = report.runs.at(-1)
    assert.equal(run.kind, "stress")
    assert.equal(run.index, 0)
    assert.equal(run.status, "FAIL")
    const receipt = run.receipts.at(-1)
    assert.equal(receipt.method, "arkts/benchmark/applyMemoryPressure")
    assert.deepEqual(receipt.params, { level: "level3" })
    assert.equal(receipt.response.jsonrpc, "2.0")
    assert.ok(Number.isSafeInteger(receipt.response.id))
    assert.equal(receipt.response.error.code, -32601)
    assert.match(receipt.response.error.message, /arkts\/benchmark\/applyMemoryPressure/u)
    assert.equal(Object.hasOwn(receipt.response, "result"), false)
    assert.equal(run.semantic.level3Observed, false)
    assert.equal(report.memory.postEvictionRssBytes, null,
      "a rejected pressure attempt has no post-pressure resource observation")
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
  test("macOS workflow retains reauditable native RSS and semantic metric curves", async (t) => {
    const { report } = await macosWorkflow(t, { oracle: true })
    if (process.platform !== "darwin") return
    for (const run of report.runs) {
      const { memory, semantic } = run
      assert.ok(Array.isArray(memory.samples), "retain the actual external process observations")
      assert.ok(memory.samples.length > 0)
      assert.equal(memory.sampleCount, memory.samples.length)
      assert.equal(memory.samplingError, null)
      assert.equal(memory.intervalClock, "sampler-monotonic-ms")
      assert.equal(memory.requestedIntervalMs, 250)
      assert.ok(Number.isFinite(memory.timeOrigin) && memory.timeOrigin > 0)
      for (const [index, sample] of memory.samples.entries()) {
        assert.ok(Number.isFinite(sample.timestamp) && sample.timestamp > 0)
        assert.ok(Number.isFinite(sample.monotonicMs) && sample.monotonicMs >= 0)
        if (index) assert.ok(sample.monotonicMs > memory.samples[index - 1].monotonicMs)
        assert.equal(sample.truncated, false)
        assert.equal(sample.processCount, sample.processes.length)
        assert.equal(new Set(sample.processes.map(item => item.pid)).size, sample.processCount)
        const roots = sample.processes.filter(item => item.role === "server")
        assert.equal(roots.length, 1)
        assert.equal(roots[0].pid, run.targetPid)
        for (const process of sample.processes) {
          assert.match(process.startIdentity, /^darwin:/u)
          assert.ok(Number.isSafeInteger(process.rssBytes) && process.rssBytes >= 0)
          assert.ok(Number.isFinite(process.cpuPercent) && process.cpuPercent >= 0)
        }
        assert.equal(sample.totalRssBytes, sample.processes.reduce((sum, item) => sum + item.rssBytes, 0))
      }
      assert.equal(memory.peakProductRssBytes, Math.max(...memory.samples.map(item => item.totalRssBytes)))
      assert.equal(memory.finalProductRssBytes, memory.samples.at(-1).totalRssBytes)
      assert.ok(Array.isArray(semantic.samples) && semantic.samples.length > 0)
      assert.deepEqual(semantic.rawJsonLines.trim().split("\n").map(JSON.parse), semantic.samples)
      assert.equal(semantic.metricsError, null)
      assert.equal(semantic.maxResidentContexts,
        Math.max(...semantic.samples.map(item => item.residentContextCount)))
      for (const metric of semantic.samples) {
        assert.equal(metric.processId, run.targetPid)
        assert.equal(metric.rssScope, "node-process")
        assert.equal(metric.heapScope, "semantic-worker-isolate")
        assert.match(metric.monotonicNs, /^\d+$/u)
        assert.ok(Number.isFinite(metric.epochMs))
        assert.equal(metric.semanticWorkerCount, 1)
        assert.ok(metric.residentContextCount <= 2)
      }
      assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    }
    assert.equal(report.releasePssComparable, false)
  })
  test("macOS workflow retains latest native diagnostics equal to fresh normal controls", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true })
    if (process.platform !== "darwin") return
    const entry = path.join(fixture.workspace, "entry/src/main/ets/Main.ets")
    const uri = pathToFileURL(entry).href
    const completion = fs.readFileSync(entry, "utf8").replace("return this.stableMember", "return this.")
    const expected = new Map()
    for (const run of fixture.report.runs) {
      assert.ok(Array.isArray(run.diagnostics), "retain actual versioned diagnostic notifications")
      const version = run.kind === "stress" ? 4 : 3
      const notification = run.diagnostics.at(-1)
      assert.equal(notification.jsonrpc, "2.0")
      assert.equal(notification.method, "textDocument/publishDiagnostics")
      assert.equal(Object.hasOwn(notification, "id"), false)
      assert.equal(notification.params.uri, uri)
      assert.equal(notification.params.version, version)
      assert.ok(notification.params.diagnostics.length > 0, "the incomplete member access is not clean")
      if (!expected.has(version)) {
        const text = version === 3 ? completion.replace("// benchmark-edit", "// benchmark-edit changed") : completion
        expected.set(version, await freshWorkflowDiagnostics(fixture, version, text))
      }
      assert.deepEqual(notification.params.diagnostics, expected.get(version).params.diagnostics)
    }
    assert.equal(expected.size, 2)
    assert.equal(fixture.report.releasePssComparable, false)
  })
  test("macOS post-run metric rejection retains real results diagnostics exit and remaining work", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, metricsMissing: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    const originals = fs.readFileSync(path.join(path.dirname(fixture.workspace), "faulted-metrics.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.ok(originals.some(sample => sample.semanticWorkerCount === 1), "the probe moved real produced metrics")
    assert.ok(fixture.report, "post-run resource rejection must retain actual completed work")
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.match(report.failure.message, /semantic worker metrics omitted the single-worker invariant/u)
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = report.runs[0]
    assert.equal(run.status, "FAIL")
    assert.equal(run.receipts.length, 4)
    assert.equal(run.receipts[2].correctness.equal, true)
    assert.equal(run.diagnostics.at(-1).params.version, 3)
    assert.ok(run.memory.samples.length > 0)
    assert.deepEqual(run.semantic.samples, [])
    assert.equal(run.semantic.maxResidentContexts, null)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
  test("macOS malformed metric bytes reject without discarding actual work or the invalid input", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, metricsMalformed: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    assert.ok(fs.readFileSync(path.join(path.dirname(fixture.workspace), "faulted-metrics.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse).some(sample => sample.semanticWorkerCount === 1))
    assert.ok(fixture.report, "malformed metric input must keep a failed execution record")
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = report.runs[0]
    assert.equal(run.status, "FAIL")
    assert.equal(run.semantic.rawJsonLines, "{\"invalid\":\n")
    assert.equal(run.semantic.metricsError.name, "SyntaxError")
    assert.equal(run.semantic.metricsError.message, report.failure.message)
    assert.deepEqual(run.semantic.samples, [])
    assert.equal(run.receipts.length, 4)
    assert.equal(run.diagnostics.at(-1).params.version, 3)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
  test("macOS interrupted request retains its actual sent frame not an unexecuted query", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, interruptedRequest: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    const sent = JSON.parse(fs.readFileSync(path.join(path.dirname(fixture.workspace), "interrupted-request.json")))
    assert.ok(fixture.report, "interrupted request must retain its admitted run")
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = report.runs[0]
    assert.equal(run.targetPid, sent.pid)
    assert.deepEqual(run.closeResult.exit, { code: null, signal: "SIGKILL" })
    assert.equal(run.receipts.length, 1, "the emitted completion is an attempted request")
    const receipt = run.receipts[0]
    assert.equal(receipt.status, "FAILED")
    assert.deepEqual(receipt.request, sent.request)
    assert.equal(receipt.method, "textDocument/completion")
    assert.deepEqual(receipt.params, sent.request.params)
    assert.equal(receipt.documentVersion, 1)
    assert.ok(Number.isFinite(receipt.elapsedMs) && receipt.elapsedMs >= 0)
    assert.equal(Object.hasOwn(receipt, "response"), false)
    assert.equal(receipt.failure.message, report.failure.message)
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
  test("macOS native sampler failure retains partial observations real queries and clean exit", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, samplerFault: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    const fault = JSON.parse(fs.readFileSync(path.join(path.dirname(fixture.workspace), "sampler-fault.json")))
    assert.equal(fault.command, "/bin/ps")
    assert.equal(fault.calls, 3)
    assert.equal(fault.args.at(-1), "--arkts-sampler-fault")
    assert.ok(fixture.report, "native sampler failure must not crash away the execution report")
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = report.runs[0]
    assert.equal(run.targetPid, fault.targetPid)
    assert.equal(run.status, "FAIL")
    assert.ok(run.memory.samples.length > 0, "keep the genuine observations preceding the fault")
    assert.equal(run.memory.samplingError.code, 1)
    assert.match(run.memory.samplingError.cmd, /--arkts-sampler-fault/u)
    assert.ok(run.memory.samplingError.stderr.length > 0)
    assert.equal(report.failure.message, run.memory.samplingError.message)
    assert.equal(run.receipts.length, 4)
    assert.equal(run.receipts[2].correctness.equal, true)
    assert.equal(run.diagnostics.at(-1).params.version, 3)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
  test("macOS genuine original-deadline timeout is retained separately from native process exit", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, requestTimeout: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    const stopped = JSON.parse(fs.readFileSync(path.join(path.dirname(fixture.workspace), "timed-request.json")))
    assert.match(stopped.nativeStoppedState, /T/u)
    assert.ok(fixture.report)
    const report = fixture.report
    assert.equal(report.measurementStatus, "incomplete")
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    const run = report.runs[0]
    assert.equal(run.targetPid, stopped.pid)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
    const receipt = run.receipts[0]
    assert.equal(receipt.status, "TIMEOUT", "an elapsed original deadline is not an abrupt-exit classification")
    assert.deepEqual(receipt.request, stopped.request)
    assert.equal(receipt.timeoutMs, 30_000)
    assert.ok(receipt.elapsedMs >= 29_900, `actual original wait was ${receipt.elapsedMs}ms`)
    assert.match(receipt.failure.message, /^Timed out waiting for LSP response /u)
    assert.equal(Object.hasOwn(receipt, "response"), false)
    assert.equal(report.failure.message, receipt.failure.message)
    assert.ok(run.memory.samples.length > 0)
    assert.equal(run.memory.samplingError, null)
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
  test("macOS invalid native metric schema rejects without losing raw evidence or completed queries", async (t) => {
    for (const metricsSchema of ["null", "rss-negative", "wrong-pid", "missing-scope"]) {
      const fixture = await macosWorkflow(t, { oracle: true, metricsSchema, expectedStatus: 1 })
      if (process.platform !== "darwin") continue
      assert.ok(fixture.report, `${metricsSchema} must retain a failed execution report`)
      const report = fixture.report
      assert.equal(report.measurementStatus, "incomplete")
      assert.match(report.failure.message, /MACOS_METRICS_INVALID_SCHEMA/u)
      assert.deepEqual(report.workflowExecution,
        { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
      const run = report.runs[0]
      const supplied = run.semantic.rawJsonLines.trim().split("\n").map(JSON.parse)
      if (metricsSchema === "null") assert.equal(supplied[0], null)
      if (metricsSchema === "rss-negative") assert.equal(supplied[0].rss, -1)
      if (metricsSchema === "wrong-pid") assert.notEqual(supplied[0].processId, run.targetPid)
      if (metricsSchema === "missing-scope") assert.equal(Object.hasOwn(supplied[0], "rssScope"), false)
      assert.deepEqual(run.semantic.samples, [])
      assert.equal(run.receipts.length, 4)
      assert.equal(run.receipts[2].correctness.equal, true)
      assert.equal(run.diagnostics.at(-1).params.version, 3)
      assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
      assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
    }
  })
  test("macOS interrupted initialization preserves its real frame and does not invent measurements", async (t) => {
    const fixture = await macosWorkflow(t, { oracle: true, interruptedInitialize: true, expectedStatus: 1 })
    if (process.platform !== "darwin") return
    const sent = JSON.parse(fs.readFileSync(path.join(path.dirname(fixture.workspace), "interrupted-request.json")))
    assert.ok(fixture.report)
    const report = fixture.report, run = report.runs[0]
    assert.equal(report.measurementStatus, "incomplete")
    assert.deepEqual(report.workflowExecution,
      { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
    assert.equal(run.targetPid, sent.pid)
    assert.deepEqual(run.closeResult.exit, { code: null, signal: "SIGKILL" })
    assert.deepEqual(run.initializeReceipt.request, sent.request)
    assert.equal(run.initializeReceipt.status, "FAILED")
    assert.equal(run.initializeReceipt.timeoutMs, 30_000)
    assert.equal(Object.hasOwn(run.initializeReceipt, "response"), false)
    assert.equal(run.initializeReceipt.failure.message, report.failure.message)
    assert.deepEqual(run.receipts, [])
    assert.deepEqual(run.diagnostics, [])
    if (run.memory.sampleCount === 0) {
      assert.equal(run.memory.peakProductRssBytes, null)
      assert.equal(report.memory.peakRssBytes, null)
    }
    assert.doesNotMatch(fixture.result.stdout, /MACOS_E2E=PASS/u)
  })
}
