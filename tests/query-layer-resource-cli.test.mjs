import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"
import { makeSuite, saveSuite } from "./support/prepared-suite-fixture.mjs"
import { makeQueryLayerFixture } from "./support/query-layer-fixture.mjs"

test("the real RSS sampler preserves a wall-clock rollback and records independent monotonic sample times",
  { timeout: 30_000 }, async t => {
    const fixture = await makeSuite(t)
    const output = path.join(fixture.directory, "rollback-rss.jsonl")
    const target = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
    const sampler = spawn(process.execPath, ["--require", path.resolve("tests/fixtures/rss-clock-rollback.cjs"),
      path.resolve("scripts/bench/sample-process-tree-rss.mjs"), String(target.pid), output, "10"],
    { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, ARKTS_TEST_RSS_CLOCK_ROLLBACK: "1" } })
    const closed = once(sampler, "close")
    let stderr = ""
    sampler.stderr.setEncoding("utf8")
    sampler.stderr.on("data", chunk => { stderr += chunk })
    t.after(async () => {
      if (sampler.exitCode === null) sampler.kill("SIGINT")
      await closed
      target.kill()
    })
    const read = () => fs.existsSync(output) ? fs.readFileSync(output, "utf8").trim().split("\n")
      .filter(Boolean).map(JSON.parse) : []
    const deadline = performance.now() + 10_000
    while (read().length < 4 && sampler.exitCode === null && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    sampler.kill("SIGINT")
    const exit = await closed
    if (!["darwin", "linux"].includes(process.platform)) {
      assert.deepEqual(exit, [2, null], stderr)
      assert.match(stderr, /unsupported/u)
      assert.deepEqual(read(), [])
      return
    }
    assert.deepEqual(exit, [0, null], stderr)
    const samples = read()
    assert.ok(samples.length >= 4)
    assert.ok(samples[1].timestamp < samples[0].timestamp, "never rewrite the observed wall clock")
    assert.ok(samples.every(sample => Number.isFinite(sample.monotonicMs) && sample.monotonicMs >= 0),
      "capture a genuine independent clock, not an interval inferred from reversed wall time")
    assert.ok(samples.slice(1).every((sample, index) => sample.monotonicMs > samples[index].monotonicMs))
    assert.ok(samples.every(sample => sample.processes.some(process => process.pid === target.pid && process.rssBytes > 0)))
  })

test("query layer resource CLI reports exact sampled results or explicit unsupported-platform failure",
  { timeout: 30_000 }, async t => {
    const fixture = await makeSuite(t)
    const source = "export const Thing = 1\n"
    fs.writeFileSync(path.join(fixture.suite.workspace, "Query.ets"), source)
    fs.mkdirSync(path.join(fixture.suite.sdk, "ets", "component"))
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
    for (const args of [["add", "Query.ets"],
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "resource fixture"]]) {
      assert.equal(spawnSync("git", args, { cwd: fixture.suite.workspace }).status, 0)
    }
    const oracle = fixture.suite.targets[0].oracle.path
    fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [] }))
    fixture.suite.targets[0] = { ...fixture.suite.targets[0], position: { line: 0, character: 14 },
      sourceSha256: sha256File(path.join(fixture.suite.workspace, "Query.ets")),
      oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
    fixture.suite.server = path.resolve("dist/server.cjs")
    fixture.suite.sidecar = path.resolve("target/release", process.platform === "win32"
      ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
    fixture.suite.runtime = { ...fixture.suite.runtime, env: {}, timeoutMs: 10_000 }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [path.resolve("scripts/bench/measure-query-layer.mjs"),
      "--layer", "official", "--manifest", fixture.input, "--out", fixture.output],
    { encoding: "utf8", timeout: 25_000 })
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    if (!["darwin", "linux"].includes(process.platform)) {
      assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
      assert.equal(report.status, "FAIL")
      assert.equal(report.failure, "QUERY_LAYER_RSS_SAMPLER_FAILED")
      assert.match(report.resources.samplerStderr, /unsupported/u)
      assert.equal(report.resources.sampleCount, 0)
      assert.equal(report.releaseEligible, false)
      return
    }
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}\n${JSON.stringify({
      failure: report.failure, probeStderr: report.probeStderr, samplerStderr: report.resources.samplerStderr,
    })}`)
    assert.equal(report.status, "PASS")
    assert.equal(report.layer, "official")
    assert.ok(report.requests.every(request => request.correctness.equal))
    assert.equal(report.resources.measurementKind, "external-process-tree-rss")
    assert.ok(report.resources.sampleCount >= 2)
    assert.ok(report.resources.peakNodeRssBytes > 0)
    assert.ok(report.resources.peakProductRssBytes >= report.resources.peakNodeRssBytes)
    assert.equal(report.resources.targetPid, report.pid)
    assert.notEqual(report.harnessPid, report.pid)
    assert.ok(report.resources.samples.every(sample => sample.processes.every(process => process.pid !== report.harnessPid)))
    assert.ok(fs.existsSync(report.rawProbePath))
    assert.ok(fs.existsSync(report.rawSamplesPath))
    const preparation = report.timeline?.find(event => event.phase === "preparation-start")
    assert.ok(preparation, "resource report must include the real preparation boundary")
    assert.equal(report.timeline.filter(event => event.phase === "query-start").length, 2)
    assert.equal(report.timeline.filter(event => event.phase === "query-complete").length, 2)
    assert.ok(report.resources.samples[0].timestamp <= preparation.timestamp)
    assert.ok(report.resources.samples.at(-1).timestamp >= report.timeline.findLast(event => event.phase === "query-complete").timestamp)
    const queryEnd = report.timeline.findLast(event => event.phase === "query-complete").timestamp
    const measured = report.resources.samples.filter(sample => sample.timestamp >= preparation.timestamp
      && sample.completedTimestamp >= sample.timestamp && sample.completedTimestamp <= queryEnd)
    assert.ok(measured.length > 0)
    assert.ok(measured.every(sample => sample.processes.length === 1),
      `official measurement must not keep a compiler-build child alive: ${JSON.stringify(measured)}`)
    assert.equal(report.releaseEligible, false)
  })

for (const [layer, mode] of [["official", "watchdog"], ["official", "abrupt exit"],
  ["owner", "watchdog"], ["owner", "abrupt exit"]]) {
  test(`resource ${mode} retains the completed answer and the unfinished attempt before its unexecuted tail${layer === "owner" ? " in owner" : ""}`,
  { timeout: 35_000 }, async t => {
    const source = 'import { Thing } from "./Target"\nexport const selected = "😀"; export const item = new Thing()\n'
    const point = offset => {
      const lines = source.slice(0, offset).split("\n")
      return { line: lines.length - 1, character: lines.at(-1).length }
    }
    const locations = [source.indexOf("Thing"), source.lastIndexOf("Thing")].map(offset => ({
      file: "Use.ets", range: { start: point(offset), end: point(offset + 5) },
    }))
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Target.ets": "export class Thing {}\n", "Use.ets": source },
      target: { kind: "references", file: "Use.ets", symbol: "Thing", position: point(source.lastIndexOf("Thing")),
        includeDeclaration: false }, oracle: { schemaVersion: 1, locations },
    })
    const marker = path.join(fixture.directory, "interrupted.json")
    const control = path.join(fixture.directory, "interrupt-control.json")
    fs.writeFileSync(control, JSON.stringify({ marker, ...(mode === "abrupt exit" ? { exitSignal: "SIGKILL" } : {}) }))
    fixture.suite.scenarios.push({ id: "tail", bucket: "repeated-snapshot", targetId: "thing" })
    fixture.suite.runtime.env.ARKTS_QUERY_LAYER_TEST_CONTROL_PATH = control
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const result = spawnSync(process.execPath, [path.resolve("scripts/bench/measure-query-layer.mjs"),
      "--layer", layer, "--manifest", fixture.input, "--out", fixture.output], {
      encoding: "utf8", timeout: 25_000, env: { ...process.env,
        ARKTS_QUERY_LAYER_TEST_CONTROL_PATH: control,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/query-layer-interruption.cjs"))}` },
    })
    const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
    assert.equal(report.status, "FAIL")
    assert.equal(report.releaseEligible, false)
    if (!["darwin", "linux"].includes(process.platform)) {
      assert.equal(report.failure, "QUERY_LAYER_RSS_SAMPLER_FAILED")
      assert.equal(report.resources.sampleCount, 0)
      return
    }
    const observed = JSON.parse(fs.readFileSync(marker, "utf8"))
    assert.equal(observed.pid, report.pid)
    assert.equal(observed.completed, 1)
    assert.equal(observed.scenarioId, "repeat")
    assert.equal(report.failure, mode === "watchdog" ? "QUERY_LAYER_TIMEOUT:query-start" : "QUERY_LAYER_PROBE_EXIT:SIGKILL")
    assert.equal(report.closeResult.signal, mode === "watchdog" ? "SIGTERM" : "SIGKILL")
    assert.equal(report.requests.length, 2, "do not discard the first result or pretend the second was never issued")
    assert.equal(report.requests[0].scenarioId, "first")
    assert.equal(report.requests[0].correctness.equal, true)
    assert.deepEqual(report.requests[0].locations, locations)
    assert.equal(report.requests[1].scenarioId, "repeat")
    assert.equal(report.requests[1].terminalStatus, mode === "watchdog" ? "timeout" : "error")
    assert.equal(report.requests[1].correctness.equal, false)
    assert.equal(report.requests[1].locations, undefined)
    assert.equal(report.requests[1].elapsedMs, undefined, "an unfinished request has no invented exact latency")
    assert.ok(report.requests[1].elapsedMsLowerBound >= 0)
    if (mode === "watchdog") assert.ok(report.requests[1].elapsedMsLowerBound >= fixture.suite.runtime.timeoutMs - 50)
    assert.deepEqual(report.unexecutedScenarioIds, ["tail"])
    assert.equal(report.timeline.filter(event => event.phase === "query-start").length, 2)
    assert.equal(report.timeline.filter(event => event.phase === "query-complete").length, 1)
  })
}

test("resource checkpoints preserve dependent incoming calls in official and owner layers",
  { timeout: 35_000 }, async t => {
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
    fixture.suite.scenarios = [{ id: "prepare", bucket: "first-unseen-symbol", targetId: prepare.id },
      { id: "incoming", bucket: "first-unseen-symbol", targetId: "incoming" },
      { id: "repeat-incoming", bucket: "repeated-snapshot", targetId: "incoming" }]
    saveSuite(fixture)
    for (const layer of ["official", "owner"]) {
      const output = path.join(fixture.directory, `${layer}-resources.json`)
      const result = spawnSync(process.execPath, [path.resolve("scripts/bench/measure-query-layer.mjs"),
        "--layer", layer, "--manifest", fixture.input, "--out", output], { encoding: "utf8", timeout: 25_000 })
      const report = JSON.parse(fs.readFileSync(output, "utf8"))
      assert.equal(report.releaseEligible, false)
      if (!["darwin", "linux"].includes(process.platform)) {
        assert.equal(result.status, 1)
        assert.equal(report.failure, "QUERY_LAYER_RSS_SAMPLER_FAILED")
        continue
      }
      assert.equal(result.status, 0, `${layer}: ${result.stderr}\n${report.probeStderr}`)
      assert.equal(report.status, "PASS")
      assert.ok(report.requests.every(request => request.correctness.equal))
      assert.deepEqual(report.requests.map(request => request.payload), [[item], incoming, incoming])
      assert.deepEqual(report.unexecutedScenarioIds, [])
      assert.equal(report.preparation.targetQueries, 0)
      assert.equal(report.inputIdentityUnchanged, true)
      assert.equal(report.timeline.filter(event => event.phase === "query-complete").length, 3)
    }
  })
