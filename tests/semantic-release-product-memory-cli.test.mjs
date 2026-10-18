import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { evaluate, memoryFixture, nativePssFixture, writeArtifact } from "./support/product-memory-fixture.mjs"
import { pssWorkflowFixture } from "./support/product-pss-workflow-fixture.mjs"
import { pssSamplingFixture } from "./support/product-pss-sampling-fixture.mjs"

const sha = bytes => createHash("sha256").update(bytes).digest("hex")

test("L08 consumes passing original memory summaries without certifying missing native PSS", t => {
  const fixture = memoryFixture(t)
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.independentEnvironmentGates["deveco-pss-comparison"], "BLOCKED")
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.summary.status, "PASS", "all original numeric and workflow gates pass")
  assert.equal(comparison.status, "BLOCKED")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_RAW_NOT_PROVIDED"))
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 cannot borrow otherwise passing memory summaries measured with another SDK", t => {
  const fixture = memoryFixture(t)
  fixture.server.comparisonIdentity.sdkDeclarationDigest = "b".repeat(64)
  fixture.deveco.comparisonIdentity.sdkDeclarationDigest = "b".repeat(64)
  fixture.comparison.server = writeArtifact(fixture.root, "server.json", fixture.server)
  fixture.comparison.deveco = writeArtifact(fixture.root, "deveco.json", fixture.deveco)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.summary.status, "PASS")
  assert.equal(comparison.status, "FAIL")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_SDK_MISMATCH"))
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.status, "FAIL")
})

test("L08 blocks memory comparison metadata for a different product build", t => {
  const fixture = memoryFixture(t)
  fixture.comparison.buildIdentity.serverInputSha256 = "f".repeat(64)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.summary.status, "PASS")
  assert.equal(comparison.status, "BLOCKED")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_BUILD_MISMATCH"))
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 cannot use a larger-budget memory comparison for the selected query configuration", t => {
  const fixture = memoryFixture(t)
  fixture.comparison.flags.ARKTS_MEMORY_BUDGET_MB = "2048"
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.summary.status, "PASS")
  assert.equal(comparison.status, "BLOCKED")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_CONFIGURATION_MISMATCH"))
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 preserves verified query rows when the supplied memory comparison is missing", t => {
  const fixture = memoryFixture(t)
  fs.unlinkSync(fixture.comparisonPath)
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.independentEnvironmentGates["deveco-pss-comparison"], "FAIL")
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.sha256, null, "missing bytes have no invented digest")
  assert.equal(comparison.status, "FAIL")
  assert.match(comparison.error, /ENOENT/u)
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.status, "FAIL")
})

test("L08 rereads complete native PSS records without promoting unverified product scope", t => {
  const { fixture } = nativePssFixture(t)
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.rawObservation.status, "PASS", "native record integrity, not product qualification")
  assert.equal(comparison.rawObservation.sampleCount, 8)
  assert.deepEqual(comparison.rawObservation.metricSamples["server.steadyPssBytes"], [600 * 1024])
  assert.equal(comparison.rawObservation.artifact.sha256, fixture.comparison.rawEvidence.sha256)
  assert.equal(comparison.status, "BLOCKED")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_RAW_SCOPE_NOT_VERIFIED"))
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects a claimed product peak below its declared raw peak observations", t => {
  for (const product of ["server", "deveco"]) {
    const { fixture } = nativePssFixture(t)
    fixture[product].memory.peakPssBytes -= 1
    fixture.comparison[product] = writeArtifact(fixture.root, `${product}.json`, fixture[product])
    fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, `${product}: ${result.stderr}`)
    const comparison = report.productMemoryComparisonEvidence.receipts[0]
    assert.equal(comparison.summary.status, "PASS", "original numeric thresholds alone still pass")
    assert.equal(comparison.rawObservation.status, "PASS", "raw record values remain internally consistent")
    assert.equal(comparison.status, "FAIL", product)
    assert.deepEqual(comparison.reasons, ["PRODUCT_MEMORY_RAW_PEAK_EXCEEDS_SUMMARY"], product)
    assert.equal(report.cells.find(cell => cell.requests).requests, 20, product)
    assert.equal(report.status, "FAIL", product)
    assert.equal(report.releaseEligible, false, product)
  }
})

test("L08 checks later declared peak samples and does not certify an unobserved higher summary", t => {
  for (const laterPeak of [false, true]) {
    const { fixture, raw } = nativePssFixture(t)
    if (laterPeak) {
      const sample = structuredClone(raw.samples.find(sample =>
        sample.product === "server" && sample.metric === "peakPssBytes"))
      sample.timestamp = 2000
      sample.completedTimestamp = 2003
      sample.monotonicMs = 200
      sample.completedMonotonicMs = 203
      sample.totalPssBytes += 1024
      sample.processes[0].pssBytes += 1024
      sample.processes[0].smapsRollup = `Pss: ${sample.processes[0].pssBytes / 1024} kB\n`
      raw.samples.push(sample)
      fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
    } else {
      fixture.server.memory.peakPssBytes += 1
      fixture.comparison.server = writeArtifact(fixture.root, "server.json", fixture.server)
    }
    fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, result.stderr)
    const comparison = report.productMemoryComparisonEvidence.receipts[0]
    assert.equal(comparison.summary.status, "PASS")
    assert.equal(comparison.rawObservation.status, "PASS")
    assert.equal(comparison.rawObservation.sampleCount, laterPeak ? 9 : 8)
    assert.equal(comparison.status, laterPeak ? "FAIL" : "BLOCKED")
    assert.deepEqual(comparison.reasons, [laterPeak
      ? "PRODUCT_MEMORY_RAW_PEAK_EXCEEDS_SUMMARY" : "PRODUCT_MEMORY_RAW_SCOPE_NOT_VERIFIED"])
    assert.equal(report.cells.find(cell => cell.requests).requests, 20)
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 binds every memory summary to an explicit fixed raw PSS statistics recipe without certifying scope", t => {
  const { fixture, raw } = nativePssFixture(t)
  raw.statistics = { schemaVersion: 1, recipe: "product-pss-summary-v1" }
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.rawObservation.summaryBinding, "PASS")
  assert.deepEqual(comparison.rawObservation.summaryValues,
    { server: fixture.server.memory, deveco: fixture.deveco.memory })
  assert.equal(comparison.rawObservation.productCoverage, "NOT_VERIFIED")
  assert.equal(comparison.status, "BLOCKED")
  assert.deepEqual(comparison.reasons, ["PRODUCT_MEMORY_RAW_SCOPE_NOT_VERIFIED"])
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 binds all original topology run slots and their native record owners without promoting execution", t => {
  const { fixture, raw } = pssWorkflowFixture(t)
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.rawObservation.summaryBinding, "PASS")
  const binding = comparison.rawObservation.workflowBinding
  assert.equal(binding.status, "PASS")
  assert.equal(binding.topologies, 7)
  assert.equal(binding.runs, 252)
  assert.equal(binding.boundSamples, raw.samples.length)
  assert.equal(comparison.rawObservation.productCoverage, "NOT_VERIFIED")
  assert.equal(comparison.status, "BLOCKED")
  assert.deepEqual(comparison.reasons, ["PRODUCT_MEMORY_RAW_SCOPE_NOT_VERIFIED"])
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects a rehashed manifest that replaces native numeric topology fields with strings", t => {
  const { fixture, raw } = pssWorkflowFixture(t)
  const original = raw.workflow.manifests[0]
  const manifest = JSON.parse(fs.readFileSync(path.join(fixture.root, original.file)))
  manifest.workspaceFiles = String(manifest.workspaceFiles)
  const replacement = writeArtifact(fixture.root, original.file, manifest)
  raw.workflow.manifests[0] = replacement
  for (const run of raw.workflow.runs) if (run.manifestSha256 === original.sha256) {
    run.manifestSha256 = replacement.sha256
  }
  fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.rawObservation.status, "PASS")
  assert.equal(comparison.status, "FAIL")
  assert.deepEqual(comparison.reasons, ["PRODUCT_MEMORY_WORKFLOW_BINDING_INVALID"])
  assert.equal(report.releaseEligible, false)
})

test("L08 recomputes each original run sampling span and actual cadence without certifying continuous peaks", t => {
  const { fixture } = pssSamplingFixture(t)
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  const sampling = comparison.rawObservation.samplingBinding
  assert.equal(sampling.status, "PASS")
  assert.equal(sampling.runs.length, 252)
  assert.equal(sampling.requestedIntervalMs, 50)
  assert.deepEqual(sampling.runs[0].actualIntervalMs, { p50: 40, p95: 40, max: 40 })
  assert.equal(sampling.runs[0].headGapMs, 1)
  assert.equal(sampling.runs[0].tailGapMs, 8)
  assert.equal(sampling.runs[0].maximumReadDurationMs, 1)
  assert.equal(sampling.continuousPeakCoverage, "NOT_VERIFIED")
  assert.equal(comparison.rawObservation.productCoverage, "NOT_VERIFIED")
  assert.equal(comparison.status, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

test("L08 preserves query rows while rejecting corrupted kernel values and process accounting", t => {
  for (const [name, mutate] of [
    ["rss-not-pss", raw => { raw.measurementKind = "linux-rss" }],
    ["wrong-platform", raw => { raw.platform = "darwin" }],
    ["duplicate-pid", raw => {
      raw.samples[0].processes.push({ ...raw.samples[0].processes[0] })
    }],
    ["excluded-build", raw => { raw.samples[0].processes[0].role = "build" }],
    ["missing-zed", raw => { raw.samples[0].processes.shift() }],
    ["kernel-value", raw => { raw.samples[0].processes[0].pssBytes++ }],
    ["tree-total", raw => { raw.samples[0].totalPssBytes++ }],
    ["duplicate-pss", raw => { raw.samples[0].processes[0].smapsRollup += "Pss: 1 kB\n" }],
    ["missing-rss", raw => { raw.samples[0].processes[0].procStatus = "Name:\tnode\n" }],
    ["unsafe-pss", raw => { raw.samples[0].processes[0].smapsRollup = "Pss: 9007199254740991 kB\n" }],
    ["identity-retarget", raw => { raw.samples[1].processes[0].role = "arkts-language-server" }],
    ["missing-read-end", raw => { delete raw.samples[0].completedMonotonicMs }],
    ["reversed-read-duration", raw => { raw.samples[0].completedMonotonicMs = 99 }],
    ["reversed-sample-clock", raw => { raw.samples[1].monotonicMs = 99 }],
    ["null-sample", raw => { raw.samples[0] = null }],
  ]) {
    const { fixture, raw } = nativePssFixture(t)
    mutate(raw)
    fixture.comparison.rawEvidence = writeArtifact(fixture.root, "native-pss.json", raw)
    fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, `${name}: ${result.stderr}`)
    const comparison = report.productMemoryComparisonEvidence.receipts[0]
    assert.equal(comparison.status, "FAIL", name)
    assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_RAW_INVALID"), name)
    assert.equal(report.cells.find(cell => cell.requests).requests, 20, name)
    assert.equal(report.releaseEligible, false, name)
  }
})

test("L08 retains every original numeric workflow and comparison identity rejection", t => {
  for (const [name, mutate] of [
    ["steady-ratio", f => { f.server.memory.steadyPssBytes = 751 }],
    ["peak-ratio", f => { f.server.memory.peakPssBytes = 851 }],
    ["scaling-ratio", f => { f.server.memory.pss100kBytes = 626 }],
    ["eviction-ratio", f => { f.server.memory.postEvictionPssBytes = 601 }],
    ["warm-regression", f => { f.server.latency.warmP95Ms = 23 }],
    ["semantic-failure", f => { f.server.correctness.contractFailures = 1 }],
    ["zero-denominator", f => { f.deveco.memory.steadyPssBytes = 0 }],
    ["incomplete-workflow", f => { f.server.workflowRuns.warm = 9 }],
    ["mismatched-comparison", f => { f.deveco.comparisonIdentity = {
      ...f.deveco.comparisonIdentity, workspaceManifestDigest: "f".repeat(64) } }],
  ]) {
    const fixture = memoryFixture(t)
    mutate(fixture)
    fixture.comparison.server = writeArtifact(fixture.root, "server.json", fixture.server)
    fixture.comparison.deveco = writeArtifact(fixture.root, "deveco.json", fixture.deveco)
    fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, `${name}: ${result.stderr}`)
    assert.equal(report.productMemoryComparisonEvidence.receipts[0].status, "FAIL", name)
    assert.equal(report.cells.find(cell => cell.requests).requests, 20, name)
    assert.equal(report.status, "FAIL", name)
    assert.equal(report.releaseEligible, false, name)
  }
})

test("L08 explicitly blocks non-Linux comparisons instead of treating their fields as release PSS", t => {
  const fixture = memoryFixture(t)
  fixture.comparison.platform = "darwin"
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.summary.status, "PASS")
  assert.equal(comparison.status, "BLOCKED")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_PLATFORM_UNSUPPORTED"))
  assert.equal(report.releaseEligible, false)
})

for (const flag of ["ARKTS_REFERENCES_TRACE", "ARKTS_SEMANTIC_QUEUE_TRACE"]) {
test(`L08 never qualifies a trace-only memory comparison as normal product evidence (${flag})`, t => {
  const fixture = memoryFixture(t)
  const prepared = JSON.parse(fs.readFileSync(fixture.preparedPath))
  prepared.environment.traceMode = flag === "ARKTS_REFERENCES_TRACE" ? "attribution-only" : "trace-off"
  prepared.environment.effectiveArktsFlags[flag] = "1"
  fixture.comparison.flags[flag] = "1"
  fs.writeFileSync(fixture.preparedPath, JSON.stringify(prepared))
  fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.summary.status, "PASS")
  assert.equal(comparison.status, "BLOCKED")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_ATTRIBUTION_ONLY"))
  assert.equal(report.cells.find(cell => cell.requests).attributionRequests, 20)
  assert.equal(report.releaseEligible, false)
})
}

test("L08 reports a missing Linux query build instead of implicitly matching an empty set", t => {
  const fixture = memoryFixture(t)
  const prepared = JSON.parse(fs.readFileSync(fixture.preparedPath))
  prepared.environment.platform = "Darwin 25.6.0 x64"
  fs.writeFileSync(fixture.preparedPath, JSON.stringify(prepared))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  const comparison = report.productMemoryComparisonEvidence.receipts[0]
  assert.equal(comparison.summary.status, "PASS")
  assert.equal(comparison.status, "BLOCKED")
  assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_QUERY_BUILD_MISSING"))
  assert.equal(report.releaseEligible, false)
})

test("L08 does not qualify mutually matching measurements that change the selected budget or defaults", t => {
  for (const [flag, value] of [
    ["ARKTS_MEMORY_BUDGET_MB", "2048"], ["ARKTS_REFERENCES_RESIDENT_FAST_PATH", "0"],
    ["ARKTS_REFERENCES_CONTEXT_RETENTION", "dispose"], ["ARKTS_REFERENCES_SDK_AMBIENT_PROFILE", "common"],
  ]) {
    const fixture = memoryFixture(t)
    const prepared = JSON.parse(fs.readFileSync(fixture.preparedPath))
    prepared.environment.effectiveArktsFlags[flag] = value
    fixture.comparison.flags[flag] = value
    fs.writeFileSync(fixture.preparedPath, JSON.stringify(prepared))
    fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, result.stderr)
    const comparison = report.productMemoryComparisonEvidence.receipts[0]
    assert.equal(comparison.status, "BLOCKED", flag)
    assert.ok(comparison.reasons.includes("PRODUCT_MEMORY_POLICY_NOT_SELECTED"), flag)
    assert.equal(report.cells.find(cell => cell.requests).requests, 20)
    assert.equal(report.releaseEligible, false)
  }
})

test("L08 reaudits original summary files and retains failures without losing query evidence", t => {
  for (const [name, mutate] of [
    ["missing-file", f => { fs.unlinkSync(path.join(f.root, "server.json")) }],
    ["changed-bytes", f => { fs.appendFileSync(path.join(f.root, "server.json"), "\n") }],
    ["path-traversal", f => { f.comparison.server.file = "../server.json" }],
    ["drive-relative", f => { f.comparison.server.file = "C:server.json" }],
    ["bad-digest", f => { f.comparison.server.sha256 = "PASS" }],
    ["unsafe-length", f => { f.comparison.server.byteLength = Number.MAX_SAFE_INTEGER + 1 }],
    ["malformed-json", f => {
      const bytes = Buffer.from("{\n")
      fs.writeFileSync(path.join(f.root, "server.json"), bytes)
      f.comparison.server = { file: "server.json", sha256: sha(bytes), byteLength: bytes.length }
    }],
  ]) {
    const fixture = memoryFixture(t)
    mutate(fixture)
    fs.writeFileSync(fixture.comparisonPath, JSON.stringify(fixture.comparison))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, `${name}: ${result.stderr}`)
    assert.equal(report.productMemoryComparisonEvidence.receipts[0].status, "FAIL", name)
    assert.equal(report.cells.find(cell => cell.requests).requests, 20, name)
    assert.equal(report.releaseEligible, false, name)
  }
})
