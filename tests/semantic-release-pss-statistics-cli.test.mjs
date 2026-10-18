import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { evaluate, nativePssFixture, writeArtifact } from "./support/product-memory-fixture.mjs"

test("L08 uses fixed medians maxima and the first observation rather than interchangeable reducers", t => {
  const { fixture, raw } = statisticsFixture(t)
  appendSample(raw, "server", "steadyPssBytes", 400)
  appendSample(raw, "server", "steadyPssBytes", 601)
  appendSample(raw, "server", "peakPssBytes", 799)
  appendSample(raw, "server", "initialWarmPssBytes", 700)
  appendSample(raw, "deveco", "steadyPssBytes", 400)
  appendSample(raw, "deveco", "steadyPssBytes", 1001)
  const { report, result } = evaluate(writeRaw(fixture, raw))
  assert.equal(result.status, 1, result.stderr)
  const receipt = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(receipt.rawObservation.summaryBinding, "PASS")
  assert.deepEqual(receipt.rawObservation.summaryValues,
    { server: fixture.server.memory, deveco: fixture.deveco.memory })
  assert.equal(receipt.status, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

test("L08 calculates the even median instead of choosing one endpoint", t => {
  const { fixture, raw } = statisticsFixture(t)
  appendSample(raw, "server", "steadyPssBytes", 400)
  fixture.server.memory.steadyPssBytes = 500 * 1024
  fixture.comparison.server = writeArtifact(fixture.root, "server.json", fixture.server)
  const { report, result } = evaluate(writeRaw(fixture, raw))
  assert.equal(result.status, 1, result.stderr)
  const receipt = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(receipt.rawObservation.summaryBinding, "PASS")
  assert.equal(receipt.rawObservation.summaryValues.server.steadyPssBytes, 500 * 1024)
  assert.equal(receipt.status, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects each contradictory bound metric despite passing the original ratios", t => {
  for (const product of ["server", "deveco"]) {
    for (const metric of Object.keys(nativePssFixture(t).fixture[product].memory)) {
      const { fixture, raw } = statisticsFixture(t)
      fixture[product].memory[metric] -= 1
      fixture.comparison[product] = writeArtifact(fixture.root, `${product}.json`, fixture[product])
      const { report, result } = evaluate(writeRaw(fixture, raw))
      assert.equal(result.status, 1, `${product}.${metric}: ${result.stderr}`)
      const receipt = report.productMemoryComparisonEvidence.receipts[0]
      assert.equal(receipt.summary.status, "PASS")
      assert.equal(receipt.rawObservation.status, "PASS")
      assert.equal(receipt.status, "FAIL")
      assert.deepEqual(receipt.reasons, [metric === "peakPssBytes"
        ? "PRODUCT_MEMORY_RAW_PEAK_EXCEEDS_SUMMARY" : "PRODUCT_MEMORY_RAW_SUMMARY_MISMATCH"])
      assert.equal(report.cells.find(cell => cell.requests).requests, 20)
      assert.equal(report.releaseEligible, false)
    }
  }
})

test("L08 leaves a missing metric unbound instead of silently qualifying the other summaries", t => {
  for (const missing of nativePssFixture(t).raw.samples.map(sample => `${sample.product}.${sample.metric}`)) {
    const { fixture, raw } = statisticsFixture(t)
    raw.samples = raw.samples.filter(sample => `${sample.product}.${sample.metric}` !== missing)
    const { report, result } = evaluate(writeRaw(fixture, raw))
    assert.equal(result.status, 1, `${missing}: ${result.stderr}`)
    const receipt = report.productMemoryComparisonEvidence.receipts[0]
    assert.equal(receipt.rawObservation.status, "PASS")
    assert.equal(receipt.rawObservation.summaryBinding, "NOT_VERIFIED")
    assert.deepEqual(receipt.rawObservation.missingSummaryMetrics, [missing])
    assert.equal(receipt.status, "BLOCKED")
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_STATISTICS_SAMPLES_INCOMPLETE"])
    assert.equal(report.cells.find(cell => cell.requests).requests, 20)
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 refuses unknown malformed or extended statistics recipes", t => {
  for (const statistics of [null, false, [], {}, { schemaVersion: 0, recipe: "product-pss-summary-v1" },
    { schemaVersion: 1, recipe: "mean" }, { schemaVersion: 1, recipe: "product-pss-summary-v1", allowMissing: true }]) {
    const { fixture, raw } = statisticsFixture(t)
    raw.statistics = statistics
    const { report, result } = evaluate(writeRaw(fixture, raw))
    assert.equal(result.status, 1, result.stderr)
    const receipt = report.productMemoryComparisonEvidence.receipts[0]
    assert.equal(receipt.rawObservation.status, "PASS")
    assert.equal(receipt.rawObservation.summaryBinding, "FAIL")
    assert.equal(receipt.status, "FAIL")
    assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_STATISTICS_RECIPE_INVALID"])
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 rejects unsafe intermediate median arithmetic instead of rounding a certification", t => {
  const { fixture, raw } = statisticsFixture(t)
  raw.samples = raw.samples.filter(sample => sample.metric !== "steadyPssBytes" || sample.product !== "server")
  appendSample(raw, "server", "steadyPssBytes", 2 ** 42)
  appendSample(raw, "server", "steadyPssBytes", 2 ** 42)
  const { report, result } = evaluate(writeRaw(fixture, raw))
  assert.equal(result.status, 1, result.stderr)
  const receipt = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(receipt.rawObservation.status, "PASS")
  assert.equal(receipt.rawObservation.summaryBinding, "FAIL")
  assert.deepEqual(receipt.reasons, ["PRODUCT_MEMORY_STATISTICS_ARITHMETIC_UNSAFE"])
  assert.equal(receipt.status, "FAIL")
  assert.equal(report.releaseEligible, false)
})

function statisticsFixture(t) {
  const fixture = nativePssFixture(t)
  fixture.raw.statistics = { schemaVersion: 1, recipe: "product-pss-summary-v1" }
  return fixture
}

function writeRaw(fixture, raw) {
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  return fixture
}

function appendSample(raw, product, metric, totalKiB) {
  const sample = structuredClone(raw.samples.find(sample => sample.product === product))
  const last = raw.samples.at(-1)
  Object.assign(sample, { metric, timestamp: last.timestamp + 10, completedTimestamp: last.completedTimestamp + 10,
    monotonicMs: last.monotonicMs + 10, completedMonotonicMs: last.completedMonotonicMs + 10,
    totalPssBytes: totalKiB * 1024 })
  for (const [index, process] of sample.processes.entries()) {
    const pssKiB = Math.floor(totalKiB / sample.processes.length)
      + (index === sample.processes.length - 1 ? totalKiB % sample.processes.length : 0)
    process.pssBytes = process.rssBytes = pssKiB * 1024
    process.procStatus = `Name:\tnode\nVmRSS:\t${pssKiB} kB\n`
    process.smapsRollup = `Pss: ${pssKiB} kB\n`
  }
  raw.samples.push(sample)
}
