import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"

const runner = path.resolve("scripts/bench/replay-references.mjs")

test("prepared suite recovers an exact unseen reference after observed L3 eviction", async t => {
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
      env: { ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_TRACE: "1",
        ARKTS_BENCHMARK_CONTROL: "1", ARKTS_MEMORY_BUDGET_MB: "1024" } },
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
      { id: "recover-cold", bucket: "after-eviction", targetId: "cold" },
      { id: "recover-cold-again", bucket: "pressure-recovery-repeat", targetId: "cold" },
    ],
  }
  const input = path.join(directory, "suite.json")
  const output = path.join(directory, "report.json")
  const registryProbe = path.join(directory, "registry-probe.jsonl")
  suite.runtime.env.ARKTS_L01_REGISTRY_PROBE_FILE = registryProbe
  fs.writeFileSync(input, JSON.stringify(suite))
  const run = spawnSync(process.execPath, [runner, "--prepared-suite", input, "--out", output],
    { encoding: "utf8", timeout: 60_000 })
  assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
  const report = JSON.parse(fs.readFileSync(output, "utf8"))
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
  assert.equal(report.gateStatus.ready, "FAIL")
  assert.equal(report.gateStatus.latency, "BLOCKED")
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
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
    assert.ok(waitEnd.monotonicMs - waitStart.monotonicMs >= 100)
    assert.ok(waitEnd.monotonicMs <= query.monotonicMs)
  }
  const idleStart = report.timeline.find(event => event.phase === "post-query-idle-start")
  const idleEnd = report.timeline.find(event => event.phase === "post-query-idle-complete")
  assert.ok(idleStart && idleEnd && idleEnd.monotonicMs - idleStart.monotonicMs >= 200)
  const probes = fs.readFileSync(registryProbe, "utf8").trim().split("\n").map(JSON.parse)
  const disposal = probes.filter(probe => probe.phase === "before-dispose" || probe.phase === "after-dispose")
  assert.ok(disposal.length >= 4)
  for (let index = 0; index < disposal.length; index += 2) {
    assert.equal(disposal[index].phase, "before-dispose")
    assert.equal(disposal[index + 1].phase, "after-dispose")
    assert.equal(disposal[index].sampleId, disposal[index + 1].sampleId)
    assert.ok(disposal[index].sampledSourceFiles > 0)
    assert.ok(disposal[index].totalRefCount > 0)
    assert.equal(disposal[index + 1].totalRefCount, 0)
  }
})
