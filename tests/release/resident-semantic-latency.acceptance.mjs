import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { runPreparedSuite } from "../../scripts/bench/prepared-query-suite.mjs"
import { capturePreparedIdentity } from "../../scripts/bench/prepared-suite-input.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

const latency = JSON.parse(fs.readFileSync(path.join(projectRoot, "config/semantic-release-matrix.json"))).latency

// Real-SDK development regression, not the 100-request / 5-session release gate.
// A missing Settings checkout, SDK, sidecar or oracle is an explicit failure.
test("L08 same-snapshot Settings rename keeps complete edits within the 550 ms development control",
  { timeout: 180_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-rename-latency-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const base = JSON.parse(fs.readFileSync(path.join(projectRoot,
      "bench/references/manifests/settings-resident-l07-policy-on-timing-v4-api24.json"), "utf8"))
    const target = base.targets.find(target => target.id === "rename")
    assert.equal(target.kind, "rename")
    const suite = { ...base, benchmarkId: "l08-settings-rename-development-control",
      preOpenTargetIds: ["iservice", "rename"],
      runtime: { ...base.runtime, postIdleMs: 0, env: { ...base.runtime.env,
        ARKTS_REFERENCES_TRACE: "0", ARKTS_MEMORY_METRICS_FILE: path.join(directory, "metrics.jsonl") } },
      scenarios: [
        { id: "prepare-full-program", bucket: "first-unseen-symbol", targetId: "iservice" },
        { id: "prepare-rename", bucket: "first-unseen-symbol", targetId: target.id,
          waitForPreOpenDiagnostics: true },
        ...Array.from({ length: 10 }, (_, index) => ({ id: `repeat-${index + 1}`,
          bucket: "repeated-snapshot", targetId: target.id })),
      ] }
    suite.pins = await capturePreparedIdentity(suite)
    const manifest = path.join(directory, "suite.json")
    fs.writeFileSync(manifest, JSON.stringify(suite))
    const report = await runPreparedSuite({ preparedSuite: manifest, out: path.join(directory, "report.json") })
    const samples = report.requests.filter(request => request.bucket === "repeated-snapshot")
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.inputIdentity.inputUnchanged, true)
    assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
    assert.equal(samples.length, 10)
    assert.ok(samples.every(request => request.status === "COMPLETE" && request.correctness.equal))
    const elapsed = samples.map(request => request.elapsedMs).sort((a, b) => a - b)
    const p95 = elapsed[Math.ceil(elapsed.length * .95) - 1]
    t.diagnostic(JSON.stringify({ p95Ms: p95, samplesMs: elapsed,
      latencyTargetMs: latency.targetMs, acceptanceCeilingMs: latency.p95MsMax,
      serverInputSha256: suite.pins.serverInputSha256, serverSha256: suite.pins.serverSha256,
      semanticWorkerSha256: suite.pins.semanticWorkerSha256 }))
    assert.ok(p95 <= latency.p95MsMax, `same-snapshot complete rename P95=${p95.toFixed(1)}ms; ceiling=${latency.p95MsMax}ms; raw=${JSON.stringify(elapsed)}`)
  })

test("L08 same-snapshot Settings incoming calls keep the complete payload within the 550 ms development control",
  { timeout: 180_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-incoming-latency-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const base = JSON.parse(fs.readFileSync(path.join(projectRoot,
      "bench/references/manifests/settings-resident-l07-policy-on-timing-v4-api24.json"), "utf8"))
    const target = base.targets.find(target => target.id === "incomingCalls")
    assert.equal(target.kind, "incomingCalls")
    const suite = { ...base, benchmarkId: "l08-settings-incoming-development-control",
      preOpenTargetIds: ["iservice", target.callHierarchyTargetId],
      runtime: { ...base.runtime, postIdleMs: 0, env: { ...base.runtime.env,
        ARKTS_REFERENCES_TRACE: "0", ARKTS_MEMORY_METRICS_FILE: path.join(directory, "metrics.jsonl") } },
      scenarios: [
        { id: "prepare-full-program", bucket: "first-unseen-symbol", targetId: "iservice" },
        { id: "prepare-call-item", bucket: "first-unseen-symbol", targetId: target.callHierarchyTargetId,
          waitForPreOpenDiagnostics: true },
        { id: "first-incoming", bucket: "first-unseen-symbol", targetId: target.id },
        ...Array.from({ length: 10 }, (_, index) => ({ id: `repeat-${index + 1}`,
          bucket: "repeated-snapshot", targetId: target.id })),
      ] }
    suite.pins = await capturePreparedIdentity(suite)
    const manifest = path.join(directory, "suite.json")
    fs.writeFileSync(manifest, JSON.stringify(suite))
    const report = await runPreparedSuite({ preparedSuite: manifest, out: path.join(directory, "report.json") })
    const samples = report.requests.filter(request => request.bucket === "repeated-snapshot")
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.inputIdentity.inputUnchanged, true)
    assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
    assert.equal(report.gateStatus.diagnostics, "PASS")
    assert.equal(report.gateStatus.latency, "BLOCKED", "ten development samples cannot graduate the release SLO")
    assert.equal(samples.length, 10)
    assert.ok(samples.every(request => request.status === "COMPLETE" && request.correctness.equal
      && request.measurementState === "candidate-ready-control"))
    const elapsed = samples.map(request => request.elapsedMs).sort((a, b) => a - b)
    const p95 = elapsed[Math.ceil(elapsed.length * .95) - 1]
    t.diagnostic(JSON.stringify({ p95Ms: p95, samplesMs: elapsed,
      latencyTargetMs: latency.targetMs, acceptanceCeilingMs: latency.p95MsMax,
      serverInputSha256: suite.pins.serverInputSha256, serverSha256: suite.pins.serverSha256,
      semanticWorkerSha256: suite.pins.semanticWorkerSha256 }))
    assert.ok(p95 <= latency.p95MsMax, `same-snapshot complete incoming P95=${p95.toFixed(1)}ms; ceiling=${latency.p95MsMax}ms; raw=${JSON.stringify(elapsed)}`)
  })
