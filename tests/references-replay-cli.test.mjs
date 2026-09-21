import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runner = path.join(projectRoot, "scripts", "bench", "replay-references.mjs")
const differential = path.join(projectRoot, "scripts", "bench", "assert-replay-differential.mjs")
const silentServer = path.join(projectRoot, "tests", "fixtures", "lsp", "silent-replay-server.mjs")
const noDiagnosticsServer = path.join(projectRoot, "tests", "fixtures", "lsp", "references-without-diagnostics-server.mjs")

test("references replay exposes one self-contained real-project command", () => {
  const result = spawnSync(process.execPath, [runner, "--help"], {
    cwd: projectRoot,
    encoding: "utf8",
  })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stdout, /--workspace <path>/u)
  assert.match(result.stdout, /--sdk <path>/u)
  assert.match(result.stdout, /--file <workspace-relative path>/u)
  assert.match(result.stdout, /--line <zero-based>/u)
  assert.match(result.stdout, /--character <UTF-16>/u)
  assert.match(result.stdout, /--oracle <report.json>/u)
  assert.match(result.stdout, /--out <report.json>/u)
  assert.match(result.stdout, /--dependency-profile <closure\|identity>/u)
  assert.match(result.stdout, /textDocument\/references/u)
})

test("references replay fails before launch when required evidence is absent", () => {
  const result = spawnSync(process.execPath, [runner], {
    cwd: projectRoot,
    encoding: "utf8",
  })

  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /--workspace is required/u)
})

test("references replay blocks a manifest with a mismatched SDK before starting the server", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-replay-manifest-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "6.1.1.125" }))
  const oracle = path.join(root, "oracle.json")
  const manifest = path.join(root, "manifest.json")
  const output = path.join(root, "result.json")
  fs.writeFileSync(oracle, "[]\n")
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 1,
    benchmarkId: "sdk-mismatch",
    repoSha: "a".repeat(40),
    sdk: { apiVersion: "26", version: "26.0.1", declarationDigest: "b".repeat(64) },
    query: { file: "Query.ets", symbol: "Thing", line: 0, character: 1, includeDeclaration: true },
    oracle: { verified: true, expectedLocationCount: 1, sha256: "c".repeat(64) },
    serverSha256: "d".repeat(64),
    sidecarSha256: "e".repeat(64),
  }))

  const result = spawnSync(process.execPath, [
    runner,
    "--manifest", manifest,
    "--workspace", workspace,
    "--sdk", sdk,
    "--file", "Query.ets",
    "--symbol", "Thing",
    "--line", "0",
    "--character", "1",
    "--oracle", oracle,
    "--out", output,
    "--server", silentServer,
    "--sidecar", silentServer,
  ], { cwd: projectRoot, encoding: "utf8", timeout: 10_000 })

  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=SDK_MISMATCH/u)
  assert.equal(fs.existsSync(output), false)
})

test("references replay classifies an unavailable pinned SDK as an environment block", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-replay-no-sdk-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  const oracle = path.join(root, "oracle.json")
  const manifest = path.join(root, "manifest.json")
  fs.writeFileSync(oracle, "[]\n")
  fs.writeFileSync(manifest, "{}\n")
  const result = spawnSync(process.execPath, [
    runner,
    "--manifest", manifest,
    "--workspace", workspace,
    "--sdk", path.join(root, "missing-sdk"),
    "--file", "Query.ets",
    "--symbol", "Thing",
    "--line", "0",
    "--character", "1",
    "--oracle", oracle,
    "--out", path.join(root, "result.json"),
    "--server", silentServer,
    "--sidecar", silentServer,
  ], { cwd: projectRoot, encoding: "utf8", timeout: 10_000 })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=SDK_UNAVAILABLE/u)
})

test("references replay removes its private index cache after a failed child request", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-replay-cleanup-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const temporary = path.join(root, "temporary")
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  for (const directory of [temporary, workspace, sdk]) fs.mkdirSync(directory)
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  const oracle = path.join(root, "oracle.json")
  const output = path.join(root, "result.json")
  fs.writeFileSync(oracle, "[]\n")

  const result = spawnSync(process.execPath, [
    runner,
    "--workspace", workspace,
    "--sdk", sdk,
    "--file", "Query.ets",
    "--symbol", "Thing",
    "--line", "0",
    "--character", "1",
    "--oracle", oracle,
    "--out", output,
    "--server", silentServer,
    "--sidecar", silentServer,
    "--timeout-ms", "1000",
    "--diagnostic-timeout-ms", "1000",
    "--idle-ms", "0",
  ], {
    cwd: projectRoot,
    env: { ...process.env, TMPDIR: temporary, ARKTS_MEMORY_BUDGET_MB: "768" },
    encoding: "utf8",
    timeout: 25_000,
  })

  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.environment.serverEnvironment.ARKTS_MEMORY_BUDGET_MB, "768")
  assert.deepEqual(
    fs.readdirSync(temporary).filter((entry) => entry.startsWith("arkts-references-replay-")),
    [],
    "the replay retained its private SQLite catalog and RSS samples",
  )
})

test("references replay accepts a workspace-relative exact Location oracle", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-relative-oracle-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  const oracle = path.join(root, "oracle.json")
  const output = path.join(root, "result.json")
  const location = {
    file: "Query.ets",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
  }
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [location] }))

  const result = spawnSync(process.execPath, [
    runner,
    "--workspace", workspace,
    "--sdk", sdk,
    "--file", "Query.ets",
    "--symbol", "Thing",
    "--line", "0",
    "--character", "1",
    "--oracle", oracle,
    "--out", output,
    "--server", silentServer,
    "--sidecar", silentServer,
    "--timeout-ms", "1000",
    "--diagnostic-timeout-ms", "1000",
    "--idle-ms", "0",
  ], { cwd: projectRoot, encoding: "utf8", timeout: 25_000 })

  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")).expectedComparableLocations, [location])
})

test("references replay cannot pass when automatic diagnostics never arrive", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-no-diagnostics-replay-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  const oracle = path.join(root, "oracle.json")
  const output = path.join(root, "result.json")
  fs.writeFileSync(oracle, "[]\n")
  const result = spawnSync(process.execPath, [
    runner,
    "--workspace", workspace,
    "--sdk", sdk,
    "--file", "Query.ets",
    "--symbol", "Thing",
    "--line", "0",
    "--character", "1",
    "--oracle", oracle,
    "--out", output,
    "--server", noDiagnosticsServer,
    "--sidecar", noDiagnosticsServer,
    "--timeout-ms", "3000",
    "--diagnostic-timeout-ms", "1000",
    "--idle-ms", "0",
  ], { cwd: projectRoot, encoding: "utf8", timeout: 15_000 })
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(output, "utf8"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.diagnostic.timeout, true)
  assert.equal(report.responses.length, 1)
  assert.equal(report.responses[0].validation.pass, true)
})

test("replay differential rejects false diagnostics despite exact reference Locations", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-replay-differential-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const baselinePath = path.join(directory, "baseline.json")
  const candidatePath = path.join(directory, "candidate.json")
  const baseline = {
    schemaVersion: 1,
    status: "PASS",
    environment: {
      workspace: "/workspace", workspaceRevision: "abc", sdk: "/sdk",
      sdkMetadata: { version: "1" },
    },
    target: { file: "Query.ets", symbol: "Thing", position: { line: 0, character: 10 }, includeDeclaration: true },
    requestEvidence: { explicitMethod: "textDocument/references" },
    normalizedReferences: [{ uri: "file:///workspace/Query.ets", range: {
      start: { line: 0, character: 9 }, end: { line: 0, character: 14 },
    } }],
    diagnostic: { version: 1, diagnostics: [] },
    failure: null,
  }
  fs.writeFileSync(baselinePath, JSON.stringify(baseline))
  fs.writeFileSync(candidatePath, JSON.stringify({
    ...baseline,
    diagnostic: { version: 1, diagnostics: [{
      code: 2304,
      severity: 1,
      message: "Cannot find name 'Column'.",
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } },
    }] },
  }))

  const result = spawnSync(process.execPath, [
    differential, "--baseline", baselinePath, "--candidate", candidatePath,
  ], { cwd: projectRoot, encoding: "utf8" })

  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stdout, /^REFERENCES_LOCATION_GATE=PASS$/mu)
  assert.match(result.stdout, /^DIAGNOSTIC_CORRECTNESS_GATE=FAIL$/mu)

  fs.writeFileSync(candidatePath, JSON.stringify(baseline))
  const exact = spawnSync(process.execPath, [
    differential, "--baseline", baselinePath, "--candidate", candidatePath,
  ], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(exact.status, 0, `${exact.stderr}\n${exact.stdout}`)
  assert.match(exact.stdout, /^REFERENCES_LOCATION_GATE=PASS$/mu)
  assert.match(exact.stdout, /^DIAGNOSTIC_CORRECTNESS_GATE=PASS$/mu)

  fs.writeFileSync(candidatePath, JSON.stringify({
    ...baseline,
    normalizedReferences: [],
  }))
  const missingLocation = spawnSync(process.execPath, [
    differential, "--baseline", baselinePath, "--candidate", candidatePath,
  ], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(missingLocation.status, 1, `${missingLocation.stderr}\n${missingLocation.stdout}`)
  assert.match(missingLocation.stdout, /^REFERENCES_LOCATION_GATE=FAIL$/mu)
  assert.match(missingLocation.stdout, /^DIAGNOSTIC_CORRECTNESS_GATE=PASS$/mu)

  fs.writeFileSync(candidatePath, JSON.stringify({
    ...baseline,
    diagnostic: { timeout: true, diagnostics: [] },
  }))
  const incomplete = spawnSync(process.execPath, [
    differential, "--baseline", baselinePath, "--candidate", candidatePath,
  ], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(incomplete.status, 2, `${incomplete.stderr}\n${incomplete.stdout}`)
  assert.match(incomplete.stderr, /incomplete or unsuccessful references replay/u)
  assert.equal(incomplete.stdout, "")

  fs.writeFileSync(candidatePath, JSON.stringify({
    ...baseline,
    environment: { ...baseline.environment, sdk: "/different-sdk" },
  }))
  const wrongSdk = spawnSync(process.execPath, [
    differential, "--baseline", baselinePath, "--candidate", candidatePath,
  ], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(wrongSdk.status, 2, `${wrongSdk.stderr}\n${wrongSdk.stdout}`)
  assert.match(wrongSdk.stderr, /replay SDK differs or is unavailable/u)
})
