import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { preparedMemory } from "../scripts/bench/prepared-query-report.mjs"
import { projectRoot } from "./support/lsp-process.mjs"
import { readyReport } from "./support/semantic-release-evidence-fixture.mjs"

const cli = path.join(projectRoot, "scripts/bench/assert-semantic-release.mjs")
const matrix = path.join(projectRoot, "config/semantic-release-matrix.json")

test("L08 rejects a memory summary that contradicts its full raw process samples", t => {
  const input = resourceReport()
  input.memory.peakNodeRssBytes = 1
  const report = evaluate(t, input)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.gates.correctness, "PASS", "retain independently verified query results")
  assert.equal(cell.requests, 20, "never remove a contradictory evidence session")
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_SUMMARY_MISMATCH"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.releaseEligible, false)
})

test("L08 preserves a sampler failure even when its completed queries and partial curve are correct", t => {
  const input = resourceReport()
  input.memory.samplerStderr = "RSS sampling failed: process identity changed\n"
  const report = evaluate(t, input)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.gates.correctness, "PASS")
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_SAMPLER_FAILED"))
  assert.equal(cell.requests, 20)
  assert.equal(report.status, "FAIL")
  assert.equal(report.releaseEligible, false)
})

test("L08 recomputes actual sampling gaps instead of trusting a claimed zero interval", t => {
  const input = resourceReport()
  input.memory.actualIntervalMs.p95 = 0
  const report = evaluate(t, input)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_INTERVAL_SUMMARY_MISMATCH"))
  assert.equal(report.status, "FAIL")
  assert.equal(cell.requests, 20)
})

test("L08 checks unique process accounting timestamps and raw sample completeness", t => {
  for (const [name, reason, mutate] of [
    ["duplicate-pid", "MEMORY_PROCESS_ACCOUNTING_INVALID", input => {
      input.memory.samples[0].processes.push({ ...input.memory.samples[0].processes[0] })
    }],
    ["missing-server", "MEMORY_PROCESS_ACCOUNTING_INVALID", input => {
      input.memory.samples[0].processes[0].pid = 999
    }],
    ["tree-total", "MEMORY_PROCESS_ACCOUNTING_INVALID", input => {
      input.memory.samples[0].totalRssBytes++
    }],
    ["negative-rss", "MEMORY_PROCESS_ACCOUNTING_INVALID", input => {
      input.memory.samples[0].processes[0].rssBytes = -1
    }],
    ["sample-count", "MEMORY_RAW_SAMPLES_INVALID", input => { input.memory.sampleCount++ }],
    ["empty-curve", "MEMORY_RAW_SAMPLES_INVALID", input => { input.memory.samples = [] }],
    ["null-sample", "MEMORY_RAW_SAMPLES_INVALID", input => { input.memory.samples[1] = null }],
    ["clock-reversal", "MEMORY_RAW_SAMPLES_INVALID", input => {
      input.memory.samples[1].timestamp = input.memory.samples[0].timestamp - 1
    }],
    ["platform", "MEMORY_RAW_SAMPLES_INVALID", input => { input.memory.platform = "linux" }],
    ["nonfinite-sampler", "MEMORY_RAW_SAMPLES_INVALID", input => {
      input.memory.samples[0].samplerRssBytes = null
    }],
    ["product-peak", "MEMORY_SUMMARY_MISMATCH", input => { input.memory.peakProductRssBytes++ }],
    ["sampler-peak", "MEMORY_SUMMARY_MISMATCH", input => { input.memory.peakSamplerRssBytes++ }],
  ]) {
    const input = resourceReport()
    mutate(input)
    const report = evaluate(t, input)
    const cell = report.cells.find(cell => cell.requests)
    assert.equal(cell.gates.memory, "FAIL", name)
    assert.ok(cell.reasons.includes(reason), `${name}: ${JSON.stringify(cell.reasons)}`)
    assert.equal(cell.requests, 20, name)
  }
})

test("L08 retains verified RSS as a lower-bound observation not a PSS pass or a hard 1024 MiB gate", t => {
  const input = resourceReport()
  const samples = input.memory.samples.map(sample => ({ ...sample, totalRssBytes: sample.totalRssBytes + 2 ** 31,
    processes: sample.processes.map(process => ({ ...process,
      rssBytes: process.rssBytes + (process.pid === input.memory.targetPid ? 2 ** 31 : 0) })).reverse() }))
  input.memory = { ...input.memory, ...preparedMemory(samples, input.memory.targetPid, 10, ""), platform: "darwin" }
  const report = evaluate(t, input)
  const cell = report.cells.find(cell => cell.requests)
  const observed = cell.inputGroups[0].memoryEvidence[0]
  assert.equal(observed.status, "PASS", "the raw observation is internally consistent")
  assert.equal(observed.sampleCount, 3)
  assert.equal(observed.peakNodeRssBytes, 2 ** 31 + 800)
  assert.equal(observed.peakProductRssBytes, 2 ** 31 + 1000, "sampler RSS is never added to product RSS")
  assert.deepEqual(observed.actualIntervalMs, { p50: 10, p95: 10, max: 10 })
  assert.match(observed.sha256, /^[0-9a-f]{64}$/u)
  assert.equal(cell.gates.memory, "BLOCKED", "valid RSS is not the independent PSS contract")
  assert.ok(cell.reasons.includes("RSS_NOT_PSS_RELEASE_EVIDENCE"))
  assert.equal(report.status, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

test("L08 never upgrades a trace-only RSS observation to normal product evidence", t => {
  const input = resourceReport()
  input.environment.traceMode = "attribution-only"
  input.environment.effectiveArktsFlags.ARKTS_REFERENCES_TRACE = "1"
  const report = evaluate(t, input)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.inputGroups[0].memoryEvidence[0].status, "PASS")
  assert.equal(cell.measurementState, "attribution-only")
  assert.equal(cell.productRequests, 0)
  assert.equal(cell.gates.memory, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

function resourceReport() {
  const input = readyReport(0)
  const samples = [10, 20, 30].map((offset, index) => ({
    timestamp: input.timeline[0].timestamp + offset,
    totalRssBytes: 800 + index * 100, samplerRssBytes: 50,
    processes: [{ role: "server", pid: input.memory.targetPid, rssBytes: 600 + index * 100 },
      { role: "sidecar", pid: 432, rssBytes: 200 }],
  }))
  input.memory = preparedMemory(samples, input.memory.targetPid, 10, "")
  // Synthetic raw records test the consumer only; they are never product evidence.
  input.memory.platform = "darwin"
  return input
}

test("L08 uses captured monotonic RSS intervals while preserving a reversed raw wall clock",
  t => {
    const input = resourceReport()
    const samples = input.memory.samples.map((sample, index) => ({ ...sample,
      timestamp: sample.timestamp - (index > 0 ? 1000 : 0), monotonicMs: 100 + index * 10 }))
    input.memory = preparedMemory(samples, input.memory.targetPid, 10, "")
    input.memory.platform = "darwin"
    const report = evaluate(t, input)
    const cell = report.cells.find(cell => cell.requests)
    const observed = cell.inputGroups[0].memoryEvidence[0]
    assert.equal(observed.status, "PASS", "a genuine monotonic clock may prove intervals despite a wall-clock adjustment")
    assert.deepEqual(observed.actualIntervalMs, { p50: 10, p95: 10, max: 10 })
    assert.equal(observed.intervalClock, "sampler-monotonic-ms")
    assert.deepEqual(input.memory.samples, samples, "never restamp, sort or drop the raw observation")
    assert.equal(cell.gates.memory, "BLOCKED", "interval integrity is still not PSS evidence")
    assert.equal(report.releaseEligible, false)
  })

test("L08 rejects missing mixed reversed or malformed monotonic RSS clocks without losing query results", t => {
  for (const [name, mutate] of [
    ["unknown-clock", memory => { memory.intervalClock = "estimated-wall-clock" }],
    ["missing-clock-tag", memory => { delete memory.intervalClock }],
    ["mixed-clock-records", memory => { delete memory.samples[1].monotonicMs }],
    ["reversed-monotonic", memory => { memory.samples[1].monotonicMs = 99 }],
    ["equal-monotonic", memory => { memory.samples[1].monotonicMs = 100 }],
    ["null-monotonic", memory => { memory.samples[1].monotonicMs = null }],
    ["string-monotonic", memory => { memory.samples[1].monotonicMs = "110" }],
    ["unsafe-monotonic", memory => { memory.samples[2].monotonicMs = Number.MAX_SAFE_INTEGER + 1 }],
    ["invalid-wall-time", memory => { memory.samples[1].timestamp = null }],
    ["null-monotonic-sample", memory => { memory.samples[1] = null }],
  ]) {
    const input = resourceReport()
    input.memory = preparedMemory(input.memory.samples.map((sample, index) => ({ ...sample,
      monotonicMs: 100 + index * 10 })), input.memory.targetPid, 10, "")
    input.memory.platform = "darwin"
    mutate(input.memory)
    const report = evaluate(t, input)
    const cell = report.cells.find(cell => cell.requests)
    assert.equal(cell.gates.memory, "FAIL", name)
    assert.ok(cell.reasons.includes("MEMORY_RAW_SAMPLES_INVALID"), name)
    assert.equal(cell.gates.correctness, "PASS", name)
    assert.equal(cell.requests, 20, name)
    assert.equal(report.releaseEligible, false, name)
  }
})

test("L08 rejects a malformed snapshot completion interval without losing exact query rows", t => {
  const input = resourceReport()
  input.memory = preparedMemory(input.memory.samples.map((sample, index) => ({ ...sample,
    monotonicMs: 100 + index * 10, completedTimestamp: sample.timestamp + 3,
    completedMonotonicMs: 103 + index * 10 })), input.memory.targetPid, 10, "")
  input.memory.platform = "darwin"
  input.memory.samples[1].completedMonotonicMs = 109
  const report = evaluate(t, input)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_COMPLETION_INTERVAL_INVALID"))
  assert.equal(cell.gates.correctness, "PASS")
  assert.equal(cell.requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 requires complete paired read boundaries while retaining a real reversed wall clock", t => {
  const make = () => {
    const input = resourceReport()
    input.memory = preparedMemory(input.memory.samples.map((sample, index) => ({ ...sample,
      monotonicMs: 100 + index * 10, completedTimestamp: sample.timestamp - 1000,
      completedMonotonicMs: 103 + index * 10 })), input.memory.targetPid, 10, "")
    input.memory.platform = "darwin"
    return input
  }
  const valid = evaluate(t, make())
  assert.equal(valid.cells.find(cell => cell.requests).inputGroups[0].memoryEvidence[0].status, "PASS",
    "a reversed wall clock is retained, never substituted for the sampler's monotonic duration")
  assert.equal(valid.releaseEligible, false)
  for (const [name, mutate] of [
    ["missing-wall-end", sample => { delete sample.completedTimestamp }],
    ["missing-monotonic-end", sample => { delete sample.completedMonotonicMs }],
    ["null-wall-end", sample => { sample.completedTimestamp = null }],
    ["null-monotonic-end", sample => { sample.completedMonotonicMs = null }],
    ["string-monotonic-end", sample => { sample.completedMonotonicMs = "113" }],
    ["unsafe-end", sample => { sample.completedMonotonicMs = Number.MAX_SAFE_INTEGER + 1 }],
  ]) {
    const input = make()
    mutate(input.memory.samples[1])
    const report = evaluate(t, input)
    const cell = report.cells.find(cell => cell.requests)
    assert.equal(cell.gates.memory, "FAIL", name)
    assert.ok(cell.reasons.includes("MEMORY_COMPLETION_INTERVAL_INVALID"), name)
    assert.equal(cell.requests, 20, name)
    assert.equal(report.releaseEligible, false, name)
  }
})

function evaluate(t, input) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-resource-evidence-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "prepared.json")
  const out = path.join(root, "release.json")
  fs.writeFileSync(source, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", source, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  return JSON.parse(fs.readFileSync(out))
}
