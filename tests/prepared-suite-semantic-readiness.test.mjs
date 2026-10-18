import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { capturePreparedIdentity, digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"
import { makeSuite, productionSuite, reportedProof, saveSuite } from "./support/prepared-suite-fixture.mjs"

test("prepared benchmark observes a real root Program before target queries without certifying unbound samples",
  { timeout: 40_000 }, async t => {
    const fixture = await productionSuite(t)
    const run = execute(fixture)
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.readiness.candidate.state, "ready", JSON.stringify(report.failure))
    assert.equal(report.readiness.semantic.status, "READY", JSON.stringify(report.readiness))
    const observed = report.readiness.semantic.observed
    assert.equal(observed.rootUri, pathToFileURL(fixture.suite.workspace).href)
    assert.equal(observed.inputIdentity.canonicalRoot, fs.realpathSync(fixture.suite.workspace))
    assert.equal(observed.inputIdentity.backend.packageVersion, fixture.suite.pins.backendVersion)
    assert.equal(observed.coverage.projectSources, 1)
    assert.equal(observed.coverage.dependenciesComplete, true)
    assert.equal(observed.readyCapabilities.length, 14)
    assert.equal(observed.semanticGeneration.split(":").at(-1), observed.inputIdentity.sha256)
    assert.ok(report.preparation.timeToSemanticReadyMs > 0)
    assert.ok(report.preparation.semanticPreparationMs > 0)
    assert.equal(report.preparation.targetQueries, 0)
    const sent = report.transcript.transcript.entries.filter(entry => entry.direction === "send")
    const prepare = sent.findIndex(entry => entry.method === "arkts/semanticReadiness")
    assert.ok(prepare >= 0, "public root preparation request must actually be sent")
    const query = sent.findIndex(entry => entry.method === "textDocument/definition")
    assert.ok(query > prepare, "preparation must not prequery the target answer")
    assert.ok(report.requests.every(request => request.measurementState === "candidate-ready-control"))
    assert.notEqual(report.gateStatus.ready, "PASS", "observation alone cannot certify request generations")
    assert.equal(report.gateStatus.latency, "BLOCKED")
    assert.ok(report.bucketSummaries.every(bucket => bucket.reason === "REQUEST_GENERATION_NOT_VERIFIED"),
      "supported root readiness must not be mislabeled as an unsupported public contract")
    assert.equal(report.inputIdentity.inputUnchanged, true)
    assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
    assert.equal(report.memory.samplerStderr, "")
  })

test("prepared benchmark rejects a public ready label without the Program input and coverage proof", async t => {
  const fixture = await makeSuite(t, "missing-ready-proof")
  fixture.suite.readiness.candidateControl = false
  saveSuite(fixture)
  const run = execute(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.readiness.semantic.status, "READINESS_INVALID", JSON.stringify(report.readiness))
  assert.equal(report.preparation.timeToSemanticReadyMs, null)
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(report.requests.length, 0)
  assert.ok(report.bucketSummaries.every(bucket => bucket.unexecutedSamples === bucket.plannedSamples))
  assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
})

test("prepared benchmark cannot observe ready from incomplete or differently pinned input identities", async t => {
  const fixture = await makeSuite(t, "reported-readiness")
  const report = reportedProof(fixture)
  const input = report.inputIdentity
  fixture.suite.readiness.candidateControl = false
  for (const [name, inputIdentity] of [
    ["malformed-options", { ...input, optionsSha256: "bad" }],
    ["missing-counter", Object.fromEntries(Object.entries(input).filter(([key]) => key !== "engineGeneration"))],
    ["foreign-canonical-root", { ...input, canonicalRoot: fixture.directory }],
    ["different-backend", { ...input, backend: { ...input.backend, packageVersion: "other-compiler" } }],
    ["different-compiler-bytes", { ...input, backend: { ...input.backend, compilerSha256: "0".repeat(64) } }],
    ["incomplete-backend", { ...input, backend: {} }],
  ]) {
    fixture.output = path.join(fixture.directory, `${name}-report.json`)
    fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS = JSON.stringify({ ...report, inputIdentity })
    saveSuite(fixture)
    const run = execute(fixture)
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const result = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(result.readiness.semantic.status, "READINESS_INVALID", `${name}: ${JSON.stringify(result.readiness)}`)
    assert.equal(result.preparation.timeToSemanticReadyMs, null)
    assert.equal(result.gateStatus.ready, "FAIL")
    assert.equal(result.requests.length, 0)
  }
})

test("prepared benchmark requires the complete input proof to stay identical despite unchanged generation labels", async t => {
  const fixture = await makeSuite(t, "reported-readiness")
  const initial = reportedProof(fixture)
  const validation = { ...initial, inputIdentity: { ...initial.inputIdentity, optionsSha256: "0".repeat(64) } }
  fixture.suite.readiness.candidateControl = false
  fixture.suite.preOpenTargetIds = ["thing"]
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS = JSON.stringify(initial)
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS_VALIDATION = JSON.stringify(validation)
  saveSuite(fixture)
  const run = execute(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.readiness.semantic.status, "READY")
  assert.equal(report.readiness.validation.status, "READY")
  assert.deepEqual(report.readiness.semantic.observed, initial)
  assert.deepEqual(report.readiness.validation.observed, validation)
  assert.equal(initial.semanticGeneration, validation.semanticGeneration)
  assert.equal(initial.inputIdentity.sha256, validation.inputIdentity.sha256)
  assert.equal(report.requests.length, 2)
  assert.equal(report.correctness.status, "PASS")
  assert.equal(report.gateStatus.ready, "BLOCKED")
  assert.ok(report.requests.every(request => request.measurementState === "post-semantic-ready-unverified"
    && request.readiness.verified === false))
  assert.ok(report.bucketSummaries.every(bucket => bucket.readyStatus === "BLOCKED"
    && bucket.reason === "REQUEST_GENERATION_NOT_VERIFIED"))
  assert.equal(report.timeline.find(event => event.phase === "semantic-readiness-validation-complete").current, false)
  assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
})

test("prepared benchmark cannot certify changed Program coverage under an identical input identity", async t => {
  const fixture = await makeSuite(t, "reported-readiness")
  const initial = reportedProof(fixture)
  const validation = { ...initial, coverage: { ...initial.coverage, programSources: 4 } }
  fixture.suite.readiness.candidateControl = false
  fixture.suite.preOpenTargetIds = ["thing"]
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS = JSON.stringify(initial)
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS_VALIDATION = JSON.stringify(validation)
  saveSuite(fixture)
  const run = execute(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.readiness.semantic.status, "READY")
  assert.equal(report.readiness.validation.status, "READY")
  assert.deepEqual(report.readiness.semantic.observed.inputIdentity, report.readiness.validation.observed.inputIdentity)
  assert.equal(report.readiness.semantic.observed.coverage.programSources, 3)
  assert.equal(report.readiness.validation.observed.coverage.programSources, 4)
  assert.equal(report.requests.length, 2)
  assert.equal(report.correctness.status, "PASS")
  assert.equal(report.gateStatus.ready, "BLOCKED")
  assert.ok(report.requests.every(request => request.readiness.verified === false))
  assert.equal(report.timeline.find(event => event.phase === "semantic-readiness-validation-complete").current, false)
})

test("changed ready labels cannot certify a body edit while its actual overlay proof remains stale", async t => {
  const fixture = await makeSuite(t, "reported-readiness")
  const initial = reportedProof(fixture)
  const changed = { ...initial, semanticGeneration: initial.semanticGeneration.replace(/a{64}$/, "1".repeat(64)),
    inputIdentity: { ...initial.inputIdentity, sha256: "1".repeat(64) } }
  fixture.suite.readiness.candidateControl = false
  fixture.suite.preOpenTargetIds = ["thing"]
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS = JSON.stringify(initial)
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS_VALIDATION = JSON.stringify(changed)
  const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: "// body edit\n" }]
  fixture.suite.scenarios = [fixture.suite.scenarios[0], { id: "body", bucket: "edit-body", targetId: "thing",
    edit: { file: "Query.ets", changes, sha256: digestJson(changes), oracle: fixture.suite.targets[0].oracle } }]
  saveSuite(fixture)
  const run = execute(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.requests.length, 2)
  assert.equal(report.requests[1].documentVersion, 2)
  assert.equal(report.requests[1].readiness.snapshot, 1)
  assert.equal(report.requests[1].readiness.observed.semanticGeneration, changed.semanticGeneration)
  assert.equal(report.requests[1].readiness.verified, false)
  assert.equal(report.requests[1].measurementState, "post-semantic-ready-unverified")
  assert.equal(report.gateStatus.ready, "BLOCKED")
  assert.equal(report.timeline.findLast(event => event.phase === "semantic-readiness-query-validation-complete").current, false)
  assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
})

test("prepared benchmark retains the real compiler missing-input diagnosis instead of reporting unsupported readiness",
  { timeout: 40_000 }, async t => {
    const fixture = await productionSuite(t)
    const sourcePath = path.join(fixture.suite.workspace, "Query.ets")
    const missing = 'import { Missing } from "./absent"\nexport const value: Missing = 1\n'
    fs.writeFileSync(sourcePath, fs.readFileSync(sourcePath, "utf8") + missing)
    const commit = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "-am", "missing analysis input", "-q"], { cwd: fixture.suite.workspace, encoding: "utf8" })
    assert.equal(commit.status, 0, commit.stderr)
    fixture.suite.targets[0].sourceSha256 = sha256File(sourcePath)
    fixture.suite.readiness.candidateControl = false
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const run = execute(fixture)
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.readiness.candidate.state, "ready", JSON.stringify(report.failure))
    assert.equal(report.readiness.semantic.status, "DEGRADED", JSON.stringify(report.readiness))
    const observed = report.readiness.semantic.observed
    assert.equal(observed.semanticGeneration, null)
    assert.deepEqual(observed.readyCapabilities, [])
    assert.deepEqual(observed.unavailableReasons, ["dependency-inputs-incomplete"])
    assert.equal(observed.unavailableInput.code, 2307)
    assert.equal(observed.unavailableInput.uri, pathToFileURL(sourcePath).href)
    assert.deepEqual(observed.unavailableInput.position, { line: 2, character: missing.indexOf('"./absent"') })
    assert.equal(report.preparation.timeToSemanticReadyMs, null)
    assert.ok(report.preparation.semanticPreparationMs > 0)
    assert.equal(report.preparation.targetQueries, 0)
    assert.equal(report.requests.length, 0)
    assert.equal(report.gateStatus.ready, "FAIL")
    assert.equal(report.inputIdentity.inputUnchanged, true)
    assert.ok(report.bucketSummaries.every(bucket => bucket.reason === "SEMANTIC_INPUTS_UNAVAILABLE"))
    assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
  })

test("prepared benchmark admits exact unseen and repeated requests under one verified ready snapshot",
  { timeout: 40_000 }, async t => {
    const fixture = await productionSuite(t)
    fixture.suite.readiness.candidateControl = false
    fixture.suite.preOpenTargetIds = ["thing"]
    saveSuite(fixture)
    const run = execute(fixture)
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.requests.length, 2, JSON.stringify({ readiness: report.readiness, failure: report.failure }))
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.gateStatus.ready, "PASS", JSON.stringify(report.readiness))
    assert.equal(report.gateStatus.latency, "BLOCKED", "two trace-on observations cannot graduate the release SLO")
    assert.equal(report.readiness.validation.status, "READY")
    assert.deepEqual(report.readiness.validation.observed, report.readiness.semantic.observed)
    for (const request of report.requests) {
      assert.equal(request.measurementState, "semantic-ready-snapshot")
      assert.equal(request.readiness.verified, true)
      assert.equal(request.readiness.originGeneration, report.readiness.semantic.observed.semanticGeneration)
      assert.equal(request.readiness.originInputSha256, report.readiness.semantic.observed.inputIdentity.sha256)
      assert.equal(request.documentVersion, 1)
      assert.equal(request.status, "COMPLETE")
      assert.equal(request.correctness.equal, true)
      assert.ok(Number.isFinite(request.elapsedMs) && request.elapsedMs > 0)
    }
    const phases = report.timeline.map(event => event.phase)
    assert.ok(phases.indexOf("didOpen-sent") < phases.indexOf("semantic-readiness-request-start"))
    assert.ok(phases.indexOf("semantic-readiness-response-complete") < phases.indexOf("request-start"))
    assert.ok(phases.indexOf("semantic-readiness-validation-start") > phases.lastIndexOf("request-complete"))
    assert.equal(phases.filter(phase => phase === "semantic-readiness-request-start").length, 1)
    assert.equal(report.preparation.targetQueries, 0)
    assert.ok(report.bucketSummaries.every(bucket => bucket.measurementState === "semantic-ready-snapshot"
      && bucket.readyStatus === "PASS" && bucket.gateStatus === "BLOCKED"))
    assert.equal(report.inputIdentity.inputUnchanged, true)
    assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
  })

test("prepared benchmark certifies immediate body edits against new query-bound proof instead of the old ready proof",
  { timeout: 40_000 }, async t => {
    const fixture = await productionSuite(t)
    const sourcePath = path.join(fixture.suite.workspace, "Query.ets")
    const source = fs.readFileSync(sourcePath, "utf8") + "export function count() { return 1 }\n"
    fs.writeFileSync(sourcePath, source)
    const commit = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid",
      "commit", "-am", "ordinary body edit fixture", "-q"], { cwd: fixture.suite.workspace, encoding: "utf8" })
    assert.equal(commit.status, 0, commit.stderr)
    const target = fixture.suite.targets[0]
    target.sourceSha256 = sha256File(sourcePath)
    const character = source.split("\n")[2].indexOf("1")
    const changes = [{ range: { start: { line: 2, character }, end: { line: 2, character: character + 1 } }, newText: "2" }]
    fixture.suite.readiness.candidateControl = false
    fixture.suite.preOpenTargetIds = ["thing"]
    fixture.suite.scenarios = [fixture.suite.scenarios[0],
      { id: "body", bucket: "edit-body", targetId: "thing", edit: {
        file: "Query.ets", changes, sha256: digestJson(changes), oracle: target.oracle,
      } }, fixture.suite.scenarios[1]]
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const run = execute(fixture)
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.requests.length, 3, JSON.stringify({ failure: report.failure, blocked: report.blockedScenarios }))
    assert.equal(report.readiness.semantic.status, "READY")
    assert.equal(report.readiness.validation.status, "READY", JSON.stringify(report.readiness.validation))
    assert.notEqual(report.readiness.validation.observed.semanticGeneration, report.readiness.semantic.observed.semanticGeneration)
    assert.notEqual(report.readiness.validation.observed.inputIdentity.sha256, report.readiness.semantic.observed.inputIdentity.sha256)
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.gateStatus.ready, "PASS")
    assert.equal(report.gateStatus.latency, "BLOCKED", "three fixture samples do not graduate release latency")
    assert.deepEqual(report.requests.map(request => request.documentVersion), [1, 2, 2])
    assert.deepEqual(report.requests.map(request => request.readiness.snapshot), [0, 1, 1])
    assert.ok(report.requests.every(request => request.status === "COMPLETE" && request.correctness.equal
      && request.measurementState === "semantic-ready-snapshot" && request.readiness.verified === true
      && request.readiness.originGeneration === report.readiness.semantic.observed.semanticGeneration))
    const proofs = report.requests.map(request => request.readiness.observed)
    assert.deepEqual(proofs[0], report.readiness.semantic.observed)
    assert.notEqual(proofs[1].inputIdentity.sha256, proofs[0].inputIdentity.sha256)
    assert.deepEqual(proofs[2], proofs[1])
    assert.deepEqual(report.readiness.validation.observed, proofs[2])
    const phases = report.timeline.map(event => event.phase)
    assert.equal(phases[phases.indexOf("didChange-sent") + 1], "request-start",
      "ordinary edits cannot preprepare or wait for settled diagnostics before timing")
    const readyRequests = report.transcript.transcript.entries.filter(entry => entry.direction === "send"
      && entry.method === "arkts/semanticReadiness")
    assert.equal(readyRequests.length, 5, "initial preparation, three read-only query receipts and final validation")
    assert.equal(report.timeline.filter(event => event.phase === "semantic-readiness-request-start" && event.prepare === true).length, 1)
    assert.ok(report.timeline.filter(event => event.phase === "semantic-readiness-query-validation-start"
      || event.phase === "semantic-readiness-validation-start").every(event => event.prepare === false))
    assert.equal(phases.filter(phase => phase === "semantic-readiness-request-start").length, 1)
    assert.equal(report.preparation.targetQueries, 0)
    assert.equal(report.gateStatus.diagnostics, "PASS")
    assert.equal(report.inputIdentity.inputUnchanged, true)
    assert.equal(fs.readFileSync(sourcePath, "utf8"), source, "the edit must remain an unsaved overlay")
    assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
    const out = path.join(fixture.directory, "edited-release.json")
    const release = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"),
      "--prepared-report", fixture.output, "--out", out], { encoding: "utf8" })
    assert.equal(release.status, 1, release.stderr)
    const cell = JSON.parse(fs.readFileSync(out, "utf8")).cells.find(cell => cell.bucket === "edit-body" && cell.requests)
    assert.equal(cell.gates.ready, "PASS", "final consumer must bind the actual current overlay, not require the old generation")
    assert.equal(cell.gates.latency, "BLOCKED")
    report.requests[1].readiness.expectedOverlaysSha256 = "0".repeat(64)
    fs.writeFileSync(fixture.output, JSON.stringify(report))
    const staleOut = path.join(fixture.directory, "stale-edited-release.json")
    const stale = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"),
      "--prepared-report", fixture.output, "--out", staleOut], { encoding: "utf8" })
    assert.equal(stale.status, 1, stale.stderr)
    assert.equal(JSON.parse(fs.readFileSync(staleOut)).cells.find(cell => cell.bucket === "edit-body" && cell.requests).gates.ready, "BLOCKED")
  })

test("prepared benchmark verifies a genuine unopened query against its unchanged actual ready proof",
  { timeout: 40_000 }, async t => {
    const fixture = await productionSuite(t)
    fixture.suite.readiness.candidateControl = false
    fixture.suite.scenarios = [{ id: "closed-first", bucket: "first-unopened-module", targetId: "thing" }]
    saveSuite(fixture)
    const run = execute(fixture)
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.requests.length, 1, JSON.stringify({ failure: report.failure, blocked: report.blockedScenarios }))
    const request = report.requests[0]
    assert.equal(request.bucket, "first-unopened-module")
    assert.equal(request.measurementState, "semantic-ready-snapshot")
    assert.equal(request.readiness.verified, true)
    assert.equal(request.status, "COMPLETE")
    assert.equal(request.correctness.equal, true)
    assert.deepEqual(request.correctness.locations, [{ file: "Query.ets", range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 18 },
    } }])
    assert.deepEqual(request.correctness.missing, [])
    assert.equal(report.gateStatus.ready, "PASS")
    assert.equal(report.correctness.status, "PASS")
    assert.equal(report.bucketSummaries[0].readyStatus, "PASS")
    assert.equal(report.gateStatus.diagnostics, "PASS")
    const phases = report.timeline.map(event => event.phase)
    assert.ok(phases.indexOf("didOpen-sent") > phases.indexOf("request-complete"))
    assert.ok(phases.indexOf("didOpen-sent") > phases.indexOf("semantic-readiness-validation-complete"))
    const sent = report.transcript.transcript.entries.filter(entry => entry.direction === "send")
    assert.ok(sent.findIndex(entry => entry.method === "textDocument/didOpen")
      > sent.findIndex(entry => entry.method === "textDocument/definition"))
    assert.equal(sent.filter(entry => entry.method === "textDocument/definition").length, 1)
    assert.equal(report.preparation.targetQueries, 0)
    assert.deepEqual(report.readiness.validation.observed, report.readiness.semantic.observed)
    assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
  })

test("prepared benchmark rejects an injected empty unopened reply despite an unchanged reported proof", async t => {
  const fixture = await makeSuite(t, "reported-readiness")
  const proof = reportedProof(fixture)
  fixture.suite.readiness.candidateControl = false
  fixture.suite.scenarios = [{ id: "closed-empty", bucket: "first-unopened-module", targetId: "thing" }]
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_READINESS = JSON.stringify(proof)
  fixture.suite.runtime.env.ARKTS_TEST_PREPARED_EMPTY_UNOPENED = "1"
  saveSuite(fixture)
  const run = execute(fixture)
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.requests.length, 1)
  const request = report.requests[0]
  assert.equal(request.readiness.verified, true)
  assert.equal(request.status, "COMPLETE")
  assert.deepEqual(request.correctness.locations, [])
  assert.equal(request.correctness.equal, false)
  assert.deepEqual(request.correctness.missing, request.correctness.expectedLocations)
  assert.equal(request.correctness.missing.length, 1)
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(report.correctness.status, "FAIL")
  assert.equal(report.bucketSummaries[0].reason, "EXACT_QUERY_FAILED")
  assert.deepEqual(report.readiness.semantic.observed, proof)
  assert.deepEqual(report.readiness.validation.observed, proof)
  const phases = report.timeline.map(event => event.phase)
  assert.ok(phases.indexOf("didOpen-sent") > phases.indexOf("semantic-readiness-validation-complete"))
  assert.equal(report.preparation.targetQueries, 0)
  assert.equal(report.gateStatus.diagnostics, "PASS")
  assert.deepEqual(report.closeResult.exit, { code: 0, signal: null })
})

test("final release matrix consumes actual query-bound ready proof without graduating insufficient samples",
  { timeout: 40_000 }, async t => {
    const fixture = await productionSuite(t)
    fixture.suite.readiness.candidateControl = false
    fixture.suite.preOpenTargetIds = ["thing"]
    fixture.suite.runtime.env.ARKTS_REFERENCES_TRACE = "0"
    saveSuite(fixture)
    const run = execute(fixture)
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const prepared = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(prepared.gateStatus.ready, "PASS", JSON.stringify(prepared.failure))
    const out = path.join(fixture.directory, "release.json")
    const release = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"),
      "--prepared-report", fixture.output, "--out", out], { encoding: "utf8" })
    assert.equal(release.status, 1, release.stderr)
    const report = JSON.parse(fs.readFileSync(out, "utf8"))
    const cells = report.cells.filter(cell => cell.requests)
    assert.equal(cells.length, 2)
    for (const cell of cells) {
      assert.equal(cell.gates.ready, "PASS")
      assert.equal(cell.gates.correctness, "PASS")
      assert.equal(cell.gates.latency, "BLOCKED")
      assert.equal(cell.measurementState, "semantic-ready-snapshot")
      assert.ok(cell.inputGroups[0].reasons.includes("INSUFFICIENT_REQUESTS"))
      assert.ok(cell.inputGroups[0].reasons.includes("INSUFFICIENT_SESSIONS"))
    }
    assert.equal(report.releaseEligible, false)
    for (const [name, mutate] of [
      ["missing-proof", value => { delete value.requests[0].readiness.observed }],
      ["stale-generation", value => { value.requests[0].readiness.originGeneration = "old" }],
      ["changed-coverage", value => { value.requests[0].readiness.observed.coverage.programSources++ }],
      ["changed-postflight", value => { value.inputIdentity.postflightPins.backendSha256 = "0".repeat(64) }],
    ]) {
      const changed = structuredClone(prepared)
      mutate(changed)
      fs.writeFileSync(fixture.output, JSON.stringify(changed))
      const alteredOut = path.join(fixture.directory, `${name}.json`)
      const altered = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
        "--matrix", path.resolve("config/semantic-release-matrix.json"),
        "--prepared-report", fixture.output, "--out", alteredOut], { encoding: "utf8" })
      assert.equal(altered.status, 1, altered.stderr)
      assert.equal(JSON.parse(fs.readFileSync(alteredOut)).cells.find(cell => cell.bucket === "first-unseen-symbol" && cell.requests).gates.ready, "BLOCKED", name)
    }
  })

test("final matrix classifies 100 actual repeat requests across five real fixture processes without graduating missing cells",
  { timeout: 120_000 }, async t => {
    const fixture = await productionSuite(t)
    fixture.suite.readiness.candidateControl = false
    fixture.suite.preOpenTargetIds = ["thing"]
    fixture.suite.runtime.env.ARKTS_REFERENCES_TRACE = "0"
    fixture.suite.scenarios = [fixture.suite.scenarios[0], ...Array.from({ length: 20 }, (_, index) =>
      ({ id: `repeat-${index}`, bucket: "repeated-snapshot", targetId: "thing" }))]
    saveSuite(fixture)
    const evidence = []
    const pids = new Set()
    for (let index = 0; index < 5; index++) {
      fixture.output = path.join(fixture.directory, `session-${index}.json`)
      const run = execute(fixture)
      assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
      const report = JSON.parse(fs.readFileSync(fixture.output))
      assert.equal(report.gateStatus.ready, "PASS", JSON.stringify(report.failure))
      assert.equal(report.correctness.status, "PASS")
      pids.add(report.memory.targetPid)
      evidence.push("--prepared-report", fixture.output)
    }
    assert.equal(pids.size, 5, "independence requires five actual product processes")
    const out = path.join(fixture.directory, "five-session-release.json")
    const run = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
      "--matrix", path.resolve("config/semantic-release-matrix.json"), ...evidence, "--out", out], { encoding: "utf8" })
    assert.equal(run.status, 1, run.stderr)
    const report = JSON.parse(fs.readFileSync(out))
    const cell = report.cells.find(cell => cell.platform === process.platform && cell.capability === "definition" && cell.bucket === "repeated-snapshot")
    assert.equal(cell.inputGroups.length, 1)
    assert.equal(cell.requests, 100)
    assert.equal(cell.sessions, 5)
    assert.equal(cell.gates.ready, "PASS")
    assert.equal(cell.gates.latency, cell.observedLatencyMs.p95 <= 550 ? "PASS" : "FAIL")
    assert.equal(cell.gates.memory, "BLOCKED", "real RSS is not the independent PSS release contract")
    const memories = cell.inputGroups[0].memoryEvidence
    assert.equal(memories.length, 5)
    assert.ok(memories.every(item => item.status === "PASS" && item.intervalClock === "sampler-monotonic-ms" && item.sampleCount > 0
      && item.peakNodeRssBytes > 0 && item.peakProductRssBytes >= item.peakNodeRssBytes
      && item.reasons.includes("RSS_NOT_PSS_RELEASE_EVIDENCE")), JSON.stringify(memories))
    assert.equal(report.cells.find(cell => cell.platform !== process.platform && cell.capability === "definition").gates.latency, "NOT_RUN")
    assert.equal(report.releaseEligible, false, "fixture proof classification is not a Settings product release")
  })

function execute(fixture) {
  return spawnSync(process.execPath, [path.resolve("scripts/bench/replay-references.mjs"),
    "--prepared-suite", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 30_000 })
}
