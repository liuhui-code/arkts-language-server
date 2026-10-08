import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"

const runner = path.resolve("scripts/bench/replay-references.mjs")

test("prepared GC probe rejects an unpinned parent Node launch option before server start", async t => {
  const fixture = await makeSuite(t)
  fixture.suite.runtime.env.ARKTS_L01_POST_EVICTION_GC_PROBE = "1"
  saveSuite(fixture)

  for (const nodeOptions of [undefined, "--expose-gc --trace-warnings"]) {
    const run = runSuite(fixture, nodeOptions)
    assert.equal(run.status, 2, `${run.stderr}\n${run.stdout}`)
    assert.match(run.stderr, /PREPARED_SUITE_BLOCKED=GC_PROBE_NODE_OPTIONS/u)
    assert.equal(fs.existsSync(fixture.output), false, "invalid launch must not start the server")
  }
})

test("prepared GC probe pins the effective launch option and reports child inheritance", async t => {
  const fixture = await makeSuite(t)
  assert.equal("nodeOptions" in fixture.suite.pins, false)
  fixture.suite.runtime.env.ARKTS_L01_POST_EVICTION_GC_PROBE = "1"
  saveSuite(fixture)

  const unpinned = runSuite(fixture, "--expose-gc")
  assert.equal(unpinned.status, 2, `${unpinned.stderr}\n${unpinned.stdout}`)
  assert.match(unpinned.stderr, /PREPARED_SUITE_BLOCKED=PIN_MISMATCH:nodeOptions/u)
  assert.equal(fs.existsSync(fixture.output), false)

  const originalNodeOptions = process.env.NODE_OPTIONS
  try {
    process.env.NODE_OPTIONS = "--expose-gc"
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
  } finally {
    if (originalNodeOptions === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = originalNodeOptions
  }
  assert.equal(fixture.suite.pins.nodeOptions, "--expose-gc")
  saveSuite(fixture)
  const pinned = runSuite(fixture, "--expose-gc")
  assert.equal(pinned.status, 1, `${pinned.stderr}\n${pinned.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.inputIdentity.nodeOptions, "--expose-gc")
  assert.equal(report.inputIdentity.postflightPins.nodeOptions, "--expose-gc")
  assert.equal(report.inputIdentity.inputUnchanged, true)
  assert.equal(report.environment.launch.nodeOptions, "--expose-gc")
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.gateStatus.diagnostics, "PASS")
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture.evidence, "utf8")),
    { nodeOptions: "--expose-gc", gc: "function" })
})

test("ordinary prepared suite records but does not pin a parent Node launch option", async t => {
  const fixture = await makeSuite(t)
  assert.equal("nodeOptions" in fixture.suite.pins, false)
  const ordinary = runSuite(fixture, "--expose-gc")
  assert.equal(ordinary.status, 1, `${ordinary.stderr}\n${ordinary.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal("nodeOptions" in report.inputIdentity, false)
  assert.equal(report.environment.launch.nodeOptions, "--expose-gc")
  assert.equal(report.inputIdentity.inputUnchanged, true)
  assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
  assert.equal(report.gateStatus.diagnostics, "PASS")
})

async function makeSuite(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-gc-probe-pin-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "lib.d.ts"), "declare const Thing: string\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ apiVersion: "24", version: "test" }))
  const source = path.join(workspace, "Query.ets")
  fs.writeFileSync(source, "Thing\n")
  for (const args of [["init", "-q"], ["add", "Query.ets"],
    ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]]) {
    const git = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
    assert.equal(git.status, 0, git.stderr)
  }
  const server = path.join(directory, "server.mjs")
  fs.copyFileSync(path.resolve("tests/fixtures/lsp/prepared-query-server.mjs"), server)
  const evidence = path.join(directory, "node-options.json")
  fs.appendFileSync(server, "\nfs.writeFileSync(process.env.ARKTS_TEST_NODE_OPTIONS_EVIDENCE, "
    + "JSON.stringify({ nodeOptions: process.env.NODE_OPTIONS ?? null, gc: typeof globalThis.gc }))\n")
  const oracle = path.join(directory, "oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }] }))
  const suite = {
    schemaVersion: 1, benchmarkId: "gc-probe-pin", seed: 20261007,
    workspace, sdk, server, sidecar: server,
    runtime: { timeoutMs: 5000, diagnosticTimeoutMs: 5000, sampleIntervalMs: 25,
      env: { ARKTS_BENCHMARK_CONTROL: "1", ARKTS_TEST_NODE_OPTIONS_EVIDENCE: evidence } },
    readiness: { candidateControl: true },
    targets: [{ id: "thing", moduleId: "fixture", kind: "references", file: "Query.ets",
      symbol: "Thing", position: { line: 0, character: 1 }, includeDeclaration: false,
      sourceSha256: sha256File(source),
      oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }],
    scenarios: [{ id: "first", bucket: "first-unseen-symbol", targetId: "thing" }],
  }
  suite.pins = await capturePreparedIdentity(suite)
  const input = path.join(directory, "suite.json")
  const output = path.join(directory, "report.json")
  fs.writeFileSync(input, JSON.stringify(suite))
  return { input, output, suite, evidence }
}

function saveSuite(fixture) {
  fs.writeFileSync(fixture.input, JSON.stringify(fixture.suite))
}

function runSuite(fixture, nodeOptions) {
  return spawnSync(process.execPath,
    [runner, "--prepared-suite", fixture.input, "--out", fixture.output],
    { encoding: "utf8", timeout: 20_000, env: { ...process.env, NODE_OPTIONS: nodeOptions } })
}
