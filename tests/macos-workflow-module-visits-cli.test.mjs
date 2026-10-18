import assert from "node:assert/strict"
import test from "node:test"
import { macosWorkflow } from "./support/macos-workflow-fixture.mjs"

test("the real product workflow retains every actual stress module open and close notification", async t => {
  const { report } = await macosWorkflow(t, { oracle: true, completionOracle: true })
  if (process.platform !== "darwin") return
  const stress = report.runs.filter(run => run.kind === "stress")
  assert.equal(stress.length, 5)
  for (const run of report.runs) {
    assert.equal(run.moduleVisits.length, run.kind === "stress" ? 20 : 0)
    const uris = new Set()
    for (const [index, visit] of run.moduleVisits.entries()) {
      const identity = String(index).padStart(6, "0")
      assert.equal(visit.open.jsonrpc, "2.0")
      assert.equal(visit.open.method, "textDocument/didOpen")
      assert.equal(visit.close.jsonrpc, "2.0")
      assert.equal(visit.close.method, "textDocument/didClose")
      assert.equal(visit.open.params.textDocument.uri, visit.close.params.textDocument.uri)
      assert.ok(visit.open.params.textDocument.uri.endsWith(`/Active${identity}.ets`))
      assert.equal(visit.open.params.textDocument.version, 1)
      assert.ok(visit.open.params.textDocument.text.includes(`class Visit${identity}`))
      assert.ok(visit.open.params.textDocument.text.includes(`Active${identity}`))
      assert.equal(visit.status, "SENT")
      assert.ok(Number.isFinite(visit.startedMonotonicMs) && visit.startedMonotonicMs >= 0)
      assert.ok(visit.completedMonotonicMs >= visit.startedMonotonicMs)
      uris.add(visit.open.params.textDocument.uri)
    }
    assert.equal(uris.size, run.moduleVisits.length)
    assert.deepEqual(run.closeResult.exit, { code: 0, signal: null })
  }
  assert.equal(report.measurementStatus, "complete")
  assert.equal(report.releasePssComparable, false)
})

test("an unexpected native workflow failure survives fixture cleanup in the test diagnostic log", async t => {
  const diagnostics = []
  let failure
  try {
    await macosWorkflow({ after: callback => t.after(callback), diagnostic: value => diagnostics.push(value) },
      { oracle: true, nonzeroExit: true })
  } catch (error) { failure = error }
  if (process.platform !== "darwin") {
    assert.equal(failure, undefined)
    return
  }
  assert.equal(failure?.code, "ERR_ASSERTION")
  assert.equal(failure.actual, 1)
  assert.equal(failure.expected, 0)
  assert.equal(diagnostics.length, 1, "preserve the original report before temporary fixture cleanup")
  const retained = JSON.parse(diagnostics[0])
  assert.equal(retained.event, "macos.workflow.unexpected-exit")
  assert.equal(retained.exitCode, 1)
  assert.equal(retained.signal, null)
  const report = JSON.parse(retained.reportText)
  assert.equal(report.measurementStatus, "incomplete")
  assert.match(report.failure.message, /WORKFLOW_NATIVE_EXIT/u)
  assert.deepEqual(report.runs[0].closeResult.exit, { code: 17, signal: null })
  assert.equal(report.runs[0].receipts.length, 4)
  assert.equal(report.runs[0].receipts[2].correctness.equal, true)
  assert.equal(typeof report.runs[0].runtime.rawJsonLines, "string")
  assert.deepEqual(report.workflowExecution,
    { plannedRuns: 18, attemptedRuns: 1, completedRuns: 0, unexecutedRuns: 17 })
})

test("unexpected workflow preflight rejection retains a null report instead of invented execution", async t => {
  const diagnostics = []
  let failure
  try {
    await macosWorkflow({ after: callback => t.after(callback), diagnostic: value => diagnostics.push(value) },
      { startAt: "warm:1" })
  } catch (error) { failure = error }
  if (process.platform !== "darwin") {
    assert.equal(failure, undefined)
    return
  }
  assert.equal(failure?.actual, 1)
  assert.equal(failure.expected, 0)
  assert.equal(diagnostics.length, 1)
  assert.deepEqual(JSON.parse(diagnostics[0]), { event: "macos.workflow.unexpected-exit",
    exitCode: 1, signal: null, reportText: null })
})

test("an expected native workflow failure remains available without an unexpected-exit diagnostic", async t => {
  const diagnostics = []
  const { report } = await macosWorkflow({ after: callback => t.after(callback),
    diagnostic: value => diagnostics.push(value) }, { oracle: true, nonzeroExit: true, expectedStatus: 1 })
  assert.deepEqual(diagnostics, [])
  if (process.platform !== "darwin") return
  assert.match(report.failure.message, /WORKFLOW_NATIVE_EXIT/u)
  assert.deepEqual(report.runs[0].closeResult.exit, { code: 17, signal: null })
})
