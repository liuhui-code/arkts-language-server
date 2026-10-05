import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(root, "scripts/semantic/semantic-facts-spike/run.mjs")
const oldBuilder = path.join(root, "scripts/semantic/semantic-facts-spike/build-bulk-hook.mjs")
const builder = path.join(root, "scripts/semantic/semantic-facts-spike/build-worklist-hook.mjs")
const fixtures = path.join(root, "tests/fixtures/semantic-facts")
const stockCompiler = path.join(root, "node_modules/typescript/lib/typescript.js")

test("v4 refuses a stock compiler without the isolated worklist hook", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worklist-hook-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v4",
    "--compiler-artifact", stockCompiler,
    "--input", path.join(fixtures, "constructor-collision.json"),
    "--queries", path.join(fixtures, "constructor-collision-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.failureCode, "HOOK_UNAVAILABLE")
  assert.equal(report.hypothesis, "compiler-bulk-reference-groups-v4")
  assert.equal(report.productionApproved, false)
  assert.equal(report.s02Gate, "NOT_MET")
  assert.ok(report.untested.includes("Settings/SDK pressure"))
  assert.match(report.compilerArtifactSha256, /^[0-9a-f]{64}$/u)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, "evidence/report.json"), "utf8")), report)
})

test("v5 refuses a stock compiler without the origin worklist hook", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-origin-stock-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-origin-reference-groups-v5",
    "--compiler-artifact", stockCompiler,
    "--input", path.join(fixtures, "constructor-edges.json"),
    "--queries", path.join(fixtures, "constructor-edges-supported-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.failureCode, "HOOK_UNAVAILABLE")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
})

test("v5 preserves modified constructor declaration policy with one shared worklist", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-origin-modifier-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--variant", "origin-v5", "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-origin-reference-groups-v5", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-edges.json"),
    "--queries", path.join(fixtures, "constructor-edges-supported-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [3, 3])
  assert.equal(report.extraction.findReferencesCalls, 0)
  assert.equal(report.extraction.internalGroupQueries, 0)
  assert.equal(report.extraction.perTargetFullFileScans, 0)
  assert.equal(report.extraction.sharedWorklistPasses, 1)
  assert.ok(report.extraction.definitionCalls >= 1)
  assert.ok(report.extraction.originStateCount >= 1)
})

test("v5 separates same-name origins and fails closed for usage-site multi-definitions", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-origin-boundary-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--variant", "origin-v5", "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const replay = (name, queries) => spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-origin-reference-groups-v5", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, `${name}.json`),
    "--queries", path.join(fixtures, queries),
    "--out", path.join(output, name)],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  const collision = replay("constructor-collision", "constructor-collision-queries.json")
  assert.equal(collision.status, 0, `${collision.stderr}\n${collision.stdout}`)
  const exact = JSON.parse(collision.stdout)
  assert.equal(exact.status, "SLICE_PASS")
  assert.deepEqual(exact.differences, [])
  assert.deepEqual(exact.answers.map(({ locations }) => locations.length), [3, 3, 4, 4])
  assert.equal(exact.extraction.internalGroupQueries, 0)
  assert.equal(exact.extraction.sharedWorklistPasses, 1)

  const usage = replay("constructor", "constructor-new-expression-queries.json")
  assert.equal(usage.status, 42, `${usage.stderr}\n${usage.stdout}`)
  const unsupported = JSON.parse(usage.stdout)
  assert.equal(unsupported.status, "FAIL")
  assert.equal(unsupported.s02Gate, "NOT_MET")
  assert.deepEqual(unsupported.answers.map(({ status, locations }) => [status, locations.length]),
    [["UNSUPPORTED", 0], ["UNSUPPORTED", 0]])
  assert.deepEqual(unsupported.differences.map(({ id, missing, extra }) =>
    [id, missing.length, extra.length]), [["new-base", 3, 0], ["new-derived", 4, 0]])
})

test("v6 answers inherited new-expression cursors from complete ordered origins", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-usage-origins-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--variant", "usage-v6", "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-origin-reference-groups-v6", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor.json"),
    "--queries", path.join(fixtures, "constructor-new-expression-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [3, 4])
  assert.equal(report.extraction.findReferencesCalls, 0)
  assert.equal(report.extraction.internalGroupQueries, 0)
  assert.equal(report.extraction.perTargetFullFileScans, 0)
  assert.equal(report.extraction.sharedWorklistPasses, 1)
})

test("v6 applies declaration policy across every selected origin", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-usage-policy-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--variant", "usage-v6", "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-origin-reference-groups-v6", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor.json"),
    "--queries", path.join(fixtures, "constructor-new-expression-declaration-policies-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [2, 2, 3, 4])
})

test("v6 reports an unsupported constructor shape without publishing partial facts", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-usage-unsupported-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--variant", "usage-v6", "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const evidence = path.join(output, "evidence")
  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-origin-reference-groups-v6", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-call-shapes.json"),
    "--queries", path.join(fixtures, "constructor-call-shapes-queries.json"),
    "--out", evidence],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.failureCode, "HOOK_UNSUPPORTED")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
  assert.equal(fs.existsSync(path.join(evidence, "facts.json")), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(evidence, "report.json"), "utf8")), report)
})

test("v4 reports modified constructor declaration-policy divergence rather than passing", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worklist-modifier-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v4", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-edges.json"),
    "--queries", path.join(fixtures, "constructor-edges-supported-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.differences, [{
    id: "modified-false", status: "HYPOTHESIS", extra: [],
    missing: [{ file: "edges.ets", start: { line: 1, character: 9 },
      end: { line: 1, character: 20 } }],
  }])
})

test("v4 refuses inherited usage-site queries requiring multiple definitions", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worklist-usage-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v4", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor.json"),
    "--queries", path.join(fixtures, "constructor-new-expression-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
  assert.equal(report.oracle.findReferencesCalls, 3)
  assert.deepEqual(report.answers.map(({ status, locations }) => [status, locations.length]),
    [["UNSUPPORTED", 0], ["UNSUPPORTED", 0]])
  assert.deepEqual(report.differences.map(({ id, missing, extra }) =>
    [id, missing.length, extra.length]), [["new-base", 3, 0], ["new-derived", 4, 0]])
})

test("v4 shares a compiler worklist while keeping same-name constructors distinct", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worklist-collision-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v4", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-collision.json"),
    "--queries", path.join(fixtures, "constructor-collision-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.equal(report.hypothesis, "compiler-bulk-reference-groups-v4")
  assert.equal(report.productionApproved, false)
  assert.equal(report.s02Gate, "NOT_MET")
  assert.ok(report.untested.includes("Settings/SDK pressure"))
  assert.deepEqual(report.differences, [])
  assert.equal(report.extraction.errorDiagnostics, 0)
  assert.equal(report.extraction.requestedQueries, 0)
  assert.equal(report.extraction.findReferencesCalls, 0)
  assert.equal(report.extraction.bulkHookCalls, 1)
  assert.equal(report.extraction.constructorGroups, 2)
  assert.equal(report.extraction.internalGroupQueries, 0)
  assert.equal(report.extraction.perTargetFullFileScans, 0)
  assert.equal(report.extraction.sharedWorklistPasses, 1)
  assert.equal(report.extraction.fullProgramPasses, 2)
  assert.equal(report.extraction.importTrackerFullScans, 1)
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [3, 3, 4, 4])
  assert.notEqual(report.extraction.pid, report.consumer.pid)
  assert.notEqual(report.extraction.pid, report.oracle.pid)
})

test("v4 preserves inherited-alias constructor references against stock compiler", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worklist-heritage-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v4", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-heritage-counterexample.json"),
    "--queries", path.join(fixtures, "constructor-heritage-counterexample-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [0, 1])
  assert.equal(report.extraction.errorDiagnostics, 0)
  assert.equal(report.extraction.internalGroupQueries, 0)
  assert.equal(report.extraction.perTargetFullFileScans, 0)
})

test("v4 keeps overloaded constructor locations exact without per-target scans", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worklist-overloads-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [builder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v4", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-edges.json"),
    "--queries", path.join(fixtures, "constructor-edges-overload-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [2, 5])
  assert.equal(report.extraction.errorDiagnostics, 0)
  assert.equal(report.extraction.constructorGroups, 4)
  assert.equal(report.extraction.internalGroupQueries, 0)
  assert.equal(report.extraction.perTargetFullFileScans, 0)
  assert.equal(report.extraction.sharedWorklistPasses, 1)
})

test("v4 rejects a per-constructor hook even when its distinct-symbol answers are exact", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worklist-old-hook-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const artifact = path.join(output, "typescript.cjs")
  const build = spawnSync(process.execPath, [oldBuilder, "--out", artifact],
    { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(build.status, 0, `${build.stderr}\n${build.stdout}`)

  const result = spawnSync(process.execPath, [cli, "--mode", "run",
    "--hypothesis", "compiler-bulk-reference-groups-v4", "--compiler-artifact", artifact,
    "--input", path.join(fixtures, "constructor-collision.json"),
    "--queries", path.join(fixtures, "constructor-collision-queries.json"),
    "--out", path.join(output, "evidence")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })

  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.failureCode, "NON_BULK")
  assert.equal(report.s02Gate, "NOT_MET")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.differences, [])
  assert.equal(report.extraction.internalGroupQueries, 2)
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [3, 3, 4, 4])
})
