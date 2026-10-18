import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { capturePreparedIdentity } from "../../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../../scripts/bench/reference-replay-input.mjs"
import { selectedL03Policy } from "./resident-interactive-lsp.mjs"

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

/** Actual production preparation with a private SDK; not an installed-SDK benchmark. */
export async function productionSuite(t) {
  const fixture = await makeSuite(t)
  const { suite } = fixture
  const source = "export class Thing {}\nexport const selected = new Thing()\n"
  fs.writeFileSync(path.join(suite.workspace, "Query.ets"), source)
  const commit = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "commit", "-am", "production readiness fixture", "-q"], { cwd: suite.workspace, encoding: "utf8" })
  assert.equal(commit.status, 0, commit.stderr)
  fs.mkdirSync(path.join(suite.sdk, "ets", "component"))
  fs.writeFileSync(path.join(suite.sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(suite.sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  const oracle = suite.targets[0].oracle.path
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{ file: "Query.ets",
    range: { start: { line: 0, character: 13 }, end: { line: 0, character: 18 } } }] }))
  suite.server = path.resolve("dist/server.cjs")
  suite.sidecar = path.resolve("target/release/arkts-index-sidecar")
  suite.runtime = { timeoutMs: 10_000, diagnosticTimeoutMs: 10_000, sampleIntervalMs: 25,
    env: { ARKTS_REFERENCES_STRATEGY: "indexed-batched", ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
      ARKTS_L02_SAME_CONTENT_PROMOTION: "1", ARKTS_MEMORY_BUDGET_MB: "1024",
      ARKTS_REFERENCES_TRACE: "1", ...selectedL03Policy } }
  suite.targets[0] = { ...suite.targets[0], kind: "definition", includeDeclaration: undefined,
    position: { line: 1, character: source.split("\n")[1].indexOf("Thing") + 1 },
    sourceSha256: sha256File(path.join(suite.workspace, "Query.ets")),
    oracle: { path: oracle, sha256: sha256File(oracle), verified: true } }
  suite.pins = await capturePreparedIdentity(suite)
  saveSuite(fixture)
  return fixture
}

/** Deliberately reported protocol-fixture proof, never evidence of an actual Program. */
export function reportedProof(fixture) {
  const input = { canonicalRoot: fs.realpathSync(fixture.suite.workspace), engineGeneration: 1, membershipRevision: 0,
    sourcesSha256: "a".repeat(64), overlaysSha256: "b".repeat(64), optionsSha256: "c".repeat(64),
    projectGraphSha256: "d".repeat(64), sdkSha256: "e".repeat(64), standardLibrarySha256: "f".repeat(64),
    backend: { packageVersion: fixture.suite.pins.backendVersion, compilerSha256: fixture.suite.pins.backendSha256,
      packageSha256: sha256File(path.resolve("node_modules/typescript/package.json")) }, sha256: "a".repeat(64) }
  return { rootUri: pathToFileURL(fixture.suite.workspace).href, semanticState: "ready",
    semanticGeneration: `1:0:12345678-1234-4123-8123-123456789abc:${input.sha256}`,
    readyCapabilities: JSON.parse(fs.readFileSync("config/semantic-release-matrix.json", "utf8")).capabilities,
    unavailableReasons: [], unavailableInput: null, inputIdentity: input,
    coverage: { projectSources: 1, sdkSources: 1, standardLibrarySources: 1, programSources: 3, dependenciesComplete: true } }
}
