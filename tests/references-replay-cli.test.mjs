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
