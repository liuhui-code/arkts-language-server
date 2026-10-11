import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { capturePreparedIdentity } from "../../scripts/bench/prepared-suite-input.mjs"

const runner = path.resolve("scripts/bench/replay-references.mjs")

export function saveSuite(fixture) {
  fs.writeFileSync(fixture.input, JSON.stringify(fixture.suite))
}

export async function makeSuite(t, mode = "normal") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-prepared-suite-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "lib.d.ts"), "declare const Thing: string\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  for (const args of [["init", "-q"], ["add", "Query.ets"], ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]]) {
    const git = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
    assert.equal(git.status, 0, git.stderr)
  }
  const oracle = path.join(directory, "oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{
    file: "Query.ets", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
  }] }))
  const server = path.resolve("tests/fixtures/lsp/prepared-query-server.mjs")
  const { sha256File } = await import("../../scripts/bench/reference-replay-input.mjs")
  const suite = {
    schemaVersion: 1, benchmarkId: "prepared-fixture", seed: 20260929,
    workspace, sdk, server, sidecar: server,
    pins: await capturePreparedIdentity({ workspace, sdk, server, sidecar: server,
      runtime: { env: { ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0" } } }),
    runtime: { timeoutMs: 500, diagnosticTimeoutMs: 1000, sampleIntervalMs: 25,
      env: { ARKTS_TEST_PREPARED_MODE: mode, ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0" } },
    readiness: { candidateControl: true },
    targets: [{ id: "thing", moduleId: "fixture", kind: "references", file: "Query.ets",
      symbol: "Thing", position: { line: 0, character: 1 }, includeDeclaration: false,
      sourceSha256: sha256File(path.join(workspace, "Query.ets")),
      oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }],
    scenarios: [
      { id: "first", bucket: "first-unseen-symbol", targetId: "thing" },
      { id: "repeat", bucket: "repeated-snapshot", targetId: "thing" },
    ],
  }
  const input = path.join(directory, "suite.json")
  const output = path.join(directory, "report.json")
  fs.writeFileSync(input, JSON.stringify(suite))
  return { directory, input, output, suite }
}

export function runSuite(fixture, args = []) {
  return spawnSync(process.execPath, [runner, "--prepared-suite", fixture.input, "--out", fixture.output, ...args], {
    encoding: "utf8", timeout: 15_000,
  })
}
