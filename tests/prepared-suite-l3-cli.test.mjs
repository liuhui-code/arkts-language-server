import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"
import { makeSuite, saveSuite } from "./support/prepared-suite-fixture.mjs"

const runner = path.resolve("scripts/bench/replay-references.mjs")

test("prepared suite completes its real minimum idle observation after an early timer callback", async t => {
  const fixture = await makeSuite(t)
  fixture.suite.runtime.postIdleMs = 200
  saveSuite(fixture)
  const receiptPath = path.join(fixture.directory, "early-timer.json")
  const run = spawnSync(process.execPath,
    [runner, "--prepared-suite", fixture.input, "--out", fixture.output], {
      encoding: "utf8", timeout: 15_000, env: { ...process.env,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/prepared-observation-early-timer.cjs"))}`,
        ARKTS_TEST_OBSERVATION_TIMER_MS: "200", ARKTS_TEST_OBSERVATION_TIMER_RECEIPT: receiptPath },
    })
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"))
  const idleStart = report.timeline.find(event => event.phase === "post-query-idle-start")
  const idleEnd = report.timeline.find(event => event.phase === "post-query-idle-complete")
  const elapsedMs = idleStart && idleEnd && idleEnd.monotonicMs - idleStart.monotonicMs
  t.diagnostic(JSON.stringify({ idleStart, idleEnd, elapsedMs, receipt }))
  assert.equal(report.correctness.status, "PASS")
  assert.equal(report.requests.length, 2)
  assert.ok(report.requests.every(request => request.status === "COMPLETE" && request.correctness.equal))
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(report.gateStatus.latency, "BLOCKED")
  assert.ok(receipt.callbackElapsedMs < 200, "the timer control must really complete before the observation deadline")
  assert.equal(idleStart?.durationMs, 200)
  assert.ok(idleStart && idleEnd && elapsedMs >= 200,
    `real idle observation must reach its configured minimum: ${JSON.stringify({ elapsedMs, receipt })}`)
})

for (const { recoveredBeforeControl, earlyObservationTimer } of [
  { recoveredBeforeControl: false },
  { recoveredBeforeControl: true },
  { recoveredBeforeControl: false, earlyObservationTimer: true },
]) {
test(earlyObservationTimer ? "prepared suite completes its real minimum post-eviction observation after an early timer callback"
  : recoveredBeforeControl ? "prepared suite verifies recovery when natural L3 already disposed the context"
  : "prepared suite recovers an exact unseen reference after observed L3 eviction", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-prepared-l3-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  const source = [
    "export class WarmThing {}",
    "export const warmValue = new WarmThing()",
    "export class ColdThing {}",
    "export const coldValue = new ColdThing()",
    "",
  ].join("\n")
  const sourcePath = path.join(workspace, "Query.ets")
  fs.writeFileSync(sourcePath, source)
  for (const args of [["init", "-q"], ["add", "Query.ets"],
    ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]]) {
    const git = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
    assert.equal(git.status, 0, git.stderr)
  }
  const lines = source.split("\n")
  const span = (line, symbol) => {
    const character = lines[line].indexOf(symbol)
    assert.ok(character >= 0)
    return { start: { line, character }, end: { line, character: character + symbol.length } }
  }
  const oracle = (name, symbol, declarationLine, usageLine) => {
    const file = path.join(directory, `${name}-oracle.json`)
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, locations: [
      { file: "Query.ets", range: span(declarationLine, symbol) },
      { file: "Query.ets", range: span(usageLine, symbol) },
    ] }))
    return { path: file, sha256: sha256File(file), verified: true }
  }
  const server = path.resolve("dist/server.cjs")
  const sidecar = path.resolve("target/release/arkts-index-sidecar")
  const suite = {
    schemaVersion: 1, benchmarkId: "prepared-l3-real-lsp", seed: 20261006,
    workspace, sdk, server, sidecar,
    pins: await capturePreparedIdentity({ workspace, sdk, server, sidecar }),
    runtime: { timeoutMs: 30_000, diagnosticTimeoutMs: 30_000, sampleIntervalMs: 25,
      postIdleMs: 200, afterEvictionObservationMs: 120,
      env: { ARKTS_REFERENCES_STRATEGY: recoveredBeforeControl ? "batched" : "legacy", ARKTS_REFERENCES_TRACE: "1",
        // This control requires resident admission before witnessing its natural disposal.
        ARKTS_L01_PRESSURE_ADMISSION: recoveredBeforeControl ? "0" : undefined,
        ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: recoveredBeforeControl ? "1500" : "0",
        ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware",
        ARKTS_BENCHMARK_CONTROL: "1", ARKTS_MEMORY_BUDGET_MB: recoveredBeforeControl ? "1" : "1024" } },
    readiness: { candidateControl: true },
    preOpenTargetIds: ["warm", "cold"],
    targets: [
      { id: "warm", moduleId: "fixture", kind: "references", file: "Query.ets",
        symbol: "WarmThing", position: span(0, "WarmThing").start, includeDeclaration: true,
        sourceSha256: sha256File(sourcePath), oracle: oracle("warm", "WarmThing", 0, 1) },
      { id: "cold", moduleId: "fixture", kind: "references", file: "Query.ets",
        symbol: "ColdThing", position: span(2, "ColdThing").start, includeDeclaration: true,
        sourceSha256: sha256File(sourcePath), oracle: oracle("cold", "ColdThing", 2, 3) },
    ],
    scenarios: [
      { id: "prepare-warm", bucket: "first-unseen-symbol", targetId: "warm" },
      { id: "recover-cold", bucket: "after-eviction", targetId: "cold",
        acceptObservedEviction: recoveredBeforeControl },
      { id: "recover-cold-again", bucket: "pressure-recovery-repeat", targetId: "cold",
        acceptObservedEviction: recoveredBeforeControl },
    ],
  }
  const input = path.join(directory, "suite.json")
  const output = path.join(directory, "report.json")
  const registryProbe = path.join(directory, "registry-probe.jsonl")
  const timerReceipt = path.join(directory, "post-eviction-early-timer.json")
  suite.runtime.env.ARKTS_L01_REGISTRY_PROBE_FILE = registryProbe
  fs.writeFileSync(input, JSON.stringify(suite))
  const run = spawnSync(process.execPath, [runner, "--prepared-suite", input, "--out", output],
    { encoding: "utf8", timeout: 60_000, ...(earlyObservationTimer ? { env: { ...process.env,
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/prepared-observation-early-timer.cjs"))}`,
      ARKTS_TEST_OBSERVATION_TIMER_MS: "120", ARKTS_TEST_OBSERVATION_TIMER_RECEIPT: timerReceipt,
    } } : {}) })
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(output, "utf8"))
  assert.equal(report.readiness.semantic.status, recoveredBeforeControl ? "DEGRADED" : "PARTIAL", JSON.stringify(report.readiness))
  assert.equal(report.readiness.semantic.observed.semanticGeneration, null)
  assert.deepEqual(report.readiness.semantic.observed.readyCapabilities, [])
  assert.deepEqual(report.readiness.semantic.observed.unavailableReasons,
    [recoveredBeforeControl ? "resource-budget-exceeded" : "sdk-inputs-incomplete"])
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(report.gateStatus.latency, "BLOCKED")
  if (recoveredBeforeControl) {
    const initialized = report.serverEvents.find(event => event.event === "semantic.initialization.started")
    const control = report.timeline.find(event => event.phase === "memory-pressure-request-start").timestamp
    assert.ok(report.serverEvents.some(event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3" && event.residentContextCount === 0
      && Date.parse(event.ts) >= Date.parse(initialized.ts) && Date.parse(event.ts) <= control),
    "natural disposal after initialization must already be observed before the recovery control")
  }
  assert.equal(report.correctness.status, "PASS", JSON.stringify({
    failure: report.failure, blocked: report.blockedScenarios, unchanged: report.inputIdentity.inputUnchanged,
  }))
  assert.deepEqual(report.requests.map(request => request.scenarioId), [
    "prepare-warm", "recover-cold", "recover-cold-again",
  ])
  assert.ok(report.requests.every(request => request.status === "COMPLETE" && request.correctness.equal))
  assert.deepEqual(report.requests.map(request => request.correctness.locations.length), [2, 2, 2])
  assert.equal(report.gateStatus.diagnostics, "PASS")
  const pressure = report.timeline.findIndex(event => event.phase === "memory-pressure-request-start")
  const observed = report.timeline.findIndex(event => event.phase === "memory-pressure-eviction-observed")
  const recovered = report.timeline.findIndex(event => event.phase === "request-start"
    && event.scenarioId === "recover-cold")
  assert.ok(pressure > 0 && observed > pressure && recovered > observed)
  assert.ok(report.serverEvents.some(event => event.event === "semantic.context.evict"
    && event.reason === "memory-level3"))
  assert.equal(report.timeline.filter(event => event.phase === "memory-pressure-eviction-observed").length, 2)
  if (recoveredBeforeControl) {
    assert.ok(report.timeline.some(event => event.phase === "memory-pressure-eviction-observed"
      && event.origin === "already-observed"))
    assert.ok(report.serverEvents.some(event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3" && event.residentContextCount === 0))
  }
  for (const scenarioId of ["recover-cold", "recover-cold-again"]) {
    const observed = report.timeline.find(event => event.phase === "memory-pressure-eviction-observed"
      && event.scenarioId === scenarioId)
    const waitStart = report.timeline.find(event => event.phase === "post-eviction-observation-start"
      && event.scenarioId === scenarioId)
    const waitEnd = report.timeline.find(event => event.phase === "post-eviction-observation-complete"
      && event.scenarioId === scenarioId)
    const query = report.timeline.find(event => event.phase === "request-start"
      && event.scenarioId === scenarioId)
    assert.ok(observed && waitStart && waitEnd && query)
    assert.ok(observed.monotonicMs <= waitStart.monotonicMs)
    assert.equal(waitStart.durationMs, 120)
    if (earlyObservationTimer && scenarioId === "recover-cold") {
      const receipt = JSON.parse(fs.readFileSync(timerReceipt, "utf8"))
      const elapsedMs = waitEnd.monotonicMs - waitStart.monotonicMs
      t.diagnostic(JSON.stringify({ scenarioId, waitStart, waitEnd, elapsedMs, receipt }))
      assert.ok(receipt.callbackElapsedMs < 120, "the timer control must really complete before the observation deadline")
      assert.ok(elapsedMs >= waitStart.durationMs,
        `real post-eviction observation must reach its configured minimum: ${JSON.stringify({ elapsedMs, receipt })}`)
    }
    assert.ok(waitEnd.monotonicMs - waitStart.monotonicMs >= 100)
    assert.ok(waitEnd.monotonicMs <= query.monotonicMs)
  }
  const idleStart = report.timeline.find(event => event.phase === "post-query-idle-start")
  const idleEnd = report.timeline.find(event => event.phase === "post-query-idle-complete")
  assert.ok(idleStart && idleEnd && idleEnd.monotonicMs - idleStart.monotonicMs >= 200,
    JSON.stringify({ idleStart, idleEnd }))
  const probes = fs.readFileSync(registryProbe, "utf8").trim().split("\n").map(JSON.parse)
  const disposal = probes.filter(probe => probe.phase === "before-dispose" || probe.phase === "after-dispose")
  assert.ok(disposal.length >= (recoveredBeforeControl ? 2 : 4),
    "an already-empty context reuses its disposal witness without fabricating another resident disposal")
  for (let index = 0; index < disposal.length; index += 2) {
    assert.equal(disposal[index].phase, "before-dispose")
    assert.equal(disposal[index + 1].phase, "after-dispose")
    assert.equal(disposal[index].sampleId, disposal[index + 1].sampleId)
    assert.ok(disposal[index].sampledSourceFiles > 0)
    assert.ok(disposal[index].totalRefCount > 0)
    const released = disposal[index + 1]
    assert.equal(released.projectRefCount, 0, "project leases are released")
    assert.equal(released.nonSdkRefCount, released.libraryRefCount)
    assert.equal(released.totalRefCount, released.sdkRefCount + released.libraryRefCount, "only SDK and compiler-library cache pins may remain")
    if (released.sdkRefCount > 0) {
      assert.equal(disposal[index].sdkRefCount, 2 * released.sdkRefCount,
        "the job releases its SDK leases and retains one cache lease per SDK file")
      assert.equal(released.retainedSourceFiles, released.sdkRefCount + released.libraryRefCount)
    }
  }
  if (!recoveredBeforeControl) {
    for (const [scenarioIndex, value] of [[1, "yes"], [0, true]]) {
      const invalid = structuredClone(suite)
      invalid.scenarios[scenarioIndex].acceptObservedEviction = value
      const invalidInput = path.join(directory, `invalid-${scenarioIndex}.json`)
      const invalidOutput = path.join(directory, `invalid-report-${scenarioIndex}.json`)
      fs.writeFileSync(invalidInput, JSON.stringify(invalid))
      const rejected = spawnSync(process.execPath,
        [runner, "--prepared-suite", invalidInput, "--out", invalidOutput],
        { encoding: "utf8", timeout: 60_000 })
      assert.equal(rejected.status, 2, "observed eviction requires a boolean on a recovery scenario")
      assert.match(rejected.stderr, /PREPARED_SUITE_INVALID=OBSERVED_EVICTION_CONTROL/)
      assert.equal(fs.existsSync(invalidOutput), false)
    }
  }
})
}
