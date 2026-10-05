import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(root, "scripts/semantic/semantic-facts-spike/run.mjs")
const builder = path.join(root, "scripts/semantic/semantic-facts-spike/build-bulk-hook.mjs")
const fixtures = path.join(root, "tests/fixtures/semantic-facts")
const stockCompiler = path.join(root, "node_modules/typescript/lib/typescript.js")

test("v3 refuses a stock compiler without a bulk reference grouping hook", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-compiler-bulk-hook-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v3",
    "--compiler-artifact", stockCompiler,
    "--input", path.join(fixtures, "constructor-heritage-counterexample.json"),
    "--queries", path.join(fixtures, "constructor-heritage-counterexample-queries.json"),
    "--out", output], { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.status, "FAIL")
  assert.equal(report.failureCode, "HOOK_UNAVAILABLE")
  assert.equal(report.productionApproved, false)
  assert.match(report.compilerArtifactSha256, /^[0-9a-f]{64}$/)
  assert.equal(report.environment.repositoryHead.length, 40)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, "report.json"), "utf8")), report)
})

test("v3 reports exact inherited-alias answers but refuses per-constructor compiler queries", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-compiler-bulk-hook-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)
  const built = JSON.parse(build.stdout)
  assert.equal(built.artifactPath, artifact)
  assert.notEqual(built.artifactSha256, built.sourceSha256)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v3", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-heritage-counterexample.json"),
    "--queries", path.join(fixtures, "constructor-heritage-counterexample-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.failureCode, "NON_BULK")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.differences, [])
  assert.equal(report.extraction.requestedQueries, 0)
  assert.equal(report.extraction.findReferencesCalls, 0)
  assert.equal(report.extraction.bulkHookCalls, 1)
  assert.equal(report.extraction.fullProgramPasses, 1)
  assert.equal(report.extraction.innerFindReferencesCalls, 0)
  assert.ok(report.extraction.internalGroupQueries > 0)
  assert.equal(report.extraction.candidateFileSearches, 0)
  assert.equal(report.consumer.compilerLoaded, false)
  assert.notEqual(report.extraction.pid, report.consumer.pid)
  assert.notEqual(report.extraction.pid, report.oracle.pid)
  assert.notEqual(report.compiler.artifactSha256, report.compiler.stockRuntimeSha256)
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [0, 1])
})

test("v3 records per-constructor work across overloads without claiming a bulk pass", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-compiler-bulk-hook-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)
  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v3", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-edges.json"),
    "--queries", path.join(fixtures, "constructor-edges-overload-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.failureCode, "NON_BULK")
  assert.deepEqual(report.differences, [])
  assert.ok(report.extraction.internalGroupQueries > 1)
  assert.equal(report.extraction.candidateFileSearches, 0)
  assert.ok(report.extraction.containerSearches > 0)
})

test("v3 keeps same-name constructors in separate modules and aliases distinct", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-compiler-bulk-hook-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)
  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v3", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-collision.json"),
    "--queries", path.join(fixtures, "constructor-collision-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.failureCode, "NON_BULK")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.differences, [])
  assert.equal(report.extraction.errorDiagnostics, 0)
  assert.equal(report.extraction.fullProgramPasses, 1)
  assert.equal(report.extraction.bulkHookCalls, 1)
  assert.equal(report.extraction.internalGroupQueries, 2)

  const locations = new Map(report.answers.map((answer) => [answer.id, answer.locations]))
  assert.deepEqual(locations.get("left-false"), [
    { file: "left.ets", start: { line: 3, character: 24 }, end: { line: 3, character: 30 } },
    { file: "usage.ets", start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
    { file: "usage.ets", start: { line: 2, character: 18 }, end: { line: 2, character: 28 } },
  ])
  assert.deepEqual(locations.get("right-false"), [
    { file: "right.ets", start: { line: 3, character: 25 }, end: { line: 3, character: 31 } },
    { file: "usage.ets", start: { line: 1, character: 9 }, end: { line: 1, character: 15 } },
    { file: "usage.ets", start: { line: 3, character: 19 }, end: { line: 3, character: 30 } },
  ])
  assert.deepEqual(locations.get("left-true"), [
    { file: "left.ets", start: { line: 1, character: 2 }, end: { line: 1, character: 13 } },
    ...locations.get("left-false"),
  ])
  assert.deepEqual(locations.get("right-true"), [
    { file: "right.ets", start: { line: 1, character: 2 }, end: { line: 1, character: 13 } },
    ...locations.get("right-false"),
  ])
})
