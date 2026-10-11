import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { projectRoot } from "./support/lsp-process.mjs"
import { summarizePreparedBuckets } from "../scripts/bench/prepared-query-report.mjs"
import { preparedRequestReady } from "../scripts/bench/prepared-release-readiness.mjs"

const cli = path.join(projectRoot, "scripts/bench/assert-semantic-release.mjs")
const matrix = path.join(projectRoot, "config/semantic-release-matrix.json")

test("L08 accepts the authorized compatible SDK without a separate version-matching gate", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-compatible-sdk-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "matrix.json")
  const out = path.join(root, "report.json")
  const input = JSON.parse(fs.readFileSync(matrix, "utf8"))
  input.independentEnvironmentGates = ["deveco-pss-comparison"]
  fs.writeFileSync(source, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", source, "--out", out], {
    cwd: projectRoot, encoding: "utf8",
  })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  assert.deepEqual(report.independentEnvironmentGates, { "deveco-pss-comparison": "NOT_RUN" })
  assert.equal(report.cells.length, 336)
  assert.equal(report.releaseEligible, false)
})

test("L08 accepts the user-approved 550 ms ceiling while retaining the 500 ms target and sample floors", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-approved-latency-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "matrix.json")
  const out = path.join(root, "report.json")
  const input = JSON.parse(fs.readFileSync(matrix, "utf8"))
  input.latency.targetMs = 500
  input.latency.p95MsMax = 550
  fs.writeFileSync(source, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", source, "--out", out], {
    cwd: projectRoot, encoding: "utf8",
  })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  assert.deepEqual(report.matrix.contract.latency,
    { targetMs: 500, p95MsMax: 550, minimumRequests: 100, minimumSessions: 5 })
  assert.equal(report.status, "NOT_RUN")
  assert.equal(report.releaseEligible, false)
  assert.equal(report.cells.length, 336)
})

test("L08 reports every required cell NOT_RUN when no product evidence exists", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-matrix-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const out = path.join(root, "report.json")
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix, "--out", out], {
    cwd: projectRoot, encoding: "utf8",
  })
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stdout, /SEMANTIC_RELEASE_GATE=NOT_RUN/u)
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  assert.equal(report.status, "NOT_RUN")
  assert.equal(report.releaseEligible, false)
  assert.equal(report.cells.length, 336)
  assert.equal(new Set(report.cells.map(({ platform, capability, bucket }) =>
    JSON.stringify([platform, capability, bucket]))).size, 336)
  for (const cell of report.cells) {
    assert.equal(cell.requests, 0)
    assert.equal(cell.sessions, 0)
    assert.deepEqual(cell.gates, Object.fromEntries([
      "correctness", "ready", "latency", "memory", "lifecycle", "portability",
    ].map(gate => [gate, "NOT_RUN"])))
  }
  assert.deepEqual(report.independentEnvironmentGates, {
    "deveco-pss-comparison": "NOT_RUN",
  })
})

test("L08 keeps candidate-only references evidence separate by declaration policy", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-candidate-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "candidate.json")
  const out = path.join(root, "report.json")
  fs.writeFileSync(source, JSON.stringify(candidateReport()))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", source, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  const cell = report.cells.find(cell => cell.platform === "darwin"
    && cell.capability === "references:includeDeclaration=true" && cell.bucket === "first-unseen-symbol")
  assert.equal(cell.requests, 1)
  assert.equal(cell.sessions, 1)
  assert.equal(cell.observedLatencyMs.p95, 42)
  assert.equal(cell.gates.ready, "BLOCKED")
  assert.equal(cell.gates.latency, "BLOCKED")
  assert.equal(cell.measurementState, "candidate-ready-control")
  assert.deepEqual(cell.evidence, [source])
  assert.equal(report.cells.find(cell => cell.platform === "darwin"
    && cell.capability === "references:includeDeclaration=false"
    && cell.bucket === "first-unseen-symbol").requests, 0)
  assert.equal(report.releaseEligible, false)
})

function candidateReport() {
  const pins = { serverInputSha256: "a".repeat(64), serverSha256: "b".repeat(64),
    sdkDeclarationDigest: "c".repeat(64), workspaceFilesSha256: "d".repeat(64) }
  return {
    schema: "arkts-language-server.prepared-query-report", schemaVersion: 1,
    inputIdentity: { ...pins, postflightPins: pins, inputUnchanged: true },
    environment: { platform: "Darwin 25.6.0 x64", traceMode: "trace-off", effectiveArktsFlags: {} },
    readiness: { semantic: { status: "READINESS_UNSUPPORTED" } },
    targetPool: [{ id: "ref", kind: "references", includeDeclaration: true }],
    requests: [{ scenarioId: "new", targetId: "ref", kind: "references", bucket: "first-unseen-symbol",
      status: "COMPLETE", elapsedMs: 42, measurementState: "candidate-ready-control",
      correctness: { equal: true, missing: [], extra: [], duplicates: [], invalid: [] } }],
    correctness: { plannedRequests: 1, executedRequests: 1, status: "PASS" },
    memory: { targetPid: 321 }, timeline: [{ phase: "server-process-started", timestamp: 12345 }],
    closeResult: { exit: { code: 0, signal: null } },
  }
}

test("L08 separates requests above the 500 ms target from requests above the approved 550 ms ceiling", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-latency-counters-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "candidate.json")
  const out = path.join(root, "report.json")
  const input = candidateReport()
  input.requests[0].elapsedMs = 525
  fs.writeFileSync(source, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", source, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  const group = report.cells.find(cell => cell.requests).inputGroups[0]
  assert.equal(group.above500Ms, 1)
  assert.equal(group.aboveAcceptanceMs, 0)
  assert.equal(report.releaseEligible, false)
})

test("prepared controls use the approved P95 ceiling without hiding above-target or tail samples", () => {
  const requests = Array.from({ length: 100 }, (_, index) => ({ ...candidateReport().requests[0],
    scenarioId: `repeat-${index}`, bucket: "repeated-snapshot", elapsedMs: index < 98 ? 525 : 700 }))
  const suite = { targets: candidateReport().targetPool,
    scenarios: requests.map(request => ({ id: request.scenarioId, targetId: "ref", bucket: request.bucket })),
    runtime: { env: { ARKTS_REFERENCES_TRACE: "0" } } }
  const [summary] = summarizePreparedBuckets(suite, requests)
  assert.equal(summary.controlStatus, "PASS")
  assert.equal(summary.latencyMs.p95, 525)
  assert.equal(summary.latencyMs.max, 700)
  assert.equal(summary.above500Ms, 100)
  assert.equal(summary.aboveAcceptanceMs, 2)
  assert.equal(summary.latencyTargetMs, 500)
  assert.equal(summary.latencyCeilingMs, 550)
  assert.equal(summary.readyStatus, "BLOCKED")
  assert.equal(summary.gateStatus, "BLOCKED")
})

test("the 550 ms control boundary still rejects slower, incorrect and incomplete request samples", () => {
  const evaluate = (elapsedMs, count = 10, mutate = () => {}) => {
    const requests = Array.from({ length: count }, (_, index) => ({ ...candidateReport().requests[0],
      scenarioId: `repeat-${index}`, bucket: "repeated-snapshot", elapsedMs }))
    mutate(requests)
    const suite = { targets: candidateReport().targetPool,
      scenarios: requests.map(request => ({ id: request.scenarioId, targetId: "ref", bucket: request.bucket })),
      runtime: { env: { ARKTS_REFERENCES_TRACE: "0" } } }
    return summarizePreparedBuckets(suite, requests)[0]
  }
  assert.equal(evaluate(550).controlStatus, "PASS")
  assert.equal(evaluate(551).controlStatus, "FAIL")
  assert.equal(evaluate(550, 9).controlStatus, "BLOCKED")
  assert.equal(evaluate(1, 10, requests => { requests[0].correctness = { equal: false } }).controlStatus, "FAIL")
  assert.equal(evaluate(1, 10, requests => { requests[0].status = "TIMEOUT" }).controlStatus, "FAIL")
})

test("L08 retains trace-on attribution without treating its timing as product evidence", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-trace-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "trace.json")
  const out = path.join(root, "report.json")
  const input = candidateReport()
  input.environment.traceMode = "attribution-only"
  input.environment.effectiveArktsFlags.ARKTS_REFERENCES_TRACE = "1"
  fs.writeFileSync(source, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", source, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  const cell = report.cells.find(cell => cell.platform === "darwin"
    && cell.capability === "references:includeDeclaration=true" && cell.bucket === "first-unseen-symbol")
  assert.equal(cell.attributionRequests, 1)
  assert.equal(cell.productRequests, 0)
  assert.equal(cell.observedLatencyMs, undefined)
  assert.equal(cell.measurementState, "attribution-only")
  assert.equal(cell.inputGroups[0].observedLatencyMs.p95, 42)
  assert.equal(cell.gates.latency, "BLOCKED")
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects a claimed equal result with a nonempty exact-difference list", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-diff-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "incorrect.json")
  const out = path.join(root, "report.json")
  const input = candidateReport()
  input.requests[0].correctness.missing = [{ file: "Missing.ets" }]
  fs.writeFileSync(source, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", source, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out, "utf8"))
  assert.equal(report.status, "FAIL")
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.gates.correctness, "FAIL")
  assert.equal(cell.inputGroups[0].failures, 1)
  assert.equal(cell.requests, 1)
})

test("L08 cannot reduce its platform scope or release sample floors through a matrix edit", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-contract-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [name, mutate] of [
    ["platform", input => { input.platforms = ["darwin", "win32"] }],
    ["requests", input => { input.latency.minimumRequests = 10 }],
    ["sessions", input => { input.latency.minimumSessions = 1 }],
    ["latency", input => { input.latency.p95MsMax = 1000 }],
    ["ceiling", input => { input.latency.p95MsMax = 551 }],
    ["target", input => { input.latency.targetMs = 600 }],
    ["soak", input => { input.reuseSoak.minimumAlternatingCycles = 10 }],
  ]) {
    const input = JSON.parse(fs.readFileSync(matrix, "utf8"))
    mutate(input)
    const altered = path.join(root, `${name}.json`)
    const out = path.join(root, `${name}-report.json`)
    fs.writeFileSync(altered, JSON.stringify(input))
    const result = spawnSync(process.execPath, [cli, "--matrix", altered, "--out", out], {
      cwd: projectRoot, encoding: "utf8",
    })
    assert.equal(result.status, 2, name)
    assert.match(result.stderr, /L08_MATRIX_CONTRACT_DRIFT/u)
    assert.equal(fs.existsSync(out), false)
  }
})

test("archived proof parsing uses the recorded Windows path convention, not the verifier host", () => {
  const input = candidateReport()
  input.environment = { ...input.environment, platform: "Windows_NT test x64", workspace: "C:\\Fixture 空间" }
  input.inputIdentity.backendVersion = "fixture"
  input.inputIdentity.backendSha256 = "a".repeat(64)
  input.inputIdentity.postflightPins = { ...input.inputIdentity.postflightPins, backendVersion: "fixture", backendSha256: "a".repeat(64) }
  const capabilities = JSON.parse(fs.readFileSync(matrix)).capabilities
  const proof = { rootUri: "file:///C:/Fixture%20%E7%A9%BA%E9%97%B4", semanticState: "ready",
    semanticGeneration: `1:0:12345678-1234-4123-8123-123456789abc:${"a".repeat(64)}`,
    readyCapabilities: capabilities, unavailableReasons: [], unavailableInput: null,
    inputIdentity: { canonicalRoot: input.environment.workspace, engineGeneration: 1, membershipRevision: 0,
      ...Object.fromEntries(["sha256", "sourcesSha256", "overlaysSha256", "optionsSha256", "projectGraphSha256", "sdkSha256", "standardLibrarySha256"].map(key => [key, "a".repeat(64)])),
      backend: { packageVersion: "fixture", compilerSha256: "a".repeat(64), packageSha256: "b".repeat(64) } },
    coverage: { projectSources: 1, sdkSources: 1, standardLibrarySources: 1, programSources: 3, dependenciesComplete: true } }
  input.readiness = { semantic: { status: "READY", observed: proof }, validation: { status: "READY", observed: proof } }
  input.gateStatus = { ready: "PASS", diagnostics: "PASS" }
  input.preparation = { targetQueries: 0 }
  const request = input.requests[0]
  request.measurementState = "semantic-ready-snapshot"
  request.readiness = { originGeneration: proof.semanticGeneration, originInputSha256: proof.inputIdentity.sha256,
    snapshot: 0, verified: true, observed: proof }
  input.timeline.push({ scenarioId: request.scenarioId, phase: "semantic-readiness-query-validation-complete", status: "READY", current: true })
  assert.equal(preparedRequestReady(input, request, capabilities), true)
  delete input.inputIdentity.backendVersion
  delete input.inputIdentity.postflightPins.backendVersion
  delete proof.inputIdentity.backend.packageVersion
  assert.equal(preparedRequestReady(input, request, capabilities), false,
    "missing backend identities cannot bind each other by undefined equality")
})
