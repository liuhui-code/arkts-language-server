import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { evaluate, writeArtifact } from "./support/product-memory-fixture.mjs"
import { pssSamplingFixture, refreshSampling } from "./support/product-pss-sampling-fixture.mjs"

test("L08 keeps single-point and clipped head or tail windows unverified", t => {
  for (const mode of ["single", "head", "tail"]) {
    const { fixture, raw } = pssSamplingFixture(t)
    const run = raw.workflow.runs[0], samples = raw.samples.filter(sample => sample.runId === run.id)
    const retained = mode === "single" ? [samples[0]] : mode === "head" ? samples.slice(1) : samples.slice(0, 2)
    if (mode !== "single") {
      const sample = mode === "head" ? retained[0] : retained[1]
      const tick = run.startedMonotonicMs + (mode === "head" ? 61 : 21)
      Object.assign(sample, { monotonicMs: tick, completedMonotonicMs: tick + 1,
        timestamp: 100000 + tick, completedTimestamp: 100001 + tick })
    }
    raw.samples = raw.samples.filter(sample => sample.runId !== run.id).concat(retained)
      .sort((left, right) => left.monotonicMs - right.monotonicMs)
    const { receipt, report } = consume(refreshSampling(fixture, raw))
    assert.equal(receipt.rawObservation.workflowBinding.status, "PASS", mode)
    assert.equal(receipt.rawObservation.samplingBinding.status, "NOT_VERIFIED", mode)
    assert.deepEqual(receipt.rawObservation.samplingBinding.incompleteRuns, [run.id], mode)
    assert.equal(receipt.status, "BLOCKED", mode)
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_SAMPLING_BINDING_INCOMPLETE"], mode)
    assert.equal(report.releaseEligible, false, mode)
  }
})

test("L08 requires cadence rows for each product topology and run kind", t => {
  const template = pssSamplingFixture(t)
  const targets = template.raw.workflow.runs.filter(run => run.index === template.workflow.runs[run.kind] - 1)
  assert.equal(targets.length, 42)
  for (const target of targets) {
    const { fixture, raw } = pssSamplingFixture(t)
    raw.sampling.perRun = raw.sampling.perRun.filter(row => row.runId !== target.id)
    writeRaw(fixture, raw)
    const { receipt, report } = consume(fixture)
    assert.equal(receipt.rawObservation.samplingBinding.status, "NOT_VERIFIED")
    assert.deepEqual(receipt.rawObservation.samplingBinding.missingRuns, [target.id])
    assert.equal(receipt.status, "BLOCKED")
    assert.equal(report.cells.find(cell => cell.requests).requests, 20)
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 rejects contradicted cadence edges counts read duration and percentile summaries", t => {
  for (const field of ["sampleCount", "firstMonotonicMs", "lastCompletedMonotonicMs", "headGapMs",
    "tailGapMs", "maximumReadDurationMs", "p50", "p95", "max"]) {
    const { fixture, raw } = pssSamplingFixture(t)
    const row = raw.sampling.perRun[0]
    if (["p50", "p95", "max"].includes(field)) row.actualIntervalMs[field] += 1
    else row[field] += 1
    const { receipt, report } = consume(writeRaw(fixture, raw))
    assert.equal(receipt.rawObservation.status, "PASS", field)
    assert.equal(receipt.rawObservation.samplingBinding.status, "FAIL", field)
    assert.equal(receipt.status, "FAIL", field)
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_SAMPLING_BINDING_INVALID"], field)
    assert.equal(report.releaseEligible, false, field)
  }
})

test("L08 retains real sampler failure and rejects malformed duplicate or foreign cadence declarations", t => {
  for (const [name, mutate] of [
    ["native-read-error", raw => { raw.sampling.error = { code: 3, message: "smaps_rollup unavailable" } }],
    ["wrong-version", raw => { raw.sampling.schemaVersion = 2 }],
    ["zero-interval", raw => { raw.sampling.requestedIntervalMs = 0 }],
    ["string-interval", raw => { raw.sampling.requestedIntervalMs = "50" }],
    ["unsafe-interval", raw => { raw.sampling.requestedIntervalMs = Number.MAX_SAFE_INTEGER + 1 }],
    ["missing-error-proof", raw => { delete raw.sampling.error }],
    ["missing-rows", raw => { delete raw.sampling.perRun }],
    ["duplicate-row", raw => { raw.sampling.perRun.push(structuredClone(raw.sampling.perRun[0])) }],
    ["foreign-row", raw => { raw.sampling.perRun[0].runId = "not-a-workflow-run" }],
  ]) {
    const { fixture, raw } = pssSamplingFixture(t)
    mutate(raw)
    const { receipt, report } = consume(writeRaw(fixture, raw))
    assert.equal(receipt.rawObservation.status, "PASS", name)
    assert.equal(receipt.rawObservation.samplingBinding.status, "FAIL", name)
    assert.equal(receipt.status, "FAIL", name)
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_SAMPLING_BINDING_INVALID"], name)
    if (name === "native-read-error") {
      assert.deepEqual(receipt.rawObservation.samplingBinding.samplingError, raw.sampling.error)
    }
    assert.equal(report.cells.find(cell => cell.requests).requests, 20, name)
    assert.equal(report.releaseEligible, false, name)
  }
})

test("L08 exposes internal gaps longer than the request without inventing continuous peak coverage", t => {
  const { fixture, raw } = pssSamplingFixture(t)
  const run = raw.workflow.runs[0]
  raw.samples = raw.samples.filter(sample => sample.runId !== run.id
    || sample.monotonicMs !== run.startedMonotonicMs + 41)
  const { receipt, report } = consume(refreshSampling(fixture, raw))
  const binding = receipt.rawObservation.samplingBinding
  assert.equal(binding.status, "PASS", "declared window edges still bind")
  assert.deepEqual(binding.runs[0].actualIntervalMs, { p50: 80, p95: 80, max: 80 })
  assert.equal(binding.requestedIntervalMs, 50)
  assert.deepEqual(binding.gapsExceedRequest, [run.id])
  assert.equal(binding.continuousPeakCoverage, "NOT_VERIFIED")
  assert.equal(receipt.rawObservation.productCoverage, "NOT_VERIFIED")
  assert.equal(receipt.status, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

test("L08 cannot attach sampling cadence to an absent workflow proof", t => {
  const { fixture, raw } = pssSamplingFixture(t)
  delete raw.workflow
  const { receipt, report } = consume(writeRaw(fixture, raw))
  assert.equal(receipt.status, "BLOCKED")
  assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_SAMPLING_WORKFLOW_NOT_BOUND"])
  assert.equal(report.releaseEligible, false)
})

function writeRaw(fixture, raw) {
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  return fixture
}

function consume(fixture) {
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  return { report, receipt: report.productMemoryComparisonEvidence.receipts[0] }
}
