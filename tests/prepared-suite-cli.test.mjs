import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { capturePreparedIdentity, digestJson } from "../scripts/bench/prepared-suite-input.mjs"

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

test("candidate catalog readiness never certifies semantic-ready or cached SLO", async (t) => {
  const fixture = await makeSuite(t)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
  assert.equal(report.readiness.candidate.state, "ready")
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(report.gateStatus.latency, "BLOCKED")
  assert.equal(report.requests.length, 2)
  assert.ok(report.requests.every(request => request.measurementState === "candidate-ready-control"))
  assert.ok(report.requests.every(request => request.correctness.equal))
  assert.equal(report.bucketSummaries.length, 2)
  assert.ok(report.bucketSummaries.every(bucket => bucket.gateStatus === "BLOCKED"))
  assert.ok(report.memory.samples.length > 0)
  assert.ok(report.memory.actualIntervalMs.p95 > 0)
  assert.equal(report.preparation.targetQueries, 0)
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
  assert.ok(report.requests[0].elapsedMs >= fixture.suite.runtime.timeoutMs)
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

function saveSuite(fixture) {
  fs.writeFileSync(fixture.input, JSON.stringify(fixture.suite))
}

async function makeSuite(t, mode = "normal") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-prepared-suite-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "lib.d.ts"), "declare const Thing: string\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  for (const args of [["init", "-q"], ["add", "Query.ets"], ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]]) {
    const git = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
    assert.equal(git.status, 0, git.stderr)
  }
  const oracle = path.join(directory, "oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{
    file: "Query.ets", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
  }] }))
  const server = path.resolve("tests/fixtures/lsp/prepared-query-server.mjs")
  const { sha256File } = await import("../scripts/bench/reference-replay-input.mjs")
  const suite = {
    schemaVersion: 1, benchmarkId: "prepared-fixture", seed: 20260929,
    workspace, sdk, server, sidecar: server,
    pins: await capturePreparedIdentity({ workspace, sdk, server, sidecar: server }),
    runtime: { timeoutMs: 500, diagnosticTimeoutMs: 1000, sampleIntervalMs: 25,
      env: { ARKTS_TEST_PREPARED_MODE: mode } },
    readiness: { candidateControl: true },
    targets: [{ id: "thing", moduleId: "fixture", kind: "references", file: "Query.ets",
      symbol: "Thing", position: { line: 0, character: 1 }, includeDeclaration: false,
      sourceSha256: sha256File(path.join(workspace, "Query.ets")),
      oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }],
    scenarios: [
      { id: "first", bucket: "first-unseen-symbol", targetId: "thing" },
      { id: "repeat", bucket: "repeated-snapshot", targetId: "thing" },
    ],
  }
  const input = path.join(directory, "suite.json")
  const output = path.join(directory, "report.json")
  fs.writeFileSync(input, JSON.stringify(suite))
  return { directory, input, output, suite }
}

function runSuite(fixture, args = []) {
  return spawnSync(process.execPath, [runner, "--prepared-suite", fixture.input, "--out", fixture.output, ...args], {
    encoding: "utf8", timeout: 15_000,
  })
}
