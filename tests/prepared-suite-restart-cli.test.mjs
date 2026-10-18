import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity, digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"
import { productionSuite, saveSuite } from "./support/prepared-suite-fixture.mjs"

test("prepared restart rebuilds a fresh production READY before an unopened source query",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, false)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.requests.length, 1, JSON.stringify({ failure: report.failure,
      semantic: report.readiness.semantic, blocked: report.blockedScenarios }))
    assert.deepEqual(report.blockedScenarios, [])
    assert.equal(report.correctness.status, "PASS")
    assert.equal(report.gateStatus.ready, "PASS")
    assert.equal(report.requests[0].correctness.equal, true)
    assert.equal(report.requests[0].documentVersion, undefined)
    assert.equal(report.requests[0].measurementState, "semantic-ready-snapshot")
    assert.equal(report.processSegments.length, 2)
    const [previous, current] = report.processSegments
    assert.notEqual(previous.pid, current.pid)
    assert.equal(report.requests[0].processSegmentId, current.id)
    for (const segment of report.processSegments) {
      assert.equal(segment.readiness.initial.status, "READY")
      assert.equal(segment.readiness.semantic.status, "READY")
      assert.equal(segment.readiness.validation.status, "READY")
      assert.equal(segment.preparation.targetQueries, 0)
      assert.deepEqual(segment.closeResult.exit, { code: 0, signal: null })
    }
    assert.notEqual(previous.readiness.semantic.observed.semanticGeneration,
      current.readiness.semantic.observed.semanticGeneration)
    assert.equal(report.requests[0].readiness.originGeneration,
      current.readiness.semantic.observed.semanticGeneration)
    assert.equal(report.memory.measurementKind, "external-process-tree-rss-segments")
    assert.equal(report.memory.segments.length, 2)
    for (const segment of report.processSegments) {
      const memory = report.memory.segments.find(item => item.processSegmentId === segment.id)
      assert.equal(memory.targetPid, segment.pid)
      const raw = fs.readFileSync(path.join(path.dirname(fixture.output), memory.rawSamples.file))
      assert.equal(createHash("sha256").update(raw).digest("hex"), memory.rawSamples.sha256)
      assert.deepEqual(raw.toString().trim().split("\n").map(JSON.parse), memory.samples)
      assert.ok(memory.samples.length >= 2)
      assert.ok(memory.samples.every(sample => sample.processes.some(process => process.pid === segment.pid)))
    }
    assert.equal(report.inputIdentity.inputUnchanged, true)
    assert.equal(report.gateStatus.latency, "BLOCKED", "one request cannot graduate the release SLO")
    assert.equal(report.gateStatus.memory, "BLOCKED", "RSS is not product PSS evidence")
  })

test("prepared restart reopens the caller without opening its definition destination before measurement",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, true)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.gateStatus.ready, "PASS")
    assert.equal(report.requests[0].documentVersion, 1)
    assert.equal(report.requests[0].correctness.equal, true)
    const current = report.processSegments[1]
    const events = report.timeline.filter(event => event.processSegmentId === current.id)
    const replay = events.findIndex(event => event.phase === "didOpen-replayed" && event.uri.endsWith("/Use.ets"))
    const ready = events.findIndex(event => event.phase === "semantic-readiness-request-start")
    const query = events.findIndex(event => event.phase === "request-start")
    assert.ok(replay >= 0 && replay < ready && ready < query)
    assert.ok(!events.some(event => event.phase.startsWith("didOpen") && event.uri?.endsWith("/Query.ets")))
    assert.notEqual(report.processSegments[0].pid, current.pid)
  })

test("prepared restart cannot borrow repeated-snapshot history from its previous process",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, true)
    fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "other-kind", kind: "typeDefinition" })
    fixture.suite.scenarios = [
      { id: "previous", bucket: "first-unseen-symbol", targetId: "other-kind" },
      { id: "restarted", bucket: "restart-after-validated-ready", targetId: "thing" },
      { id: "borrowed-repeat", bucket: "repeated-snapshot", targetId: "other-kind" },
    ]
    saveSuite(fixture)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 2, `${run.stderr}\n${run.stdout}`)
    assert.match(run.stderr, /PREPARED_SUITE_INVALID=REPEAT_WITHOUT_IDENTICAL_SNAPSHOT/u)
    assert.equal(fs.existsSync(fixture.output), false)
  })

test("prepared restart does not relabel a repeated query in the same fresh process as unseen",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, false)
    fixture.suite.scenarios.push({ ...fixture.suite.scenarios[0], id: "duplicate-restart" })
    saveSuite(fixture)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 2, `${run.stderr}\n${run.stdout}`)
    assert.match(run.stderr, /PREPARED_SUITE_INVALID=DUPLICATE_UNSEEN_TARGET/u)
    assert.equal(fs.existsSync(fixture.output), false)
  })

test("prepared restart preserves unsaved destination edits across mixed queries and two real restarts",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, true)
    const oracle = path.join(fixture.directory, "shifted-definition.json")
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets",
      range: { start: { line: 1, character: 13 }, end: { line: 1, character: 18 } } }] }))
    const changes = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "\n" }]
    fixture.suite.scenarios = [
      { id: "before", bucket: "first-unseen-symbol", targetId: "thing" },
      { id: "shift", bucket: "edit-public-api", targetId: "thing", edit: { file: "Query.ets", changes,
        sha256: digestJson(changes), oracle: { path: oracle, sha256: sha256File(oracle), verified: true } } },
      { id: "restart-1", bucket: "restart-after-validated-ready", targetId: "thing" },
      { id: "repeat-new", bucket: "repeated-snapshot", targetId: "thing" },
      { id: "restart-2", bucket: "restart-after-validated-ready", targetId: "thing" },
    ]
    saveSuite(fixture)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.gateStatus.ready, "PASS")
    assert.equal(report.processSegments.length, 3)
    assert.equal(new Set(report.processSegments.map(segment => segment.pid)).size, 3)
    assert.equal(report.requests.length, 5)
    assert.ok(report.requests.every(request => request.correctness.equal && request.readiness.verified))
    assert.deepEqual(report.requests.map(request => request.correctness.locations[0].range.start.line), [0, 1, 1, 1, 1])
    assert.deepEqual(report.requests.map(request => request.priorCompleteSnapshot), [false, false, false, true, false])
    assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), "export class Thing {}\n")
    for (const segment of report.processSegments.slice(1)) {
      const replay = report.timeline.find(event => event.processSegmentId === segment.id
        && event.phase === "didOpen-replayed" && event.uri.endsWith("/Query.ets"))
      assert.equal(replay.version, 2)
      assert.equal(segment.readiness.initial.status, "READY")
      assert.equal(segment.readiness.handoff.status, "READY")
      assert.deepEqual(segment.closeResult.exit, { code: 0, signal: null })
    }
    const releaseFile = path.join(fixture.directory, "release.json")
    const releaseRun = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", fixture.output,
      "--out", releaseFile], { encoding: "utf8", timeout: 15_000 })
    assert.equal(releaseRun.status, 1, releaseRun.stderr)
    const release = JSON.parse(fs.readFileSync(releaseFile, "utf8"))
    const cells = release.cells.filter(cell => cell.requests)
    assert.equal(cells.length, 4)
    assert.equal(cells.reduce((total, cell) => total + cell.requests, 0), 5)
    for (const cell of cells) {
      assert.equal(cell.gates.ready, "PASS", JSON.stringify({ bucket: cell.bucket, reasons: cell.reasons }))
      assert.equal(cell.gates.correctness, "PASS")
      assert.equal(cell.gates.memory, "BLOCKED", JSON.stringify({ reasons: cell.reasons, memory: cell.inputGroups.map(group => group.memoryEvidence) }))
      assert.equal(cell.gates.latency, "BLOCKED", "small N cannot satisfy the release SLO")
    }
    assert.equal(release.releaseEligible, false)
  })

test("prepared restart release evidence requires an archived raw RSS binding for every process",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, false)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 1, run.stderr)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.correctness.status, "PASS")
    const segment = report.processSegments[0]
    const artifactFile = path.join(fixture.directory, segment.reportArtifact.file)
    const canonical = JSON.parse(fs.readFileSync(artifactFile, "utf8"))
    delete canonical.memory.rawSamples
    const bytes = Buffer.from(JSON.stringify(canonical))
    fs.writeFileSync(artifactFile, bytes)
    segment.reportArtifact.sha256 = createHash("sha256").update(bytes).digest("hex")
    segment.reportArtifact.byteLength = bytes.length
    delete report.memory.segments[0].rawSamples
    const input = path.join(fixture.directory, "missing-raw.json")
    const output = path.join(fixture.directory, "missing-raw-release.json")
    fs.writeFileSync(input, JSON.stringify(report))
    const releaseRun = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", input,
      "--out", output], { encoding: "utf8", timeout: 15_000 })
    assert.equal(releaseRun.status, 1, releaseRun.stderr)
    const release = JSON.parse(fs.readFileSync(output, "utf8"))
    const cell = release.cells.find(cell => cell.requests)
    assert.equal(cell.requests, 1)
    assert.equal(cell.gates.correctness, "PASS", "resource binding failure cannot erase independently verified queries")
    assert.equal(cell.gates.memory, "FAIL")
    assert.ok(cell.reasons.includes("MEMORY_PROCESS_SEGMENT_RAW_ARTIFACT_REQUIRED"))
    assert.equal(release.releaseEligible, false)
  })

test("prepared restart retains exact queries but fails a nonzero final native process exit",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, false)
    fixture.suite.runtime.env.ARKTS_TEST_PREPARED_EXIT_SEGMENT = "process-1"
    saveSuite(fixture)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000,
      env: { ...process.env, NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/prepared-restart-boundary.cjs"))}` } })
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.requests.length, 1)
    assert.equal(report.requests[0].correctness.equal, true)
    assert.equal(report.processSegments.length, 2)
    assert.deepEqual(report.processSegments[1].closeResult.exit, { code: 17, signal: null })
    assert.equal(report.failure?.message, "RESTART_PROCESS_EXIT_NOT_VERIFIED")
    assert.equal(report.correctness.status, "FAIL")
    assert.notEqual(report.gateStatus.ready, "PASS")
    assert.deepEqual(report.blockedScenarios, [])
  })

test("prepared restart preserves completed process requests and the unexecuted tail after postflight failure",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, true)
    fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "other-kind", kind: "typeDefinition" })
    fixture.suite.scenarios = [
      { id: "before", bucket: "first-unseen-symbol", targetId: "thing" },
      { id: "restarted", bucket: "restart-after-validated-ready", targetId: "other-kind" },
      { id: "repeat", bucket: "repeated-snapshot", targetId: "other-kind" },
      { id: "tail", bucket: "restart-after-validated-ready", targetId: "thing" },
    ]
    saveSuite(fixture)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000,
      env: { ...process.env,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/prepared-restart-boundary.cjs"))}`,
        ARKTS_TEST_PREPARED_POSTFLIGHT_RAW: `${fixture.output}.process-1.json.rss.jsonl` } })
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.requests.length, 3, JSON.stringify(report.failure))
    assert.deepEqual(report.requests.map(request => request.scenarioId), ["before", "restarted", "repeat"])
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.correctness.plannedRequests, 4)
    assert.equal(report.correctness.executedRequests, 3)
    assert.equal(report.correctness.status, "FAIL")
    assert.deepEqual(report.blockedScenarios.map(scenario => scenario.id), ["tail"])
    assert.match(report.failure.message, /Command failed:/u)
    assert.equal(report.inputIdentity.inputUnchanged, false)
    assert.equal(report.processSegments.length, 2)
    for (const memory of report.memory.segments) {
      assert.ok(fs.existsSync(path.join(fixture.directory, memory.rawSamples.file)))
    }
  })

test("prepared restart release rejects substituted process proofs and resources without dropping query rows",
  { timeout: 90_000 }, async t => {
    const fixture = await restartFixture(t, false)
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
      "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 1, run.stderr)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.correctness.status, "PASS")
    for (const [name, reason, mutate] of [
      ["wrong-request-process", "PROCESS_SEGMENT_REQUEST_BINDING_INVALID", input => {
        input.requests[0].processSegmentId = input.processSegments[0].id
      }],
      ["reused-pid", "PROCESS_SEGMENT_ARTIFACT_INVALID", input => {
        input.processSegments[1].pid = input.processSegments[0].pid
      }],
      ["missing-report", "PROCESS_SEGMENT_ARTIFACT_MISSING", input => {
        input.processSegments[1].reportArtifact.file = "absent-process.json"
      }],
      ["changed-report", "PROCESS_SEGMENT_ARTIFACT_DIGEST_MISMATCH", input => {
        input.processSegments[1].reportArtifact.sha256 = "0".repeat(64)
      }],
      ["borrowed-ready", "PROCESS_SEGMENT_BINDING_INVALID", input => {
        input.processSegments[1].readiness.semantic = input.processSegments[0].readiness.semantic
      }],
      ["borrowed-startup-ready", "PROCESS_SEGMENT_BINDING_INVALID", input => {
        input.processSegments[1].readiness.initial = input.processSegments[0].readiness.initial
      }],
      ["borrowed-resource-tree", "PROCESS_SEGMENT_MEMORY_BINDING_INVALID", input => {
        input.memory.segments[1].targetPid = input.processSegments[0].pid
      }],
    ]) {
      const input = structuredClone(report)
      mutate(input)
      const result = evaluate(name, input)
      const cell = result.cells.find(cell => cell.requests)
      assert.equal(cell.requests, 1, name)
      assert.equal(cell.gates.ready, "BLOCKED", name)
      assert.equal(cell.gates.memory, "FAIL", name)
      assert.ok(cell.reasons.includes(reason), `${name}: ${JSON.stringify(cell.reasons)}`)
      assert.equal(result.releaseEligible, false)
    }
    const raw = path.join(fixture.directory, report.memory.segments[1].rawSamples.file)
    const bytes = fs.readFileSync(raw)
    try {
      fs.appendFileSync(raw, "\n")
      const cell = evaluate("changed-raw", report).cells.find(cell => cell.requests)
      assert.equal(cell.requests, 1)
      assert.equal(cell.gates.ready, "PASS")
      assert.equal(cell.gates.correctness, "PASS")
      assert.equal(cell.gates.memory, "FAIL")
      assert.ok(cell.reasons.includes("MEMORY_RAW_ARTIFACT_DIGEST_MISMATCH"))
    } finally { fs.writeFileSync(raw, bytes) }
    const duplicate = path.join(fixture.directory, "duplicate-release.json")
    const aliasRun = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", fixture.output,
      "--prepared-report", path.join(fixture.directory, report.processSegments[1].reportArtifact.file),
      "--out", duplicate], { encoding: "utf8", timeout: 15_000 })
    assert.equal(aliasRun.status, 2, aliasRun.stderr)
    assert.match(aliasRun.stderr, /L08_DUPLICATE_REQUEST_ATTEMPT/u)
    assert.equal(fs.existsSync(duplicate), false)

    function evaluate(name, input) {
      const file = path.join(fixture.directory, `${name}.json`)
      const output = path.join(fixture.directory, `${name}-release.json`)
      fs.writeFileSync(file, JSON.stringify(input))
      const result = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
        "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", file,
        "--out", output], { encoding: "utf8", timeout: 15_000 })
      assert.equal(result.status, 1, `${name}: ${result.stderr}`)
      return JSON.parse(fs.readFileSync(output, "utf8"))
    }
  })

async function restartFixture(t, opened) {
  const fixture = await productionSuite(t)
  const use = 'import { Thing } from "./Query"\nexport const selected = new Thing()\n'
  fs.writeFileSync(path.join(fixture.suite.workspace, "Query.ets"), "export class Thing {}\n")
  fs.writeFileSync(path.join(fixture.suite.workspace, "Use.ets"), use)
  for (const args of [["add", "Query.ets", "Use.ets"], ["-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-qm", "restart entry fixture"]]) {
    const run = spawnSync("git", args, { cwd: fixture.suite.workspace, encoding: "utf8" })
    assert.equal(run.status, 0, run.stderr)
  }
  Object.assign(fixture.suite.targets[0], { file: "Use.ets",
    position: { line: 1, character: use.split("\n")[1].indexOf("Thing") + 1 },
    sourceSha256: sha256File(path.join(fixture.suite.workspace, "Use.ets")) })
  fixture.suite.readiness.candidateControl = false
  fixture.suite.preOpenTargetIds = opened ? ["thing"] : []
  fixture.suite.runtime.env.ARKTS_REFERENCES_TRACE = "0"
  fixture.suite.scenarios = [{ id: "restarted", bucket: "restart-after-validated-ready", targetId: "thing" }]
  fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
  saveSuite(fixture)
  return fixture
}
