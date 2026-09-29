import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { digestSdk } from "../scripts/semantic/lock-toolchain.mjs"

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
  assert.equal(report.environment.standardLibrarySha256, null)
  assert.equal(report.environment.semanticWorkerSha256, null)
  assert.equal(report.environment.referenceVerifierWorkerSha256, null)
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
  assert.equal(report.diagnostic?.timeout, true, JSON.stringify({
    failure: report.failure, timeline: report.timeline.map(event => event.phase),
  }))
  assert.equal(report.responses.length, 1)
  assert.equal(report.responses[0].validation.pass, true)
})

test("references replay records the adjacent standard-library manifest and declaration bytes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-replay-stdlib-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  const serverDir = path.join(root, "server")
  for (const directory of [workspace, sdk, serverDir]) fs.mkdirSync(directory)
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  const oracle = path.join(root, "oracle.json")
  const server = path.join(serverDir, "server.mjs")
  const standardLibraryManifest = path.join(serverDir, "arkts-standard-library.json")
  const semanticWorker = path.join(serverDir, "semantic-worker.cjs")
  const referenceWorker = path.join(serverDir, "reference-verifier-worker.cjs")
  fs.writeFileSync(oracle, "[]\n")
  fs.copyFileSync(noDiagnosticsServer, server)
  fs.writeFileSync(semanticWorker, "// semantic worker bundle\n")
  fs.writeFileSync(referenceWorker, "// reference verifier worker bundle\n")
  fs.writeFileSync(standardLibraryManifest, JSON.stringify({
    schema: "arkts-language-server.standard-library",
    schemaVersion: 1,
    files: ["lib.a.d.ts", "lib.b.d.ts"],
  }))
  fs.writeFileSync(path.join(serverDir, "lib.a.d.ts"), "declare const Alpha: string\n")
  fs.writeFileSync(path.join(serverDir, "lib.b.d.ts"), "declare const Beta: string\n")

  const run = (name) => {
    const output = path.join(root, `${name}.json`)
    const result = spawnSync(process.execPath, [
      runner, "--workspace", workspace, "--sdk", sdk,
      "--file", "Query.ets", "--symbol", "Thing", "--line", "0", "--character", "1",
      "--oracle", oracle, "--out", output, "--server", server, "--sidecar", server,
      "--timeout-ms", "3000", "--diagnostic-timeout-ms", "1000", "--idle-ms", "0",
    ], { cwd: projectRoot, encoding: "utf8", timeout: 15_000 })
    assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
    return JSON.parse(fs.readFileSync(output, "utf8")).environment
  }

  const first = run("first")
  const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  assert.match(first.standardLibrarySha256, /^[0-9a-f]{64}$/u)
  assert.equal(first.semanticWorkerSha256, sha256(semanticWorker))
  assert.equal(first.referenceVerifierWorkerSha256, sha256(referenceWorker))
  assert.deepEqual(run("unchanged"), first)
  fs.writeFileSync(path.join(serverDir, "lib.b.d.ts"), "declare const Beta: number\n")
  const changedDeclaration = run("changed-declaration")
  assert.notEqual(changedDeclaration.standardLibrarySha256, first.standardLibrarySha256)
  fs.appendFileSync(standardLibraryManifest, "\n")
  assert.notEqual(run("changed-manifest").standardLibrarySha256, changedDeclaration.standardLibrarySha256)
})

test("references replay rejects a pinned standard-library mismatch before server launch", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-replay-stdlib-pin-test-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  const serverDir = path.join(root, "server")
  for (const directory of [workspace, path.join(sdk, "ets"), path.join(sdk, "toolchains"), serverDir]) {
    fs.mkdirSync(directory, { recursive: true })
  }
  fs.writeFileSync(path.join(workspace, "Query.ets"), "Thing\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({
    apiVersion: "24", version: "6.1.1.125",
  }))
  fs.writeFileSync(path.join(sdk, "ets", "lib.d.ts"), "declare const Thing: string\n")
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  git("init", "-q")
  git("add", "Query.ets")
  git("-c", "user.name=Replay Test", "-c", "user.email=replay@example.invalid", "commit", "-qm", "fixture")

  const server = path.join(serverDir, "server.mjs")
  fs.copyFileSync(noDiagnosticsServer, server)
  fs.writeFileSync(path.join(serverDir, "semantic-worker.cjs"), "// semantic worker bundle\n")
  fs.writeFileSync(path.join(serverDir, "reference-verifier-worker.cjs"), "// reference worker bundle\n")
  fs.writeFileSync(path.join(serverDir, "arkts-standard-library.json"), JSON.stringify({
    schema: "arkts-language-server.standard-library", schemaVersion: 1, files: ["lib.d.ts"],
  }))
  fs.writeFileSync(path.join(serverDir, "lib.d.ts"), "declare const Thing: string\n")
  const oracle = path.join(root, "oracle.json")
  fs.writeFileSync(oracle, JSON.stringify({ schemaVersion: 1, locations: [{
    file: "Query.ets", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
  }] }))
  const digestFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  const manifest = path.join(root, "manifest.json")
  const pin = {
    schemaVersion: 1, benchmarkId: "stdlib-mismatch", repoSha: git("rev-parse", "HEAD"),
    sdk: { apiVersion: "24", version: "6.1.1.125", declarationDigest: await digestSdk(sdk) },
    query: { file: "Query.ets", symbol: "Thing", line: 0, character: 1, includeDeclaration: true },
    oracle: { verified: true, expectedLocationCount: 1, sha256: digestFile(oracle) },
    serverSha256: digestFile(server), sidecarSha256: digestFile(server),
    standardLibrarySha256: "f".repeat(64),
  }
  fs.writeFileSync(manifest, JSON.stringify(pin))
  const output = path.join(root, "blocked.json")
  const args = [runner, "--manifest", manifest, "--workspace", workspace, "--sdk", sdk,
    "--file", "Query.ets", "--symbol", "Thing", "--line", "0", "--character", "1",
    "--oracle", oracle, "--out", output, "--server", server, "--sidecar", server,
    "--timeout-ms", "3000", "--diagnostic-timeout-ms", "1000", "--idle-ms", "0"]
  const blocked = spawnSync(process.execPath, args, { cwd: projectRoot, encoding: "utf8", timeout: 10_000 })
  assert.equal(blocked.status, 2, `${blocked.stderr}\n${blocked.stdout}`)
  assert.match(blocked.stderr, /BENCHMARK_BLOCKED=STANDARD_LIBRARY_MISMATCH/u)
  assert.equal(fs.existsSync(output), false, "the server started before rejecting the asset pin")

  delete pin.standardLibrarySha256
  fs.writeFileSync(manifest, JSON.stringify(pin))
  const unpinned = spawnSync(process.execPath, args, { cwd: projectRoot, encoding: "utf8", timeout: 15_000 })
  assert.equal(unpinned.status, 1, `${unpinned.stderr}\n${unpinned.stdout}`)
  assert.equal(fs.existsSync(output), true, "legacy manifests must remain replayable")

  const observed = JSON.parse(fs.readFileSync(output, "utf8")).environment
  pin.standardLibrarySha256 = observed.standardLibrarySha256
  for (const [field, reason] of [
    ["semanticWorkerSha256", "SEMANTIC_WORKER_MISMATCH"],
    ["referenceVerifierWorkerSha256", "REFERENCE_VERIFIER_WORKER_MISMATCH"],
  ]) {
    pin.semanticWorkerSha256 = observed.semanticWorkerSha256
    pin.referenceVerifierWorkerSha256 = observed.referenceVerifierWorkerSha256
    pin[field] = "f".repeat(64)
    fs.writeFileSync(manifest, JSON.stringify(pin))
    const blockedOutput = path.join(root, `${field}-blocked.json`)
    const blockedArgs = [...args]
    blockedArgs[blockedArgs.indexOf("--out") + 1] = blockedOutput
    const result = spawnSync(process.execPath, blockedArgs, {
      cwd: projectRoot, encoding: "utf8", timeout: 10_000,
    })
    assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
    assert.match(result.stderr, new RegExp(`BENCHMARK_BLOCKED=${reason}`, "u"))
    assert.equal(fs.existsSync(blockedOutput), false)
  }
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
