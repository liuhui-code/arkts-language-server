import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { capturePreparedIdentity, digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { makeSuite, runSuite, saveSuite } from "./support/prepared-suite-fixture.mjs"

const runner = path.resolve("scripts/bench/replay-references.mjs")

test("prepared suite rejects an empty target pool before launching a server", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-prepared-cli-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const input = path.join(directory, "suite.json")
  const output = path.join(directory, "report.json")
  fs.writeFileSync(input, JSON.stringify({ schemaVersion: 1, targets: [], seed: 20260929 }))
  const result = spawnSync(process.execPath, [runner, "--prepared-suite", input, "--out", output], {
    encoding: "utf8", timeout: 5000,
  })
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /PREPARED_SUITE_INVALID=EMPTY_TARGET_POOL/u)
  assert.equal(fs.existsSync(output), false)
})

for (const queueTrace of ["0", "1"]) {
test(`candidate catalog readiness never certifies semantic-ready or cached SLO (queue trace ${queueTrace})`, async (t) => {
  const fixture = await makeSuite(t)
  fixture.suite.runtime.env.ARKTS_REFERENCES_TRACE = "0"
  fixture.suite.runtime.env.ARKTS_SEMANTIC_QUEUE_TRACE = queueTrace
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.environment.traceMode, queueTrace === "1" ? "attribution-only" : "trace-off",
    "the new queue observer must never masquerade as normal product timing")
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
  assert.equal(report.readiness.candidate.state, "ready")
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(report.gateStatus.latency, "BLOCKED")
  assert.equal(report.requests.length, 2)
  assert.ok(report.requests.every(request => request.measurementState === "candidate-ready-control"))
  assert.ok(report.requests.every(request => request.correctness.equal))
  for (const request of report.requests) {
    assert.deepEqual(request.correctness.expectedLocations, request.correctness.locations,
      "archive the complete pinned oracle, not only a boolean or expected count")
  }
  assert.equal(report.bucketSummaries.length, 2)
  assert.ok(report.bucketSummaries.every(bucket => bucket.gateStatus === "BLOCKED"))
  assert.ok(report.memory.samples.length > 0)
  assert.ok(report.memory.actualIntervalMs.p95 > 0)
  assert.equal(report.preparation.targetQueries, 0)
})
}

test("prepared collector preserves raw RSS wall-clock rollback and aggregates captured monotonic intervals", async t => {
  const fixture = await makeSuite(t)
  const result = spawnSync(process.execPath, [runner, "--prepared-suite", fixture.input, "--out", fixture.output], {
    encoding: "utf8", timeout: 15_000, env: { ...process.env, ARKTS_TEST_RSS_CLOCK_ROLLBACK: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/rss-clock-rollback.cjs"))}` },
  })
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  const { memory } = report
  assert.equal(report.correctness.status, "PASS")
  assert.equal(report.requests.length, 2)
  assert.equal(memory.samplerStderr, "")
  assert.equal(memory.intervalClock, "sampler-monotonic-ms")
  assert.ok(memory.samples.length >= 2)
  assert.ok(memory.samples[1].timestamp < memory.samples[0].timestamp)
  const gaps = memory.samples.slice(1).map((sample, index) => sample.monotonicMs - memory.samples[index].monotonicMs)
    .sort((left, right) => left - right)
  assert.ok(gaps.every(gap => Number.isFinite(gap) && gap > 0))
  assert.deepEqual(memory.actualIntervalMs, { p50: gaps[Math.ceil(gaps.length * .5) - 1],
    p95: gaps[Math.ceil(gaps.length * .95) - 1], max: gaps.at(-1) })
  assert.equal(report.gateStatus.ready, "FAIL", "clock integrity does not certify semantic readiness")
  assert.equal(report.gateStatus.latency, "BLOCKED")
})

test("prepared suite pre-opens pinned target documents before the first semantic request", async (t) => {
  const fixture = await makeSuite(t)
  const secondFile = path.join(fixture.suite.workspace, "Second.ets")
  fs.writeFileSync(secondFile, "Thing\n")
  const committed = spawnSync("git", ["add", "Second.ets"], { cwd: fixture.suite.workspace, encoding: "utf8" })
  assert.equal(committed.status, 0, committed.stderr)
  const commit = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "commit", "-qm", "second target"], { cwd: fixture.suite.workspace, encoding: "utf8" })
  assert.equal(commit.status, 0, commit.stderr)
  const secondOracle = path.join(fixture.directory, "second-oracle.json")
  fs.writeFileSync(secondOracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Second.ets",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }] }))
  const { sha256File } = await import("../scripts/bench/reference-replay-input.mjs")
  fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "second", moduleId: "second",
    file: "Second.ets", sourceSha256: sha256File(secondFile),
    oracle: { path: secondOracle, sha256: sha256File(secondOracle), verified: true } })
  fixture.suite.preOpenTargetIds = ["thing", "second"]
  fixture.suite.scenarios.push({ id: "second-first", bucket: "first-unseen-symbol", targetId: "second" })
  fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  const firstRequest = report.timeline.findIndex(event => event.phase === "request-start")
  const opens = report.timeline.slice(0, firstRequest).filter(event => event.phase === "didOpen-sent")
  assert.deepEqual(opens.map(event => event.targetId), ["thing", "second"])
  assert.equal(report.diagnostics.length, 2)
  assert.ok(report.requests.every(request => request.correctness.equal))
})

test("prepared suite rejects unknown and duplicate pre-open target IDs before server launch", async (t) => {
  const fixture = await makeSuite(t)
  for (const [ids, reason] of [
    [["missing"], "PREOPEN_TARGET"],
    [["thing", "thing"], "DUPLICATE_PREOPEN_TARGET"],
  ]) {
    fixture.suite.preOpenTargetIds = ids
    saveSuite(fixture)
    const result = runSuite(fixture)
    assert.equal(result.status, 2, result.stderr)
    assert.match(result.stderr, new RegExp(`PREPARED_SUITE_INVALID=${reason}`))
    assert.equal(fs.existsSync(fixture.output), false)
  }
})

test("prepared suite rejects a pre-open target outside the pinned workspace", async (t) => {
  const fixture = await makeSuite(t)
  fs.writeFileSync(path.join(fixture.directory, "outside.ets"), "Thing\n")
  fixture.suite.targets[0].file = "../outside.ets"
  fixture.suite.preOpenTargetIds = ["thing"]
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /PREPARED_SUITE_INVALID=SOURCE_PATH/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("prepared suite mode is exclusive and rejects unresolved pins without launching", async (t) => {
  const fixture = await makeSuite(t)
  const exclusive = runSuite(fixture, ["--file", "Query.ets"])
  assert.equal(exclusive.status, 2)
  assert.match(exclusive.stderr, /mutually exclusive/u)
  fixture.suite.pins.repoSha = "<resolve-later>"
  saveSuite(fixture)
  const unpinned = runSuite(fixture)
  assert.equal(unpinned.status, 2)
  assert.match(unpinned.stderr, /UNPINNED_INPUT/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("prepared suite cannot label a second declaration policy as an unseen symbol", async (t) => {
  const fixture = await makeSuite(t)
  fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "same-with-declaration", includeDeclaration: true })
  fixture.suite.scenarios[1] = { id: "second-first", bucket: "first-unseen-symbol", targetId: "same-with-declaration" }
  saveSuite(fixture)
  const duplicate = runSuite(fixture)
  assert.equal(duplicate.status, 2)
  assert.match(duplicate.stderr, /DUPLICATE_UNSEEN_TARGET/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("prepared suite rejects a suite-authored ready timer and ignores a server fake-ready flag", async (t) => {
  const fixture = await makeSuite(t, "fake-ready")
  fixture.suite.readiness.readyAfterMs = 1
  saveSuite(fixture)
  const untrusted = runSuite(fixture)
  assert.equal(untrusted.status, 2)
  assert.match(untrusted.stderr, /UNTRUSTED_READINESS/u)
  delete fixture.suite.readiness.readyAfterMs
  saveSuite(fixture)
  const observed = runSuite(fixture)
  assert.equal(observed.status, 1, observed.stderr)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.initializeCapabilities.experimental.fakeSemanticReady, true)
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
  assert.equal(report.gateStatus.latency, "BLOCKED")
})

test("prepared suite preserves a timeout in its denominator and continues subsequent requests", async (t) => {
  const fixture = await makeSuite(t, "timeout")
  const result = runSuite(fixture)
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.requests.length, 2)
  assert.equal(report.requests[0].status, "TIMEOUT")
  assert.equal(report.requests[0].elapsedLowerBound, true)
  assert.ok(Number.isFinite(report.requests[0].elapsedMs) && report.requests[0].elapsedMs > 0)
  assert.equal(report.requests[1].status, "COMPLETE")
  const first = report.bucketSummaries.find(bucket => bucket.bucket === "first-unseen-symbol")
  assert.equal(first.samples, 1)
  assert.equal(first.timeoutCount, 1)
  assert.equal(first.failures, 1)
  assert.equal(first.above500Ratio, 1)
  assert.equal(report.correctness.status, "FAIL")
})

test("prepared suite rejects same-count wrong ranges with explicit missing and extra Locations", async (t) => {
  const fixture = await makeSuite(t, "wrong-range")
  const result = runSuite(fixture)
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  const diff = report.requests[0].correctness
  assert.equal(diff.locations.length, 1)
  assert.equal(diff.equal, false)
  assert.equal(diff.missing.length, 1)
  assert.equal(diff.extra.length, 1)
  assert.equal(report.correctness.status, "FAIL")
})

test("prepared suite separates capability buckets and blocks unsupported eviction/restart control", async (t) => {
  const fixture = await makeSuite(t)
  fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "thing-definition", kind: "definition" })
  fixture.suite.scenarios.push(
    { id: "definition", bucket: "first-unseen-symbol", targetId: "thing-definition" },
    { id: "eviction", bucket: "after-eviction", targetId: "thing" },
    { id: "restart", bucket: "restart-after-validated-ready", targetId: "thing" },
  )
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.requests.length, 3)
  assert.equal(report.bucketSummaries.find(bucket => bucket.kind === "references" && bucket.bucket === "repeated-snapshot").samples, 1)
  assert.equal(report.bucketSummaries.find(bucket => bucket.kind === "definition").samples, 1)
  assert.equal(report.blockedScenarios.length, 2)
})

test("prepared suite keeps edited snapshots out of repeated cache bucket", async (t) => {
  const fixture = await makeSuite(t)
  fixture.suite.scenarios[1].edit = { file: "Query.ets", textPath: "anything", sha256: "a".repeat(64),
    oracle: fixture.suite.targets[0].oracle }
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /EDIT_BUCKET_MISMATCH/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("repeated-snapshot cannot change method or declaration policy", async (t) => {
  const fixture = await makeSuite(t)
  fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "other-policy", includeDeclaration: true })
  fixture.suite.scenarios[1].targetId = "other-policy"
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /REPEAT_WITHOUT_IDENTICAL_SNAPSHOT/u)
})

test("repeated L3 recovery requires a completed query of the same snapshot", async t => {
  const fixture = await makeSuite(t)
  fixture.suite.scenarios[0] = { id: "premature-pressure", bucket: "pressure-recovery-repeat",
    targetId: "thing" }
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /PRESSURE_REPEAT_WITHOUT_IDENTICAL_SNAPSHOT/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("exact Locations cannot qualify a baseline without normal diagnostic observations", async (t) => {
  const fixture = await makeSuite(t, "no-diagnostics")
  const result = runSuite(fixture)
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.ok(report.requests.every(request => request.correctness.equal))
  assert.equal(report.gateStatus.diagnostics, "FAIL")
  assert.equal(report.correctness.status, "FAIL")
})

test("prepared suite applies a pinned unsaved edit and queries immediately at the new version", async (t) => {
  const fixture = await makeSuite(t)
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "// body comment\n" }]
  fixture.suite.scenarios.push({ id: "body", bucket: "edit-body", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle,
  } })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.requests.length, 3)
  assert.equal(report.requests[2].documentVersion, 2)
  assert.equal(report.requests[2].priorCompleteSnapshot, false)
  assert.equal(report.requests[2].correctness.equal, true)
  const edit = report.timeline.findIndex(event => event.phase === "didChange-sent")
  const request = report.timeline.findIndex((event, index) => index > edit && event.phase === "request-start")
  assert.equal(request, edit + 1, "edit-to-query must not wait for settled diagnostics")
  assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), "Thing\n")
})

test("edit-reference queries the unsaved second Thing immediately with an exact edited oracle", async (t) => {
  const fixture = await makeSuite(t, "edit-reference")
  const editedOracle = path.join(fixture.directory, "edited-oracle.json")
  fs.writeFileSync(editedOracle, JSON.stringify({ schemaVersion: 1, locations: [
    { file: "Query.ets", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
    { file: "Query.ets", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } } },
  ] }))
  const { sha256File } = await import("../scripts/bench/reference-replay-input.mjs")
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "Thing\n" }]
  fixture.suite.scenarios.push({ id: "add-reference", bucket: "edit-reference", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes),
    oracle: { path: editedOracle, sha256: sha256File(editedOracle), verified: true },
  } })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  const edited = report.requests.find(request => request.scenarioId === "add-reference")
  assert.ok(edited, JSON.stringify({ failure: report.failure, requests: report.requests }))
  assert.equal(edited.bucket, "edit-reference")
  assert.equal(edited.documentVersion, 2)
  assert.equal(edited.priorCompleteSnapshot, false)
  assert.equal(edited.status, "COMPLETE")
  assert.equal(edited.correctness.equal, true)
  assert.equal(edited.correctness.locations.length, 2)
  assert.equal(report.gateStatus.diagnostics, "PASS")
  assert.ok(report.diagnostics.some(item => item.version === 2 && !item.error))
  const didChange = report.timeline.findIndex(event => event.scenarioId === "add-reference" && event.phase === "didChange-sent")
  assert.equal(report.timeline[didChange + 1].phase, "request-start")
  assert.equal(report.timeline[didChange + 1].scenarioId, "add-reference")
  assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), "Thing\n")
})

test("superseded diagnostics do not fail or delay the edited reference snapshot", async (t) => {
  const fixture = await makeSuite(t, "edit-reference-superseded-diagnostic")
  fixture.suite.runtime.diagnosticTimeoutMs = 4000
  const editedOracle = path.join(fixture.directory, "edited-oracle.json")
  fs.writeFileSync(editedOracle, JSON.stringify({ schemaVersion: 1, locations: [
    { file: "Query.ets", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } },
    { file: "Query.ets", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } } },
  ] }))
  const { sha256File } = await import("../scripts/bench/reference-replay-input.mjs")
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "Thing\n" }]
  fixture.suite.scenarios.push({ id: "add-reference", bucket: "edit-reference", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes),
    oracle: { path: editedOracle, sha256: sha256File(editedOracle), verified: true },
  } })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.requests.length, 3, JSON.stringify({ failure: report.failure, timeline: report.timeline }))
  assert.ok(report.requests.every(request => request.status === "COMPLETE" && request.correctness.equal))
  assert.equal(report.requests.at(-1).documentVersion, 2)
  assert.equal(report.gateStatus.diagnostics, "PASS")
  assert.equal(report.correctness.status, "PASS")
  assert.ok(report.diagnostics.some(item => item.version === 2 && !item.error))
  const publishedV2 = report.timeline.find(event => event.phase === "publishDiagnostics" && event.version === 2)
  const closed = report.timeline.find(event => event.phase === "server-process-closed")
  assert.ok(publishedV2 && closed)
  assert.ok(closed.monotonicMs - publishedV2.monotonicMs < 2000,
    "a superseded v1 diagnostic waiter must not consume the 4-second diagnostic timeout")
})

test("a delayed first query cannot let an obsolete diagnostic deadline fail later v2 diagnostics", async (t) => {
  const fixture = await makeSuite(t, "late-v2-diagnostics")
  fixture.suite.runtime.timeoutMs = 2000
  fixture.suite.runtime.diagnosticTimeoutMs = 200
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
    newText: "// edited body\n" }]
  fixture.suite.scenarios.push({ id: "edit", bucket: "edit-body", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle,
  } })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.requests.length, 3, JSON.stringify({ failure: report.failure, timeline: report.timeline }))
  assert.ok(report.requests.every(request => request.status === "COMPLETE" && request.correctness.equal))
  const opened = report.timeline.find(event => event.phase === "didOpen-sent")
  const changed = report.timeline.find(event => event.phase === "didChange-sent")
  assert.ok(changed.monotonicMs - opened.monotonicMs > fixture.suite.runtime.diagnosticTimeoutMs,
    "v1 diagnostic deadline must expire before the v2 edit")
  assert.ok(report.diagnostics.some(item => item.version === 2 && !item.error))
  assert.equal(report.gateStatus.diagnostics, "PASS")
  assert.equal(report.correctness.status, "PASS")
})

test("edit-reference rejects a comment-only edit with an unchanged reference oracle", async (t) => {
  const fixture = await makeSuite(t)
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
    newText: "// no new reference\n" }]
  fixture.suite.scenarios.push({ id: "false-reference-edit", bucket: "edit-reference", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle,
  } })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /PREPARED_SUITE_INVALID=EDIT_REFERENCE_NO_DELTA/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("edit-reference rejects duplicate edited oracle Locations before launching", async (t) => {
  const fixture = await makeSuite(t)
  const editedOracle = path.join(fixture.directory, "duplicate-edited-oracle.json")
  const location = { file: "Query.ets", range: {
    start: { line: 0, character: 0 }, end: { line: 0, character: 5 },
  } }
  fs.writeFileSync(editedOracle, JSON.stringify({ schemaVersion: 1, locations: [location, location] }))
  const { sha256File } = await import("../scripts/bench/reference-replay-input.mjs")
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
    newText: "// no new reference\n" }]
  fixture.suite.scenarios.push({ id: "duplicate-oracle", bucket: "edit-reference", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes),
    oracle: { path: editedOracle, sha256: sha256File(editedOracle), verified: true },
  } })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /PREPARED_SUITE_INVALID=EDIT_ORACLE_DUPLICATE/u)
  assert.equal(fs.existsSync(fixture.output), false)
})

test("edit-reference accepts a moved Location without requiring a count change", async (t) => {
  const fixture = await makeSuite(t, "wrong-range")
  const editedOracle = path.join(fixture.directory, "moved-edited-oracle.json")
  fs.writeFileSync(editedOracle, JSON.stringify({ schemaVersion: 1, locations: [{
    file: "Query.ets", range: {
      start: { line: 0, character: 1 }, end: { line: 0, character: 6 },
    },
  }] }))
  const { sha256File } = await import("../scripts/bench/reference-replay-input.mjs")
  const changes = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
    newText: " " }]
  fixture.suite.scenarios.push({ id: "moved-reference", bucket: "edit-reference", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes),
    oracle: { path: editedOracle, sha256: sha256File(editedOracle), verified: true },
  } })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  const moved = report.requests.find(request => request.scenarioId === "moved-reference")
  assert.ok(moved, JSON.stringify({ failure: report.failure, requests: report.requests }))
  assert.equal(moved.status, "COMPLETE")
  assert.equal(moved.correctness.equal, true)
  assert.equal(moved.correctness.locations.length, 1)
})

test("partial capture cannot pass a bucket with unexecuted planned requests", async (t) => {
  const fixture = await makeSuite(t, "break-edit-oracle")
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_ORACLE = fixture.suite.targets[0].oracle.path
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "// edit\n" }]
  fixture.suite.scenarios = [fixture.suite.scenarios[0],
    ...Array.from({ length: 10 }, (_, index) => ({ id: `repeat-${index}`, bucket: "repeated-snapshot", targetId: "thing" })),
    { id: "edit", bucket: "edit-body", targetId: "thing", edit: {
      file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle,
    } },
    { id: "post-edit-repeat", bucket: "repeated-snapshot", targetId: "thing" },
  ]
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, result.stderr)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.ok(report.failure)
  const bucket = report.bucketSummaries.find(item => item.bucket === "repeated-snapshot")
  assert.equal(bucket.plannedSamples, 11)
  assert.equal(bucket.samples, 10)
  assert.notEqual(bucket.controlStatus, "PASS")
  assert.equal(report.correctness.status, "FAIL")
})

test("querying a different target after edit requires a snapshot-specific oracle", async (t) => {
  const fixture = await makeSuite(t)
  fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "definition", kind: "definition" })
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "// edit\n" }]
  fixture.suite.scenarios.push({ id: "edit", bucket: "edit-body", targetId: "thing", edit: {
    file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle,
  } }, { id: "later-unseen", bucket: "first-unseen-symbol", targetId: "definition" })
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /POST_EDIT_ORACLE_REQUIRED/u)
  assert.equal(fs.existsSync(fixture.output), false)
})
