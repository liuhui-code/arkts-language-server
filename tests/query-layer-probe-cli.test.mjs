import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { capturePreparedIdentity, digestJson } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"
import { makeSuite, saveSuite } from "./support/prepared-suite-fixture.mjs"
import { makeQueryLayerFixture, runQueryLayerFixture } from "./support/query-layer-fixture.mjs"

const runner = path.resolve("scripts/bench/query-layer-probe.mjs")
const sidecar = path.resolve("target/release", process.platform === "win32"
  ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")

test("compiler disposal checkpoints witness actual L3 service disposal with its native caller and exact recovery",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function warmThing() { return 1 }\nexport function targetThing() { return 2 }\n" },
      target: { kind: "definition", file: "Query.ets", symbol: "warmThing", position: { line: 0, character: 16 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 25 },
      } }] },
    })
    const oracle = path.join(fixture.directory, "disposal-recovery-oracle.json")
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets", range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 27 },
    } }] }))
    fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "unseen", symbol: "targetThing",
      position: { line: 1, character: 16 }, oracle: { path: oracle, sha256: sha256File(oracle), verified: true } })
    fixture.suite.scenarios = [
      { id: "warm", targetId: "thing", bucket: "first-unseen-symbol" },
      { id: "recover", targetId: "unseen", bucket: "after-eviction" },
    ]
    fixture.suite.runtime.env = { ARKTS_BENCHMARK_CONTROL: "1", ARKTS_REFERENCES_TRACE: "1" }
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "owner", "--manifest", fixture.input,
      "--out", fixture.output, "--observe-inputs"], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.requests[1].control.eviction.reason, "memory-level3")
    const worker = report.inputOperations.workerCompilerObjects.find(record => record.entryFile === "semantic-worker.cjs")
    assert.ok(Array.isArray(worker.compilerObjects.lifecycleEvents), "record actual native service lifecycle, not inferred factory counts")
    const disposals = worker.compilerObjects.lifecycleEvents.filter(event => event.method === "dispose")
    assert.ok(disposals.length > 0)
    for (const event of disposals) {
      assert.equal(event.terminalStatus, "returned")
      assert.equal(event.elapsedMs, event.completedMs - event.startedMs)
      assert.ok(event.completedMs <= worker.observedAtMs)
      assert.ok(event.caller.some(frame => frame.includes("disposeOfficialSemanticService")))
    }
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(report.releaseEligible, false)
  })

test("owner recovery probe observes real L3 eviction before querying an unseen target",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function warmThing() { return 1 }\nexport function targetThing() { return 2 }\n" },
      target: { kind: "definition", file: "Query.ets", symbol: "warmThing", position: { line: 0, character: 16 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 25 },
      } }] },
    })
    const oracle = path.join(fixture.directory, "recovery-oracle.json")
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets", range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 27 },
    } }] }))
    fixture.suite.targets.push({ ...fixture.suite.targets[0], id: "unseen", symbol: "targetThing",
      position: { line: 1, character: 16 }, oracle: { path: oracle, sha256: sha256File(oracle), verified: true } })
    fixture.suite.scenarios = [
      { id: "warm", targetId: "thing", bucket: "first-unseen-symbol" },
      { id: "recover", targetId: "unseen", bucket: "after-eviction" },
      { id: "recover-repeat", targetId: "unseen", bucket: "pressure-recovery-repeat" },
    ]
    fixture.suite.runtime.env = { ARKTS_BENCHMARK_CONTROL: "1", ARKTS_REFERENCES_TRACE: "1" }
    saveSuite(fixture)
    const result = runQueryLayerFixture(fixture, "owner")
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}\n${JSON.stringify(result.report?.requests)}`)
    const recovery = result.report.requests[1]
    assert.equal(recovery.correctness.equal, true)
    assert.equal(recovery.control.kind, "owner-memory-level3")
    assert.equal(recovery.control.eviction.reason, "memory-level3")
    assert.equal(recovery.control.eviction.residentContextCount, 0)
    assert.equal(recovery.answerCacheHit, false)
    const repeatedRecovery = result.report.requests[2]
    assert.equal(repeatedRecovery.correctness.equal, true)
    assert.equal(repeatedRecovery.control.eviction.residentContextCount, 0)
    assert.equal(repeatedRecovery.answerCacheHit, false)
    const eviction = result.report.timeline.find(event => event.phase === "pressure-eviction-observed")
    const query = result.report.timeline.find(event => event.phase === "query-start" && event.scenarioId === "recover")
    assert.ok(eviction.monotonicMs < query.monotonicMs)
    assert.equal(result.report.inputIdentityUnchanged, true)
    assert.equal(result.report.releaseEligible, false)
  })

test("layer probes cannot label an unimplemented eviction control as a successful normal query",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n" },
      target: { kind: "definition", file: "Query.ets", symbol: "targetThing", position: { line: 0, character: 16 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    fixture.suite.scenarios[1].bucket = "after-eviction"
    saveSuite(fixture)
    for (const layer of ["official", "owner"]) {
      const result = runQueryLayerFixture(fixture, layer)
      assert.equal(result.status, 1, `${layer}: ${result.stderr}\n${result.stdout}`)
      assert.equal(result.report.status, "FAIL")
      assert.equal(result.report.requests[0].correctness.equal, true)
      assert.equal(result.report.requests[1].failure, "QUERY_LAYER_CONTROL_UNSUPPORTED:after-eviction")
      assert.equal(result.report.requests[1].correctness.equal, false)
    }
  })

test("layer probes preserve completed measurements and the terminal failure instead of dropping a session",
  { timeout: 30_000 }, async t => {
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n" },
      target: { kind: "definition", file: "Query.ets", symbol: "targetThing", position: { line: 0, character: 16 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
      } }] },
    })
    const good = fixture.suite.targets[0]
    fixture.suite.targets.push({ ...good, id: "unsupported", kind: "typeDefinition" })
    fixture.suite.scenarios = [
      { id: "good", targetId: good.id, bucket: "first-unseen-symbol" },
      { id: "unsupported", targetId: "unsupported", bucket: "first-unseen-symbol" },
      { id: "never-run", targetId: good.id, bucket: "repeated-snapshot" },
    ]
    saveSuite(fixture)
    for (const layer of ["official", "owner"]) {
      const result = runQueryLayerFixture(fixture, layer)
      assert.equal(result.status, 1, `${layer}: ${result.stderr}\n${result.stdout}`)
      assert.equal(result.report.status, "FAIL")
      assert.equal(result.report.requests.length, 2)
      assert.equal(result.report.requests[0].correctness.equal, true)
      assert.equal(result.report.requests[1].terminalStatus, "error")
      assert.equal(result.report.requests[1].failure, "QUERY_LAYER_SCENARIO_UNSUPPORTED")
      assert.equal(result.report.requests[1].correctness.equal, false)
      assert.ok(Number.isFinite(result.report.requests[1].elapsedMs))
      assert.deepEqual(result.report.unexecutedScenarioIds, ["never-run"])
      assert.ok(result.report.timeline.some(event => event.phase === "query-failed" && event.scenarioId === "unsupported"))
      assert.equal(result.report.releaseEligible, false)
    }
  })

test("official and owner incoming-call probes preserve the prepared item and exact unopened caller ranges",
  { timeout: 30_000 }, async t => {
    const query = "export function targetThing() { return 1 }\n"
    const caller = 'import { targetThing } from "./Query"\nexport function callerThing() { return targetThing() }\n'
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": query, "Use.ets": caller },
      target: { kind: "prepareCallHierarchy", file: "Query.ets", symbol: "targetThing", position: { line: 0, character: 16 } },
      oracle: { schemaVersion: 1, kind: "prepareCallHierarchy", result: [] },
    })
    const rootUri = pathToFileURL(fixture.suite.workspace).href
    const route = { arktsCallHierarchy: { protocol: 1, rootUri } }
    const item = { name: "targetThing", kind: 12,
      uri: pathToFileURL(path.join(fixture.suite.workspace, "Query.ets")).href,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: query.trimEnd().length } },
      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 27 } }, data: route }
    const incoming = [{ from: { name: "callerThing", kind: 12,
      uri: pathToFileURL(path.join(fixture.suite.workspace, "Use.ets")).href,
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: caller.trimEnd().split("\n")[1].length } },
      selectionRange: { start: { line: 1, character: 16 }, end: { line: 1, character: 27 } }, data: route },
      fromRanges: [{ start: { line: 1, character: 39 }, end: { line: 1, character: 50 } }] }]
    const prepare = fixture.suite.targets[0]
    fs.writeFileSync(prepare.oracle.path, JSON.stringify({ schemaVersion: 1, kind: "prepareCallHierarchy", result: [item] }))
    prepare.oracle.sha256 = sha256File(prepare.oracle.path)
    const incomingPath = path.join(fixture.directory, "incoming-oracle.json")
    fs.writeFileSync(incomingPath, JSON.stringify({ schemaVersion: 1, kind: "incomingCalls", result: incoming }))
    fixture.suite.targets.push({ ...prepare, id: "incoming", kind: "incomingCalls", callHierarchyTargetId: prepare.id,
      callHierarchySelector: { name: "targetThing", kind: 12 },
      oracle: { path: incomingPath, sha256: sha256File(incomingPath), verified: true } })
    fixture.suite.scenarios = [
      { id: "prepare", bucket: "first-unseen-symbol", targetId: prepare.id },
      { id: "incoming", bucket: "first-unseen-symbol", targetId: "incoming" },
      { id: "repeat-incoming", bucket: "repeated-snapshot", targetId: "incoming" },
    ]
    saveSuite(fixture)
    for (const layer of ["official", "owner"]) {
      const result = runQueryLayerFixture(fixture, layer)
      assert.equal(result.status, 0, `${layer}: ${result.stderr}\n${result.stdout}\n${JSON.stringify(result.report?.requests)}`)
      assert.ok(result.report.requests.every(request => request.correctness.equal))
      assert.deepEqual(result.report.requests[0].payload, [item])
      assert.deepEqual(result.report.requests[1].payload, incoming)
      assert.deepEqual(result.report.requests[2].payload, incoming)
      assert.equal(result.report.preparation.targetQueries, 0)
      assert.equal(result.report.inputIdentityUnchanged, true)
    }
  })

test("official and owner layers return the exact definition in an unopened module",
  { timeout: 30_000 }, async t => {
    const locations = [{ file: "Query.ets", range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 27 },
    } }]
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Query.ets": "export function targetThing() { return 1 }\n",
        "Use.ets": 'import { targetThing } from "./Query"\nexport const result = targetThing()\n' },
      target: { kind: "definition", file: "Use.ets", symbol: "targetThing", position: { line: 1, character: 22 } },
      oracle: { schemaVersion: 1, locations },
    })
    for (const layer of ["official", "owner"]) {
      const result = runQueryLayerFixture(fixture, layer)
      assert.equal(result.status, 0, `${layer}: ${result.stderr}\n${result.stdout}`)
      assert.ok(result.report.requests.every(request => request.correctness.equal))
      assert.deepEqual(result.report.requests[0].locations, locations)
      assert.equal(result.report.preparation.targetQueries, 0)
      assert.equal(result.report.inputIdentityUnchanged, true)
    }
  })

test("owner layer probe keeps the real indexed Worker path, full scope and snapshot answer cache",
  { timeout: 30_000 }, async t => {
    const fixture = await makeSuite(t)
    const source = "export class TargetThing {}\n"
    const consumer = 'import { TargetThing } from "./Query"\nexport const value = new TargetThing()\n'
    fs.writeFileSync(path.join(fixture.suite.workspace, "Query.ets"), source)
    fs.writeFileSync(path.join(fixture.suite.workspace, "Use.ets"), consumer)
    fs.mkdirSync(path.join(fixture.suite.sdk, "ets", "component"))
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
    for (const args of [["add", "Query.ets", "Use.ets"],
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "owner fixture"]]) {
      assert.equal(spawnSync("git", args, { cwd: fixture.suite.workspace }).status, 0)
    }
    const locations = [
      { file: "Use.ets", range: { start: { line: 0, character: 9 }, end: { line: 0, character: 20 } } },
      { file: "Use.ets", range: { start: { line: 1, character: 25 }, end: { line: 1, character: 36 } } },
    ]
    const oracle = fixture.suite.targets[0].oracle.path
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations }))
    fixture.suite.targets[0] = { ...fixture.suite.targets[0], symbol: "TargetThing",
      sourceSha256: sha256File(path.join(fixture.suite.workspace, "Query.ets")),
      position: { line: 0, character: 14 }, oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
    fixture.suite.server = path.resolve("dist/server.cjs")
    fixture.suite.sidecar = sidecar
    fixture.suite.runtime = { ...fixture.suite.runtime,
      env: { ARKTS_REFERENCES_RESIDENT_FIRST: "0" }, timeoutMs: 10_000 }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "owner",
      "--manifest", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.layer, "owner")
    assert.equal(report.measurementBoundary, "SEMANTIC_ENGINE_PORT_WITH_PROXY_AND_WORKER_IPC")
    assert.equal(report.preparation.semanticReadiness.semanticState, "ready")
    assert.equal(report.preparation.semanticReadiness.coverage.projectSources, 2)
    assert.equal(report.preparation.targetQueries, 0)
    assert.deepEqual(report.requests[0].locations, locations)
    assert.ok(report.requests.every(request => request.correctness.equal && request.terminalStatus === "complete"))
    assert.equal(report.requests[0].answerCacheHit, false)
    assert.equal(report.requests[1].answerCacheHit, true)
    assert.ok(report.events.some(event => event.event === "references.index.accepted"))
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(report.releaseEligible, false)
  })

test("official layer probe uses the full production host and returns exact uncached references",
  { timeout: 30_000 }, async t => {
    const fixture = await makeSuite(t)
    const source = "export class TargetThing {}\n"
    const consumer = 'import { TargetThing } from "./Query"\nexport const value = new TargetThing()\n'
    fs.writeFileSync(path.join(fixture.suite.workspace, "Query.ets"), source)
    fs.writeFileSync(path.join(fixture.suite.workspace, "Use.ets"), consumer)
    fs.mkdirSync(path.join(fixture.suite.sdk, "ets", "component"))
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"),
      "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
    for (const args of [["add", "Query.ets", "Use.ets"],
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "real compiler fixture"]]) {
      const result = spawnSync("git", args, { cwd: fixture.suite.workspace, encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr)
    }
    const locations = [
      { file: "Use.ets", range: { start: { line: 0, character: 9 }, end: { line: 0, character: 20 } } },
      { file: "Use.ets", range: { start: { line: 1, character: 25 }, end: { line: 1, character: 36 } } },
    ]
    const oracle = fixture.suite.targets[0].oracle.path
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations }))
    fixture.suite.targets[0] = { ...fixture.suite.targets[0], symbol: "TargetThing",
      sourceSha256: sha256File(path.join(fixture.suite.workspace, "Query.ets")),
      position: { line: 0, character: 14 },
      oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
    fixture.suite.server = path.resolve("dist/server.cjs")
    fixture.suite.sidecar = sidecar
    fixture.suite.runtime = { ...fixture.suite.runtime, env: {}, timeoutMs: 10_000 }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)

    const result = spawnSync(process.execPath, [runner, "--layer", "official",
      "--manifest", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.layer, "official")
    assert.equal(report.hostParity, "PRODUCTION_HOST")
    assert.equal(report.inputOperations, undefined)
    assert.equal(report.compilerIdentity.packageVersion, fixture.suite.pins.backendVersion)
    assert.equal(report.membershipFiles, 2)
    assert.equal(report.officialServiceStarts, 1)
    assert.equal(report.requests.length, 2)
    assert.ok(report.requests.every(request => request.correctness.equal && !request.answerCacheHit))
    assert.deepEqual(report.requests[0].locations, locations)
    assert.equal(report.inputIdentityUnchanged, true)
    assert.equal(report.releaseEligible, false)
  })

test("official layer probe measures a previously unqueried implementation with exact full-host locations",
  { timeout: 30_000 }, async t => {
    const fixture = await makeSuite(t)
    const source = "export interface TargetThing { value: number }\n"
      + "export class TargetImpl implements TargetThing { value = 1 }\n"
    fs.writeFileSync(path.join(fixture.suite.workspace, "Query.ets"), source)
    fs.mkdirSync(path.join(fixture.suite.sdk, "ets", "component"))
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
    for (const args of [["add", "Query.ets"],
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "implementation fixture"]]) {
      const result = spawnSync("git", args, { cwd: fixture.suite.workspace, encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr)
    }
    const locations = [{ file: "Query.ets", range: {
      start: { line: 1, character: 13 }, end: { line: 1, character: 23 },
    } }]
    const oracle = fixture.suite.targets[0].oracle.path
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations }))
    fixture.suite.targets[0] = { ...fixture.suite.targets[0], kind: "implementation", symbol: "TargetThing",
      sourceSha256: sha256File(path.join(fixture.suite.workspace, "Query.ets")),
      position: { line: 0, character: 18 }, oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
    fixture.suite.server = path.resolve("dist/server.cjs")
    fixture.suite.sidecar = sidecar
    fixture.suite.runtime = { ...fixture.suite.runtime, env: {}, timeoutMs: 10_000 }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "official",
      "--manifest", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.deepEqual(report.requests[0].locations, locations)
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.membershipFiles, 1)
  })

test("official layer probe uses edited overlay bytes and the pinned edit oracle without changing disk input",
  { timeout: 30_000 }, async t => {
    const fixture = await makeSuite(t)
    const source = "export class TargetThing {}\n"
    fs.writeFileSync(path.join(fixture.suite.workspace, "Query.ets"), source)
    fs.mkdirSync(path.join(fixture.suite.sdk, "ets", "component"))
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
    for (const args of [["add", "Query.ets"],
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "overlay fixture"]]) {
      assert.equal(spawnSync("git", args, { cwd: fixture.suite.workspace }).status, 0)
    }
    const oracle = fixture.suite.targets[0].oracle.path
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [] }))
    fixture.suite.targets[0] = { ...fixture.suite.targets[0], symbol: "TargetThing",
      sourceSha256: sha256File(path.join(fixture.suite.workspace, "Query.ets")),
      position: { line: 0, character: 14 }, oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
    const locations = [{ file: "Query.ets", range: {
      start: { line: 1, character: 25 }, end: { line: 1, character: 36 },
    } }]
    const editedOracle = path.join(fixture.directory, "edited-oracle.json")
    fs.writeFileSync(editedOracle, JSON.stringify({ schemaVersion: 1, locations }))
    const changes = [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } },
      newText: "export const value = new TargetThing()\n" }]
    fixture.suite.scenarios = [{ id: "edited", targetId: "thing", bucket: "edit-reference",
      edit: { file: "Query.ets", changes, sha256: digestJson(changes),
        oracle: { path: editedOracle, sha256: sha256File(editedOracle), verified: true } } }]
    fixture.suite.server = path.resolve("dist/server.cjs")
    fixture.suite.sidecar = sidecar
    fixture.suite.runtime = { ...fixture.suite.runtime, env: {}, timeoutMs: 10_000 }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "official",
      "--manifest", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.deepEqual(report.requests[0].locations, locations)
    assert.equal(report.requests[0].correctness.equal, true)
    assert.equal(fs.readFileSync(path.join(fixture.suite.workspace, "Query.ets"), "utf8"), source)
  })

test("official layer preparation records missing necessary inputs without pre-querying targets",
  { timeout: 30_000 }, async t => {
    const fixture = await makeSuite(t)
    const source = 'import { Absent } from "@ohos.missing"\nexport class TargetThing {}\n'
      + "export const value = new TargetThing()\n"
    fs.writeFileSync(path.join(fixture.suite.workspace, "Query.ets"), source)
    fs.mkdirSync(path.join(fixture.suite.sdk, "ets", "component"))
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
    for (const args of [["add", "Query.ets"],
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "missing input fixture"]]) {
      assert.equal(spawnSync("git", args, { cwd: fixture.suite.workspace }).status, 0)
    }
    const oracle = fixture.suite.targets[0].oracle.path
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets", range: {
      start: { line: 2, character: 25 }, end: { line: 2, character: 36 },
    } }] }))
    fixture.suite.targets[0] = { ...fixture.suite.targets[0], symbol: "TargetThing",
      sourceSha256: sha256File(path.join(fixture.suite.workspace, "Query.ets")),
      position: { line: 1, character: 14 }, oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
    fixture.suite.server = path.resolve("dist/server.cjs")
    fixture.suite.sidecar = sidecar
    fixture.suite.runtime = { ...fixture.suite.runtime, env: {}, timeoutMs: 10_000 }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [runner, "--layer", "official",
      "--manifest", fixture.input, "--out", fixture.output], { encoding: "utf8", timeout: 25_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(report.preparation?.semanticReadiness?.semanticState, "degraded")
    assert.ok(report.preparation.semanticReadiness.unavailableReasons.includes("dependency-inputs-incomplete"))
    assert.equal(report.preparation.targetQueries, 0)
    assert.ok(report.requests.every(request => request.correctness.equal))
  })
