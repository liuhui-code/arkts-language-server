import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { projectRoot } from "./support/lsp-process.mjs"
import { summarizePreparedBuckets } from "../scripts/bench/prepared-query-report.mjs"
import { preparedRequestReady } from "../scripts/bench/prepared-release-readiness.mjs"
import { candidateReport, readyReport } from "./support/semantic-release-evidence-fixture.mjs"

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

for (const flag of ["ARKTS_REFERENCES_TRACE", "ARKTS_SEMANTIC_QUEUE_TRACE"]) {
test(`L08 retains trace-on attribution without treating its timing as product evidence (${flag})`, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-trace-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, "trace.json")
  const out = path.join(root, "report.json")
  const input = candidateReport()
  input.environment.traceMode = flag === "ARKTS_REFERENCES_TRACE" ? "attribution-only" : "trace-off"
  input.environment.effectiveArktsFlags[flag] = "1"
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
  const samples = readyReport(0).requests
  const summaries = summarizePreparedBuckets({ targets: readyReport(0).targetPool,
    scenarios: samples.map(request => ({ id: request.scenarioId, targetId: request.targetId, bucket: request.bucket })),
    runtime: { env: { [flag]: "1" } } }, samples)
  assert.ok(summaries.every(summary => summary.reason === "ATTRIBUTION_ONLY"))
})
}

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

test("L08 rejects overlapping attempts re-exported under different report bytes", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-overlapping-attempts-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = Array.from({ length: 5 }, (_, index) => {
    const file = path.join(root, `session-${index}.json`)
    fs.writeFileSync(file, JSON.stringify(readyReport(index)))
    return file
  })
  const run = (inputs, out) => spawnSync(process.execPath, [cli, "--matrix", matrix,
    ...inputs.flatMap(file => ["--prepared-report", file]), "--out", out],
  { cwd: projectRoot, encoding: "utf8" })
  const original = path.join(root, "original.json")
  const baseline = run(files, original)
  assert.equal(baseline.status, 1, baseline.stderr)
  const cell = JSON.parse(fs.readFileSync(original)).cells.find(cell => cell.requests)
  assert.equal(cell.requests, 100)
  assert.equal(cell.sessions, 5)
  assert.equal(cell.gates.latency, "PASS", "independent, generation-bound samples qualify")

  const copy = path.join(root, "reexport.json")
  fs.writeFileSync(copy, JSON.stringify(readyReport(0), null, 2))
  const out = path.join(root, "overlap.json")
  const result = run([...files, copy], out)
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /L08_DUPLICATE_REQUEST_ATTEMPT/u)
  assert.equal(fs.existsSync(out), false, "invalid evidence cannot produce an acceptance report")
})

test("L08 fails a claimed PASS when planned attempts were never executed", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-incomplete-plan-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = Array.from({ length: 5 }, (_, index) => {
    const file = path.join(root, `session-${index}.json`)
    const input = readyReport(index)
    if (index === 0) input.correctness.plannedRequests++
    fs.writeFileSync(file, JSON.stringify(input))
    return file
  })
  const out = path.join(root, "report.json")
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    ...files.flatMap(file => ["--prepared-report", file]), "--out", out],
  { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 100, "retain the actually observed requests")
  assert.equal(cell.sessions, 5)
  assert.equal(cell.gates.correctness, "FAIL")
  assert.equal(cell.gates.latency, "FAIL")
  assert.equal(report.status, "FAIL")
  assert.equal(report.releaseEligible, false)
})

test("L08 cannot qualify one cell using two different frozen builds", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-mixed-builds-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = Array.from({ length: 10 }, (_, index) => {
    const input = readyReport(index)
    if (index >= 5) {
      input.inputIdentity.serverSha256 = "e".repeat(64)
      input.inputIdentity.postflightPins.serverSha256 = "e".repeat(64)
    }
    const file = path.join(root, `session-${index}.json`)
    fs.writeFileSync(file, JSON.stringify(input))
    return file
  })
  const out = path.join(root, "report.json")
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    ...files.flatMap(file => ["--prepared-report", file]), "--out", out],
  { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 200, "retain both builds instead of selecting the faster one")
  assert.equal(cell.inputGroups.length, 2)
  assert.equal(cell.gates.latency, "BLOCKED")
  assert.deepEqual(cell.reasons, ["MIXED_INPUT_IDENTITIES"])
  assert.equal(report.releaseEligible, false)
})

test("L08 refuses to reclassify a request whose declared target has another capability", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-target-binding-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const input = readyReport(0)
  input.requests[0].kind = "hover"
  const file = path.join(root, "mismatched.json")
  const out = path.join(root, "report.json")
  fs.writeFileSync(file, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", file, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /L08_REQUEST_TARGET_MISMATCH/u)
  assert.equal(fs.existsSync(out), false)
})

test("L08 rechecks complete payloads instead of trusting a contradictory equal label", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-payload-diff-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const input = readyReport(0)
  for (const target of input.targetPool) target.kind = "hover"
  for (const request of input.requests) {
    request.kind = "hover"
    request.correctness = { equal: true, invalid: [],
      payload: { contents: { kind: "markdown", value: "number" } },
      expectedPayload: { contents: { kind: "markdown", value: "number" } } }
  }
  input.requests[0].correctness.payload.contents.value = "string"
  const file = path.join(root, "mismatched.json")
  const out = path.join(root, "report.json")
  fs.writeFileSync(file, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", file, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 20)
  assert.equal(cell.inputGroups[0].failures, 1)
  assert.equal(cell.gates.correctness, "FAIL")
  assert.equal(report.status, "FAIL")
})

test("L08 rechecks every reference range even when counts and equal labels agree", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-reference-range-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const input = readyReport(0)
  input.requests[0].correctness.locations[0].range.start.character++
  const file = path.join(root, "mismatched.json")
  const out = path.join(root, "report.json")
  fs.writeFileSync(file, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", file, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 20)
  assert.equal(cell.inputGroups[0].failures, 1)
  assert.equal(cell.gates.correctness, "FAIL")
  assert.equal(report.status, "FAIL")
})

test("L08 keeps missing complete oracle evidence BLOCKED despite sufficient ready samples", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-missing-oracle-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = Array.from({ length: 5 }, (_, index) => {
    const input = readyReport(index)
    if (index === 0) delete input.requests[0].correctness.expectedLocations
    const file = path.join(root, `session-${index}.json`)
    fs.writeFileSync(file, JSON.stringify(input))
    return file
  })
  const out = path.join(root, "report.json")
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    ...files.flatMap(file => ["--prepared-report", file]), "--out", out],
  { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 100)
  assert.equal(cell.sessions, 5)
  assert.equal(cell.gates.ready, "PASS", "query readiness is a separate proof")
  assert.equal(cell.gates.correctness, "BLOCKED")
  assert.equal(cell.gates.latency, "BLOCKED")
  assert.deepEqual(cell.reasons, ["FULL_RESULT_ORACLE_MISSING"])
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects duplicate or malformed raw locations even when both arrays and labels agree", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-invalid-locations-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [name, mutate] of [
    ["duplicate", locations => { locations.push(structuredClone(locations[0])) }],
    ["negative", locations => { locations[0].range.start.character = -1 }],
    ["reverse", locations => { locations[0].range.end.line = -1 }],
    ["outside", locations => { locations[0].file = "../Outside.ets" }],
  ]) {
    const input = readyReport(0)
    const correctness = input.requests[0].correctness
    mutate(correctness.locations)
    correctness.expectedLocations = structuredClone(correctness.locations)
    const file = path.join(root, `${name}.json`)
    const out = path.join(root, `${name}-out.json`)
    fs.writeFileSync(file, JSON.stringify(input))
    const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
      "--prepared-report", file, "--out", out], { cwd: projectRoot, encoding: "utf8" })
    assert.equal(result.status, 1, result.stderr)
    const report = JSON.parse(fs.readFileSync(out))
    const cell = report.cells.find(cell => cell.requests)
    assert.equal(cell.inputGroups[0].failures, 1, name)
    assert.equal(cell.gates.correctness, "FAIL", name)
    assert.equal(report.status, "FAIL", name)
  }
})

test("L08 compares reference sets without changing capability payload ordering", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-location-order-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const input = readyReport(0)
  const correctness = input.requests[0].correctness
  const second = { ...structuredClone(correctness.locations[0]), file: "Other.ets" }
  correctness.locations.push(second)
  correctness.expectedLocations = structuredClone(correctness.locations).reverse()
  const file = path.join(root, "reordered.json")
  const out = path.join(root, "report.json")
  fs.writeFileSync(file, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", file, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.inputGroups[0].failures, 0)
  assert.equal(cell.gates.correctness, "PASS")
  assert.equal(report.status, "BLOCKED", "all remaining release gates still apply")
})
