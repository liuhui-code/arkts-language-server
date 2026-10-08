import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"

const runner = path.resolve("scripts/bench/replay-references.mjs")

test("prepared suite pins the experimental diagnostic worker only when both flags are enabled", async t => {
  const fixture = await makeSuite(t)

  const ordinary = runSuite(fixture)
  assert.equal(ordinary.status, 1, `${ordinary.stderr}\n${ordinary.stdout}`)
  const ordinaryReport = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(ordinaryReport.inputIdentity.inputUnchanged, true)
  assert.equal(ordinaryReport.correctness.status, "PASS", JSON.stringify({
    failure: ordinaryReport.failure, requests: ordinaryReport.requests,
    diagnostics: ordinaryReport.diagnostics,
  }))
  assert.equal("diagnosticVerifierWorkerSha256" in ordinaryReport.inputIdentity, false)
  fs.unlinkSync(fixture.output)

  fixture.suite.runtime.env.ARKTS_L01_TRANSIENT_DIAGNOSTICS = "1"
  saveSuite(fixture)
  const unpinned = runSuite(fixture)
  assert.equal(unpinned.status, 2, `${unpinned.stderr}\n${unpinned.stdout}`)
  assert.match(unpinned.stderr, /PREPARED_SUITE_BLOCKED=PIN_MISMATCH:diagnosticVerifierWorkerSha256/u)
  assert.equal(fs.existsSync(fixture.output), false, "pin mismatch must block before server launch")

  fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
  assert.equal(fixture.suite.pins.diagnosticVerifierWorkerSha256,
    sha256File(fixture.diagnosticWorker))
  saveSuite(fixture)
  const pinned = runSuite(fixture)
  assert.equal(pinned.status, 1, `${pinned.stderr}\n${pinned.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  assert.equal(report.inputIdentity.inputUnchanged, true)
  assert.equal(report.inputIdentity.diagnosticVerifierWorkerSha256,
    fixture.suite.pins.diagnosticVerifierWorkerSha256)
  assert.equal(report.correctness.status, "PASS")
  assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
})

async function makeSuite(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-diagnostic-worker-pin-"))
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
  const diagnosticWorker = path.join(directory, "diagnostic-verifier-worker.cjs")
  fs.writeFileSync(diagnosticWorker, "// experimental diagnostic verifier bundle\n")
  const oracle = path.join(directory, "oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } } }] }))
  const suite = {
    schemaVersion: 1, benchmarkId: "diagnostic-worker-pin", seed: 20261007,
    workspace, sdk, server, sidecar: server,
    runtime: { timeoutMs: 5000, diagnosticTimeoutMs: 5000, sampleIntervalMs: 25,
      env: { ARKTS_BENCHMARK_CONTROL: "1" } },
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
  return { input, output, suite, diagnosticWorker }
}

function saveSuite(fixture) {
  fs.writeFileSync(fixture.input, JSON.stringify(fixture.suite))
}

function runSuite(fixture) {
  return spawnSync(process.execPath,
    [runner, "--prepared-suite", fixture.input, "--out", fixture.output],
    { encoding: "utf8", timeout: 20_000 })
}
