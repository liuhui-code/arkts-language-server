import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { projectRoot } from "./support/lsp-process.mjs"
import { readyReport } from "./support/semantic-release-evidence-fixture.mjs"
import { TEST_LAYER_MANIFEST } from "./support/test-layer-manifest.mjs"

const cli = path.join(projectRoot, "scripts/bench/assert-semantic-release.mjs")
const matrix = path.join(projectRoot, "config/semantic-release-matrix.json")
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

test("L08 consumes a build-bound full regression without promoting one platform to release", t => {
  const fixture = regressionFixture(t)
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "BLOCKED")
  const evidence = report.retainedCapabilityRegressionEvidence
  assert.equal(evidence.platforms.darwin.status, "PASS")
  assert.equal(evidence.platforms.linux.status, "NOT_RUN")
  assert.equal(evidence.platforms.win32.status, "NOT_RUN")
  assert.equal(evidence.receipts[0].logSha256, fixture.state.logSha256)
  assert.equal(evidence.receipts[0].sourceArchiveSha256, fixture.state.sourceArchiveSha256)
  assert.equal(evidence.receipts[0].counts.tests, fixture.state.counts.tests)
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 cannot borrow an earlier green summary when the regression log ends in failure", t => {
  const fixture = regressionFixture(t)
  const logPath = `${fixture.prefix}.stdout.log`
  fs.appendFileSync(logPath, "ELIFECYCLE Test failed.\n")
  fixture.state.logSha256 = sha(fs.readFileSync(logPath))
  fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "FAIL")
  assert.equal(report.retainedCapabilityRegressionEvidence.receipts[0].status, "FAIL")
  assert.deepEqual(report.retainedCapabilityRegressionEvidence.receipts[0].reasons,
    ["REGRESSION_SUMMARY_NOT_TERMINAL"])
  assert.equal(report.cells.find(cell => cell.requests).requests, 20)
  assert.equal(report.releaseEligible, false)
})

test("L08 retains actual failed regression counts when native SPEC appends its failure details", t => {
  const fixture = regressionFixture(t)
  fixture.state.exit = { code: 1, signal: null }
  fixture.state.counts.pass -= 2
  fixture.state.counts.fail = 2
  const log = `${Object.entries(fixture.state.counts).map(([key, value]) => `ℹ ${key} ${value}`).join("\n")}\n
✖ failing tests:

test at tests/workspace-file-change-coordinator.test.mjs:479:1
✖ removes stale scripts when overlay authority returns to a lexical alias (4255.377584ms)
  Error [SemanticInputUnavailableError]: Semantic query requires current workspace inputs

test at tests/workspace-file-change-coordinator.test.mjs:766:1
✖ rebuilds an alias engine when another lexical spelling owns its contiguous delta (5313.707261ms)
  Error [SemanticInputUnavailableError]: Semantic query requires current workspace inputs
[node-test-layer] child-exit code=1 signal=null
 ELIFECYCLE  Test failed. See above for more details.
 ELIFECYCLE  Command failed with exit code 1.
`
  // Match the retained real failed SPEC shape; this synthetic fixture qualifies only its consumer.
  fs.writeFileSync(`${fixture.prefix}.stdout.log`, log)
  fixture.state.logSha256 = sha(log)
  fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "FAIL")
  const receipt = report.retainedCapabilityRegressionEvidence.receipts[0]
  assert.equal(receipt.status, "FAIL")
  assert.deepEqual(receipt.reasons, ["REGRESSION_EXECUTION_FAILED"])
  assert.deepEqual(receipt.counts, fixture.state.counts)
  assert.deepEqual(receipt.actualExit, fixture.state.exit)
  assert.equal(report.releaseEligible, false)
})

test("L08 does not certify a failed SPEC tail without a completed nonzero native exit and failed tests", t => {
  for (const [name, exit, failed] of [
    ["zero-exit", { code: 0, signal: null }, 1],
    ["signal-exit", { code: null, signal: "SIGTERM" }, 1],
    ["invalid-exit", { code: "1", signal: null }, 1],
    ["green-summary", { code: 1, signal: null }, 0],
  ]) {
    const fixture = regressionFixture(t)
    fixture.state.exit = exit
    fixture.state.counts.fail = failed
    fixture.state.counts.pass -= failed
    const log = `${Object.entries(fixture.state.counts).map(([key, value]) => `ℹ ${key} ${value}`).join("\n")}

✖ failing tests:
test at tests/example.test.mjs:1:1
✖ a failure label alone cannot certify native completion (1ms)
`
    fs.writeFileSync(`${fixture.prefix}.stdout.log`, log)
    fixture.state.logSha256 = sha(log)
    fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, `${name}: ${result.stderr}`)
    const receipt = report.retainedCapabilityRegressionEvidence.receipts[0]
    assert.equal(receipt.status, "FAIL", name)
    assert.deepEqual(receipt.reasons, ["REGRESSION_SUMMARY_NOT_TERMINAL"], name)
    assert.equal(receipt.counts, null, name)
    assert.deepEqual(receipt.actualExit, exit, name)
    assert.equal(report.releaseEligible, false, name)
  }
})

test("L08 rejects a self-consistent source archive that omits an execution input", t => {
  const fixture = regressionFixture(t)
  const archivePath = `${fixture.prefix}-sources.jsonl`
  const rows = fs.readFileSync(archivePath, "utf8").trim().split("\n").map(JSON.parse)
    .filter(row => row.file !== "scripts/node-test-runtime-reporter.mjs")
  const archive = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`
  fs.writeFileSync(archivePath, archive)
  fixture.state.sourceArchiveSha256 = sha(archive)
  fixture.state.beforeRepo = fixture.state.afterRepo = { files: rows.length, sha256: digestRows(rows) }
  fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "FAIL")
  assert.deepEqual(report.retainedCapabilityRegressionEvidence.receipts[0].reasons,
    ["REGRESSION_ARCHIVE_INCOMPLETE"])
  assert.equal(report.releaseEligible, false)
})

test("L08 consumes each platform's native regression command without borrowing another build", t => {
  const fixtures = ["darwin", "linux", "win32"].map(platform => {
    const fixture = regressionFixture(t)
    fixture.state.platform = platform
    fixture.state.command = platform === "win32" ? "C:\\runtime\\node.exe" : "/runtime/node"
    fixture.state.args[0] = platform === "win32" ? "C:\\runtime\\pnpm.cjs" : "/runtime/pnpm"
    const prepared = JSON.parse(fs.readFileSync(fixture.preparedPath))
    prepared.environment.platform = { darwin: "Darwin 25.6.0 x64", linux: "Linux 6.8.0 x64",
      win32: "Windows_NT 10.0.0 x64" }[platform]
    const sidecar = { darwin: "1", linux: "2", win32: "3" }[platform].repeat(64)
    fixture.state.before.sidecarSha256 = sidecar
    prepared.inputIdentity.sidecarSha256 = prepared.inputIdentity.postflightPins.sidecarSha256 = sidecar
    fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
    fs.writeFileSync(fixture.preparedPath, JSON.stringify(prepared))
    return fixture
  })
  const { report, result } = evaluate(fixtures[0], fixtures)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "PASS")
  for (const platform of ["darwin", "linux", "win32"]) {
    assert.equal(report.retainedCapabilityRegressionEvidence.platforms[platform].status, "PASS", platform)
  }
  assert.equal(report.releaseEligible, false, "synthetic receipts do not satisfy remaining gates")
})

test("L08 refuses a truthy label in place of an actual stable-run proof", t => {
  const fixture = regressionFixture(t)
  fixture.state.repoStable = "true"
  fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "FAIL")
  assert.deepEqual(report.retainedCapabilityRegressionEvidence.receipts[0].reasons,
    ["REGRESSION_INPUT_DRIFT"])
  assert.equal(report.releaseEligible, false)
})

test("L08 requires actual artifact digest syntax even when both reports repeat the same label", t => {
  const fixture = regressionFixture(t)
  fixture.state.before.serverSha256 = "not-an-artifact-digest"
  const prepared = JSON.parse(fs.readFileSync(fixture.preparedPath))
  prepared.inputIdentity.serverSha256 = prepared.inputIdentity.postflightPins.serverSha256 = "not-an-artifact-digest"
  fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
  fs.writeFileSync(fixture.preparedPath, JSON.stringify(prepared))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "FAIL")
  assert.deepEqual(report.retainedCapabilityRegressionEvidence.receipts[0].reasons,
    ["REGRESSION_BUILD_IDENTITY_INVALID"])
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects unrepresentable native test counts instead of treating them as full coverage", t => {
  const fixture = regressionFixture(t)
  fixture.state.counts.tests = fixture.state.counts.pass = Number.MAX_SAFE_INTEGER + 1
  const log = `${Object.entries(fixture.state.counts).map(([key, value]) => `ℹ ${key} ${value}`).join("\n")}\n`
  fs.writeFileSync(`${fixture.prefix}.stdout.log`, log)
  fixture.state.logSha256 = sha(log)
  fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
  const { report, result } = evaluate(fixture)
  assert.equal(result.status, 1, result.stderr)
  assert.equal(report.retainedCapabilityRegression, "FAIL")
  assert.deepEqual(report.retainedCapabilityRegressionEvidence.receipts[0].reasons,
    ["REGRESSION_COUNTS_INVALID"])
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects a duplicated regression artifact rather than adding another passing receipt", t => {
  const fixture = regressionFixture(t)
  const out = path.join(fixture.root, "release.json")
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", fixture.preparedPath, "--regression-state", fixture.statePath,
    "--regression-state", fixture.statePath, "--out", out],
  { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /L08_DUPLICATE_REGRESSION_EVIDENCE/u)
  assert.equal(fs.existsSync(out), false)
})

test("L08 preserves failed missing stale and mismatched regression evidence independently of queries", t => {
  for (const [name, status, reason, mutate] of [
    ["nonzero-exit", "FAIL", "REGRESSION_EXECUTION_FAILED", fixture => { fixture.state.exit.code = 1 }],
    ["signal-exit", "FAIL", "REGRESSION_EXECUTION_FAILED", fixture => {
      fixture.state.exit = { code: null, signal: "SIGTERM" }
    }],
    ["running", "BLOCKED", "REGRESSION_NOT_TERMINAL", fixture => { fixture.state.phase = "RUNNING" }],
    ["partial-selection", "FAIL", "REGRESSION_SELECTION_MISMATCH", fixture => { fixture.state.entries.pop() }],
    ["input-drift", "FAIL", "REGRESSION_INPUT_DRIFT", fixture => {
      fixture.state.after = { ...fixture.state.before, serverSha256: "f".repeat(64) }
    }],
    ["log-missing", "FAIL", "REGRESSION_ARTIFACT_MISSING", fixture => {
      fs.unlinkSync(`${fixture.prefix}.stdout.log`)
    }],
    ["log-digest", "FAIL", "REGRESSION_ARTIFACT_DIGEST_MISMATCH", fixture => {
      fs.appendFileSync(`${fixture.prefix}.stdout.log`, "\n")
    }],
    ["summary-counts", "FAIL", "REGRESSION_COUNTS_MISMATCH", fixture => { fixture.state.counts.pass-- }],
    ["missing-summary", "FAIL", "REGRESSION_TERMINAL_SUMMARY_MISSING", fixture => {
      const log = "✔ already completed case\n"
      fs.writeFileSync(`${fixture.prefix}.stdout.log`, log)
      fixture.state.logSha256 = sha(log)
      fixture.state.counts = null
      fixture.state.exit.code = 1
    }],
    ["old-build", "BLOCKED", "REGRESSION_BUILD_MISMATCH", fixture => {
      const prepared = JSON.parse(fs.readFileSync(fixture.preparedPath))
      prepared.inputIdentity.serverSha256 = prepared.inputIdentity.postflightPins.serverSha256 = "f".repeat(64)
      fs.writeFileSync(fixture.preparedPath, JSON.stringify(prepared))
    }],
    ["stale-source", "BLOCKED", "REGRESSION_SOURCE_STALE", fixture => {
      const archivePath = `${fixture.prefix}-sources.jsonl`
      const rows = fs.readFileSync(archivePath, "utf8").trim().split("\n").map(JSON.parse)
      const row = rows.find(row => row.file === "scripts/node-test-runtime-reporter.mjs")
      const bytes = Buffer.concat([Buffer.from(row.base64, "base64"), Buffer.from("\n")])
      row.base64 = bytes.toString("base64")
      row.sha256 = sha(bytes)
      const archive = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`
      fs.writeFileSync(archivePath, archive)
      fixture.state.sourceArchiveSha256 = sha(archive)
      fixture.state.beforeRepo = fixture.state.afterRepo = { files: rows.length, sha256: digestRows(rows) }
    }],
  ]) {
    const fixture = regressionFixture(t)
    mutate(fixture)
    fs.writeFileSync(fixture.statePath, JSON.stringify(fixture.state))
    const { report, result } = evaluate(fixture)
    assert.equal(result.status, 1, `${name}: ${result.stderr}`)
    const receipt = report.retainedCapabilityRegressionEvidence.receipts[0]
    assert.equal(receipt.status, status, name)
    assert.deepEqual(receipt.reasons, [reason], name)
    assert.deepEqual(receipt.actualExit, fixture.state.exit, name)
    if (name === "missing-summary") assert.equal(receipt.counts, null)
    assert.equal(report.cells.find(cell => cell.requests).requests, 20, name)
    assert.equal(report.releaseEligible, false, name)
  }
})

function digestRows(rows) {
  const hash = createHash("sha256")
  for (const row of rows) hash.update(row.file).update("\0")
    .update(Buffer.from(row.base64, "base64")).update("\0")
  return hash.digest("hex")
}

function evaluate(fixture, fixtures = [fixture]) {
  const out = path.join(fixture.root, "release.json")
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    ...fixtures.flatMap(item => ["--prepared-report", item.preparedPath,
      "--regression-state", item.statePath]),
    "--out", out], { cwd: projectRoot, encoding: "utf8" })
  return { result, report: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out)) : null }
}

function regressionFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-regression-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const inventory = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: projectRoot, encoding: "utf8",
  })
  assert.equal(inventory.status, 0, inventory.stderr)
  const rows = [...new Set(inventory.stdout.split("\0").filter(Boolean))].sort().map(file => {
    const bytes = fs.readFileSync(path.join(projectRoot, file))
    return { file, sha256: sha(bytes), base64: bytes.toString("base64") }
  })
  const production = createHash("sha256")
  for (const row of rows.filter(row =>
    /^(src\/|crates\/|config\/|scripts\/build-|package\.json$|pnpm-lock\.yaml$)/u.test(row.file))) {
    const bytes = Buffer.from(row.base64, "base64")
    production.update(row.file).update("\0").update(String(bytes.length)).update("\0").update(bytes)
  }
  const sourceHash = production.digest("hex")
  const prepared = readyReport(0)
  const pins = { ...prepared.inputIdentity.postflightPins, serverInputSha256: sourceHash,
    serverRevision: "a".repeat(40), nodeVersion: process.version,
    ...Object.fromEntries(["sidecarSha256", "semanticWorkerSha256", "referenceVerifierWorkerSha256",
      "diagnosticVerifierWorkerSha256", "standardLibrarySha256", "lockfileSha256",
      "memoryGatesSha256"].map(key => [key, "e".repeat(64)])),
    sdkMetadata: { apiVersion: "24", version: "6.1.1.125" } }
  prepared.inputIdentity = { ...pins, postflightPins: pins, inputUnchanged: true }
  const layers = TEST_LAYER_MANIFEST.layers.filter(layer => layer.fast)
  const entries = [...new Set(layers.flatMap(layer => layer.entries))].sort()
  const counts = { tests: entries.length + 20, suites: 0, pass: entries.length + 20,
    fail: 0, cancelled: 0, skipped: 0, todo: 0, duration_ms: 1000 }
  const prefix = path.join(root, "whole")
  // Synthetic log/receipt/archive qualify the consumer only, not product execution.
  const log = `${Object.entries(counts).map(([key, value]) => `ℹ ${key} ${value}`).join("\n")}\n`
  const archive = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`
  fs.writeFileSync(`${prefix}.stdout.log`, log)
  fs.writeFileSync(`${prefix}-sources.jsonl`, archive)
  const repo = { files: rows.length, sha256: digestRows(rows) }
  const state = { schema: "arkts-language-server.retained-regression-state", schemaVersion: 1,
    phase: "TERMINAL", platform: "darwin", command: process.execPath,
    args: ["/runtime/pnpm", "check:fast"], selectedLayers: layers.map(layer => layer.id), entries,
    startedAt: "2026-10-14T00:00:00.000Z", finishedAt: "2026-10-14T00:00:03.000Z",
    exit: { code: 0, signal: null }, before: pins, after: pins, inputsStable: true,
    beforeRepo: repo, afterRepo: repo, repoStable: true, counts,
    logSha256: sha(log), sourceArchiveSha256: sha(archive) }
  const statePath = `${prefix}-state.json`
  const preparedPath = path.join(root, "prepared.json")
  fs.writeFileSync(statePath, JSON.stringify(state))
  fs.writeFileSync(preparedPath, JSON.stringify(prepared))
  return { root, state, statePath, preparedPath, prefix }
}
