import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { makeQueryLayerFixture } from "./support/query-layer-fixture.mjs"
import { readyReport } from "./support/semantic-release-evidence-fixture.mjs"
import { TEST_LAYER_MANIFEST } from "./support/test-layer-manifest.mjs"

const cli = path.resolve("scripts/bench/run-retained-regression.mjs")
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

test("the public regression collector retains native exit raw log source archive and build identity", async t => {
  const fixture = await collectorFixture(t)
  const result = runCollector(fixture)
  assert.equal(result.status, 0, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.schema, "arkts-language-server.retained-regression-state")
  assert.equal(state.schemaVersion, 1)
  assert.equal(state.phase, "TERMINAL")
  assert.equal(state.platform, process.platform)
  assert.equal(state.command, process.execPath)
  assert.deepEqual(state.args, [fixture.pnpm, "check:fast"])
  assert.deepEqual(state.exit, { code: 0, signal: null })
  assert.equal(state.counts.pass, fixture.tests)
  assert.equal(state.counts.fail, 0)
  assert.equal(state.inputsStable, true)
  assert.equal(state.repoStable, true)
  assert.deepEqual(state.before, state.after)
  assert.deepEqual(state.beforeRepo, state.afterRepo)
  assert.deepEqual(state.selectedLayers, fixture.layers.map(layer => layer.id))
  assert.deepEqual(state.entries, fixture.entries)
  const log = fs.readFileSync(`${fixture.prefix}.stdout.log`)
  const archive = fs.readFileSync(`${fixture.prefix}-sources.jsonl`)
  assert.equal(state.logSha256, sha(log))
  assert.equal(state.sourceArchiveSha256, sha(archive))
  assert.match(log.toString(), /COLLECTOR_FIXTURE_STDERR/u)
  const rows = archive.toString().trim().split("\n").map(JSON.parse)
  assert.equal(rows.length, state.beforeRepo.files)
  for (const row of rows) assert.equal(sha(Buffer.from(row.base64, "base64")), row.sha256)
  const aggregate = createHash("sha256")
  for (const row of rows) aggregate.update(row.file).update("\0")
    .update(Buffer.from(row.base64, "base64")).update("\0")
  assert.equal(aggregate.digest("hex"), state.beforeRepo.sha256)
  assert.equal(state.releaseEligible, false)
})

test("the collector cannot promote an earlier summary when the actual regression has no final summary", async t => {
  const fixture = await collectorFixture(t)
  fs.appendFileSync(fixture.pnpm, '\nprocess.stdout.write("UNFINISHED_REAL_REGRESSION\\n");\n')
  const result = runCollector(fixture)
  assert.equal(result.status, 2, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  assert.deepEqual(state.exit, { code: 0, signal: null }, "keep the actual successful child exit")
  assert.equal(state.counts, null, "an earlier nested summary cannot be the root terminal counts")
  assert.equal(state.countsValid, false)
  assert.equal(state.status, "FAIL")
  assert.match(fs.readFileSync(`${fixture.prefix}.stdout.log`, "utf8"), /UNFINISHED_REAL_REGRESSION/u)
  assert.equal(state.releaseEligible, false)
})

test("postflight capture failure retains native termination log and counts in a terminal failed receipt", async t => {
  const fixture = await collectorFixture(t)
  fs.appendFileSync(fixture.pnpm, `\nrequire("node:fs").writeFileSync(${JSON.stringify(
    path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"))}, "invalid JSON");\n`)
  const result = runCollector(fixture)
  assert.equal(result.status, 2, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  assert.deepEqual(state.exit, { code: 0, signal: null })
  assert.equal(state.counts.pass, fixture.tests)
  assert.equal(state.inputsStable, false)
  assert.equal(state.after, null)
  assert.equal(typeof state.afterCaptureError, "string")
  assert.ok(state.afterCaptureError)
  assert.equal(state.logSha256, sha(fs.readFileSync(`${fixture.prefix}.stdout.log`)))
  assert.equal(state.status, "FAIL")
  assert.equal(state.releaseEligible, false)
})

test("a real failed regression exit is retained even when an earlier summary was green", async t => {
  const fixture = await collectorFixture(t)
  fs.appendFileSync(fixture.pnpm, "\nprocess.exitCode = 23;\n")
  const result = runCollector(fixture)
  assert.equal(result.status, 23, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  assert.deepEqual(state.exit, { code: 23, signal: null })
  assert.equal(state.counts.pass, fixture.tests)
  assert.equal(state.status, "FAIL")
  assert.equal(state.releaseEligible, false)
})

test("the collector cannot overwrite any existing raw artifact or invoke the regression after rejecting it", async t => {
  const fixture = await collectorFixture(t)
  const marker = path.join(fixture.directory, "command-started")
  fs.appendFileSync(fixture.pnpm, `\nrequire("node:fs").writeFileSync(${JSON.stringify(marker)}, "started");\n`)
  const file = `${fixture.prefix}.stdout.log`
  fs.writeFileSync(file, "original immutable evidence\n")
  const result = runCollector(fixture)
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /REGRESSION_COLLECTOR_OUTPUT_EXISTS/u)
  assert.equal(fs.readFileSync(file, "utf8"), "original immutable evidence\n")
  assert.equal(fs.existsSync(marker), false)
  assert.equal(fs.existsSync(`${fixture.prefix}-state.json`), false)
})

test("a pnpm launcher changed during regression cannot qualify a stable successful receipt", async t => {
  const fixture = await collectorFixture(t)
  fs.appendFileSync(fixture.pnpm, '\nrequire("node:fs").appendFileSync(__filename, "\\n// changed launcher\\n");\n')
  const result = runCollector(fixture)
  assert.equal(result.status, 2, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  assert.deepEqual(state.exit, { code: 0, signal: null })
  assert.equal(state.counts.pass, fixture.tests)
  assert.equal(state.inputsStable, false)
  assert.notEqual(state.pnpmScriptSha256, state.postflightPnpmScriptSha256)
  assert.equal(state.status, "FAIL")
  assert.equal(state.releaseEligible, false)
})

test("a zero-test successful child cannot certify the declared full fast-layer selection", async t => {
  const fixture = await collectorFixture(t)
  const counts = { ...fixture.counts, tests: 0, pass: 0 }
  fs.writeFileSync(fixture.pnpm, `process.stdout.write(${JSON.stringify(
    Object.entries(counts).map(([key, value]) => `ℹ ${key} ${value}`).join("\n") + "\n")});\n`)
  const result = runCollector(fixture)
  assert.equal(result.status, 2, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.deepEqual(state.exit, { code: 0, signal: null })
  assert.equal(state.counts.tests, 0, "retain the real zero count, not a fabricated inventory count")
  assert.equal(state.countsValid, false)
  assert.equal(state.status, "FAIL")
  assert.equal(state.entries.length, fixture.entries.length)
  assert.equal(state.releaseEligible, false)
})

test("a native spawn error still closes the log and produces a terminal failed receipt", async t => {
  const fixture = await collectorFixture(t)
  const result = runCollector(fixture, {
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/collector-spawn-error.cjs"))}`,
    ARKTS_TEST_COLLECTOR_MISSING_EXECUTABLE: path.join(fixture.directory, "absent-executable"),
  })
  assert.equal(result.status, 2, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  assert.equal(state.spawnError.code, "ENOENT")
  assert.notEqual(state.exit.code, 0)
  assert.equal(state.exit.signal, null)
  assert.equal(state.counts, null)
  assert.equal(state.logSha256, sha(fs.readFileSync(`${fixture.prefix}.stdout.log`)))
  assert.equal(state.status, "FAIL")
  assert.equal(state.releaseEligible, false)
})

test("the collected receipt is consumed through the public release CLI for its own build and platform only", async t => {
  const fixture = await collectorFixture(t)
  const result = runCollector(fixture)
  assert.equal(result.status, 0, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  // These query proofs and pnpm output qualify the end-to-end tooling only, never a product release.
  const prepared = readyReport(0)
  prepared.inputIdentity = { ...state.before, postflightPins: state.after, inputUnchanged: true }
  prepared.environment.workspace = fixture.suite.workspace
  prepared.environment.platform = { darwin: "Darwin fixture x64", linux: "Linux fixture x64",
    win32: "Windows_NT fixture x64" }[process.platform]
  const proof = prepared.readiness.semantic.observed
  proof.rootUri = pathToFileURL(fixture.suite.workspace).href
  proof.inputIdentity.canonicalRoot = fixture.suite.workspace
  proof.inputIdentity.backend.packageVersion = state.before.backendVersion
  proof.inputIdentity.backend.compilerSha256 = state.before.backendSha256
  const input = path.join(fixture.directory, "prepared-proof.json")
  const out = path.join(fixture.directory, "release.json")
  fs.writeFileSync(input, JSON.stringify(prepared))
  const consumed = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
    "--matrix", path.resolve("config/semantic-release-matrix.json"), "--prepared-report", input,
    "--regression-state", `${fixture.prefix}-state.json`, "--out", out], { encoding: "utf8" })
  assert.equal(consumed.status, 1, consumed.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  assert.equal(report.retainedCapabilityRegressionEvidence.platforms[process.platform].status, "PASS",
    JSON.stringify(report.retainedCapabilityRegressionEvidence))
  assert.equal(report.retainedCapabilityRegression, "BLOCKED")
  assert.equal(report.releaseEligible, false)
  assert.equal(report.retainedCapabilityRegressionEvidence.receipts[0].sha256,
    sha(fs.readFileSync(`${fixture.prefix}-state.json`)))
})

test("a real signal termination remains a failed native exit rather than successful summary labels", async t => {
  const fixture = await collectorFixture(t)
  fs.appendFileSync(fixture.pnpm, '\nprocess.kill(process.pid, "SIGTERM");\n')
  const result = runCollector(fixture)
  assert.notEqual(result.status, 0, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  if (process.platform !== "win32") assert.deepEqual(state.exit, { code: null, signal: "SIGTERM" })
  else assert.ok(state.exit.code !== 0 || state.exit.signal !== null)
  assert.equal(state.status, "FAIL")
  assert.equal(state.releaseEligible, false)
  assert.equal(state.logSha256, sha(fs.readFileSync(`${fixture.prefix}.stdout.log`)))
})

test("a failed postflight source inventory retains the actual completed regression in a failed terminal receipt", async t => {
  const fixture = await collectorFixture(t)
  const result = runCollector(fixture, {
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/collector-postflight-git-error.cjs"))}`,
    ARKTS_TEST_COLLECTOR_POSTFLIGHT_GIT_ERROR: "1",
  })
  assert.equal(result.status, 2, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  assert.deepEqual(state.exit, { code: 0, signal: null })
  assert.equal(state.counts.pass, fixture.tests)
  assert.equal(state.repoStable, false)
  assert.equal(state.afterRepo, null)
  assert.equal(typeof state.repoCaptureError, "string")
  assert.equal(state.status, "FAIL")
  assert.equal(state.logSha256, sha(fs.readFileSync(`${fixture.prefix}.stdout.log`)))
  assert.equal(state.releaseEligible, false)
})

test("a missing original raw log cannot leave a completed child marked running or invent its counts", async t => {
  const fixture = await collectorFixture(t)
  fs.appendFileSync(fixture.pnpm, `\nrequire("node:fs").unlinkSync(${JSON.stringify(`${fixture.prefix}.stdout.log`)});\n`)
  const result = runCollector(fixture)
  assert.equal(result.status, 2, result.stderr)
  const state = JSON.parse(fs.readFileSync(`${fixture.prefix}-state.json`))
  assert.equal(state.phase, "TERMINAL")
  assert.deepEqual(state.exit, { code: 0, signal: null })
  assert.equal(state.counts, null)
  assert.equal(state.countsValid, false)
  assert.equal(state.logSha256, null)
  assert.equal(typeof state.logCaptureError, "string")
  assert.equal(state.status, "FAIL")
  assert.equal(state.releaseEligible, false)
})

async function collectorFixture(t) {
  const fixture = await makeQueryLayerFixture(t, {
    files: { "Target.ets": "export class Thing {}\n" },
    target: { kind: "references", file: "Target.ets", symbol: "Thing",
      position: { line: 0, character: 13 }, includeDeclaration: true },
    oracle: { schemaVersion: 1, locations: [] },
  })
  const layers = TEST_LAYER_MANIFEST.layers.filter(layer => layer.fast)
  const entries = [...new Set(layers.flatMap(layer => layer.entries))].sort()
  const tests = entries.length + 20
  const pnpm = path.join(fixture.directory, "pnpm.cjs")
  const counts = { tests, suites: 0, pass: tests, fail: 0, cancelled: 0, skipped: 0, todo: 0, duration_ms: 100 }
  // This real executable is an external pnpm-boundary fixture, never actual full regression evidence.
  fs.writeFileSync(pnpm, `
    const assert = require("node:assert/strict");
    assert.deepEqual(process.argv.slice(2), ["check:fast"]);
    process.stderr.write("COLLECTOR_FIXTURE_STDERR\\n");
    process.stdout.write(${JSON.stringify(Object.entries(counts).map(([key, value]) => `ℹ ${key} ${value}`).join("\n") + "\n")});
  `)
  return { ...fixture, prefix: path.join(fixture.directory, "whole"), pnpm, counts, tests, layers, entries }
}

function runCollector(fixture, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv }
  delete env.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [cli, "--prepared-suite", fixture.input,
    "--pnpm", fixture.pnpm, "--out", fixture.prefix],
  { encoding: "utf8", env, timeout: 20_000 })
}
