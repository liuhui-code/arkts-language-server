import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { compareAnswers } from "../scripts/semantic/semantic-facts-spike/consumer.mjs"
import { createSpikeProject } from "../scripts/semantic/ohos-typescript-spike/backend-host.mjs"
import ts from "typescript"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(root, "scripts/semantic/semantic-facts-spike/run.mjs")
const fixture = path.join(root, "tests/fixtures/semantic-facts/ordinary.json")
const queries = path.join(root, "tests/fixtures/semantic-facts/ordinary-queries.json")

test("bulk facts answer unqueried exported functions after extraction process exits", (t) => {
  const output = temporaryOutput(t)
  const result = invoke(["--mode", "run", "--input", fixture, "--queries", queries, "--out", output])
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.equal(report.extraction.findReferencesCalls, 0)
  assert.equal(report.extraction.requestedQueries, 0)
  assert.equal(report.consumer.compilerLoaded, false)
  assert.equal(report.consumer.answerCacheEntries, 0)
  assert.notEqual(report.extraction.pid, report.consumer.pid)
  assert.notEqual(report.extraction.pid, report.oracle.pid)
  assert.ok(report.extraction.processExitedBeforeQuery)
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers.map(({ locations }) => locations.length), [3, 2, 3, 2])
  assert.equal(report.productionApproved, false)
  assert.equal(report.extraction.artifactBytes, fs.statSync(path.join(output, "facts.json")).size)
})

test("compiler binding APIs preserve import/re-export aliases, quoted and shorthand refs", (t) => {
  const result = invoke(["--mode", "run", "--input", fixturePath("aliases.json"),
    "--queries", fixturePath("aliases-queries.json"), "--out", temporaryOutput(t)])
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.deepEqual(report.differences, [])
  const expected = [
    location("a.ets", 0, 16, 19), location("a.ets", 1, 0, 3),
    location("b.ets", 0, 9, 12), location("b.ets", 0, 16, 25),
    location("c.ets", 0, 9, 18), location("c.ets", 0, 22, 30),
    location("c.ets", 2, 0, 8), location("c.ets", 3, 4, 13), location("c.ets", 4, 17, 25),
  ]
  assert.deepEqual(report.answers[0].locations, expected)
  assert.deepEqual(report.answers[1].locations, expected.slice(1))
  assert.deepEqual(report.answers[2].locations, expected.slice(1))
  assert.deepEqual(report.answers[3].locations, [location("collision.ets", 1, 0, 3)])
  assert.deepEqual(report.extraction.diagnostics, [])
})

test("facts-only consumer works with source input gone and target chosen after extraction", (t) => {
  const output = temporaryOutput(t)
  const input = path.join(output, "input.json")
  const facts = path.join(output, "facts.json")
  fs.copyFileSync(fixture, input)
  const extraction = invoke(["--mode", "extract", "--input", input])
  assert.equal(extraction.status, 0, extraction.stderr)
  fs.writeFileSync(facts, JSON.stringify(JSON.parse(extraction.stdout).facts))
  fs.unlinkSync(input)
  const result = invoke(["--mode", "query", "--facts", facts, "--queries", queries])
  assert.equal(result.status, 0, result.stderr)
  const consumer = JSON.parse(result.stdout)
  assert.equal(consumer.metrics.compilerLoaded, false)
  assert.equal(consumer.answers[2].locations.length, 3)
})

test("mandatory constructor projection counterexample blocks production, never passes as empty", (t) => {
  const output = temporaryOutput(t)
  const result = invoke(["--mode", "run", "--input", fixturePath("constructor.json"),
    "--queries", fixturePath("constructor-queries.json"), "--out", output])
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.differences.map(({ id }) => id), ["constructor-false", "constructor-true"])
  assert.deepEqual(report.differences[0].missing, [
    location("model.ets", 4, 4, 8), location("model.ets", 5, 4, 11),
  ])
  assert.equal(report.answers[1].status, "UNSUPPORTED")
  const oracle = JSON.parse(fs.readFileSync(path.join(output, "oracle.json"), "utf8"))
  assert.equal(oracle.answers[1].locations.length, 2)
  assert.equal(oracle.answers[2].locations.length, 3)
})

test("comparison rejects surplus and duplicate answers instead of certifying a prefix", () => {
  const q1 = { id: "q1", status: "HYPOTHESIS", locations: [] }
  const q2 = { id: "q2", status: "HYPOTHESIS", locations: [] }
  const oracle = { ...q1, status: "COMPLETE" }
  assert.notDeepEqual(compareAnswers([q1, q2], [oracle]), [])
  assert.notDeepEqual(compareAnswers([q1, q1], [oracle]), [])
  assert.notDeepEqual(compareAnswers([q1], [oracle], ["q1", "q2"]), [])
})

test("compiler diagnostic errors cannot be reported as a passed semantic slice", (t) => {
  const output = temporaryOutput(t)
  const input = path.join(output, "invalid.json")
  const parsed = JSON.parse(fs.readFileSync(fixture, "utf8"))
  parsed.files["origin.ets"] += "const invalid: number = 'not a number'\n"
  fs.writeFileSync(input, JSON.stringify(parsed))
  const result = invoke(["--mode", "run", "--input", input, "--queries", queries, "--out", output])
  assert.equal(result.status, 42, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "ENVIRONMENT_BLOCKED")
  assert.ok(report.extraction.errorDiagnostics > 0)
  assert.deepEqual(report.differences, [])
})

test("extract CLI rejects target prequery arguments and evidence is never overwritten", (t) => {
  const invalid = invoke(["--mode", "extract", "--input", fixture, "--queries", queries])
  assert.equal(invalid.status, 2)
  const output = temporaryOutput(t)
  fs.writeFileSync(path.join(output, "report.json"), "keep this evidence\n")
  const result = invoke(["--mode", "run", "--input", fixture,
    "--queries", queries, "--out", output])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /refusing to overwrite/u)
  assert.equal(fs.readFileSync(path.join(output, "report.json"), "utf8"), "keep this evidence\n")
})

test("extraction host forbids whole-project reference queries rather than assuming zero", () => {
  const project = createSpikeProject(ts, root, { "a.ets": "export function Foo() {}\nFoo()\n" },
    { forbidReferenceQueries: true })
  try {
    assert.throws(() => project.referenceGroups("a.ets", 16), /forbidden during extraction/u)
    assert.throws(() => project.references("a.ets", 16), /forbidden during extraction/u)
    assert.equal(project.stats().referenceSearchCalls, 0)
  } finally {
    project.dispose()
  }
})

for (const mutation of ["queries", "source"]) {
  test(`experiment rejects ${mutation} changes between extraction and fresh oracle`, async (t) => {
    const output = temporaryOutput(t)
    const input = path.join(output, "input.json")
    const queryFile = path.join(output, "queries.json")
    fs.copyFileSync(fixture, input)
    fs.copyFileSync(queries, queryFile)
    let changed = false
    const timer = setInterval(() => {
      if (!fs.existsSync(path.join(output, "facts.json")) || changed) return
      changed = true
      const target = mutation === "queries" ? queryFile : input
      const parsed = JSON.parse(fs.readFileSync(target, "utf8"))
      if (mutation === "queries") parsed.queries.pop()
      else parsed.files["origin.ets"] += "// no selected reference changed\n"
      fs.writeFileSync(target, JSON.stringify(parsed))
    }, 5)
    t.after(() => clearInterval(timer))
    const result = await invokeAsync(["--mode", "run", "--input", input,
      "--queries", queryFile, "--out", output])
    assert.equal(changed, true)
    assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
    assert.match(result.stderr, /input changed/u)
    assert.equal(fs.existsSync(path.join(output, "report.json")), false)
  })
}

function fixturePath(name) {
  return path.join(root, "tests/fixtures/semantic-facts", name)
}

function location(file, line, start, end) {
  return { file, start: { line, character: start }, end: { line, character: end } }
}

function invoke(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  })
}

function invokeAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: root, timeout: 30_000 })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (status) => resolve({ status, stdout, stderr }))
  })
}

function temporaryOutput(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-facts-spike-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}
