import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(root, "scripts/semantic/semantic-facts-spike/run.mjs")
const fixtures = path.join(root, "tests/fixtures/semantic-facts")
const hypothesis = "resolved-signature-explicit-constructor-v2"

test("v2 resolved signature facts exactly match inherited constructor references", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run", "--hypothesis", hypothesis,
    "--input", path.join(fixtures, "constructor.json"),
    "--queries", path.join(fixtures, "constructor-queries.json"), "--out", output],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.hypothesis, hypothesis)
  assert.equal(report.status, "SLICE_PASS")
  assert.equal(report.productionApproved, false)
  assert.equal(report.extraction.findReferencesCalls, 0)
  assert.equal(report.extraction.requestedQueries, 0)
  assert.equal(report.consumer.compilerLoaded, false)
  assert.notEqual(report.extraction.pid, report.consumer.pid)
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers[1].locations, [
    location("model.ets", 4, 4, 8), location("model.ets", 5, 4, 11),
  ])
  assert.deepEqual(report.answers[2].locations, [
    location("model.ets", 1, 2, 13), location("model.ets", 4, 4, 8),
    location("model.ets", 5, 4, 11),
  ])
})

test("v2 constructor facts include new this and super without crossing an own constructor", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run", "--hypothesis", hypothesis,
    "--input", path.join(fixtures, "constructor-barriers.json"),
    "--queries", path.join(fixtures, "constructor-barriers-queries.json"), "--out", output],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "SLICE_PASS")
  assert.deepEqual(report.differences, [])
  assert.deepEqual(report.answers[0].locations, [
    location("barriers.ets", 2, 31, 35), location("barriers.ets", 7, 18, 23),
    location("barriers.ets", 12, 4, 8), location("barriers.ets", 13, 4, 12),
    location("barriers.ets", 14, 4, 8),
  ])
  assert.deepEqual(report.answers[2].locations, [
    location("barriers.ets", 10, 18, 23), location("barriers.ets", 15, 4, 9),
  ])
  assert.equal(report.extraction.findReferencesCalls, 0)
})

test("v2 leaves modified constructor keyword queries unsupported when declaration filtering differs", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run", "--hypothesis", hypothesis,
    "--input", path.join(fixtures, "constructor-edges.json"),
    "--queries", path.join(fixtures, "constructor-edges-supported-queries.json"), "--out", output],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.productionApproved, false)
  assert.deepEqual(report.answers.map(({ status }) => status), ["UNSUPPORTED", "UNSUPPORTED"])
  assert.deepEqual(report.differences.map(({ id }) => id), ["modified-false", "modified-true"])
  assert.deepEqual(report.differences[0].missing, [
    location("edges.ets", 1, 9, 20), location("edges.ets", 4, 4, 9),
    location("edges.ets", 5, 4, 9),
  ])
})

test("v2 refuses new-expression cursors with unproven multi-target query semantics", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run", "--hypothesis", hypothesis,
    "--input", path.join(fixtures, "constructor.json"),
    "--queries", path.join(fixtures, "constructor-new-expression-queries.json"), "--out", output],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.deepEqual(report.answers.map(({ status }) => status), ["UNSUPPORTED", "UNSUPPORTED"])
  assert.deepEqual(report.differences.map(({ id }) => id), ["new-base", "new-derived"])
  assert.equal(report.productionApproved, false)
})

test("v2 leaves overloaded constructor keyword queries unsupported", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run", "--hypothesis", hypothesis,
    "--input", path.join(fixtures, "constructor-edges.json"),
    "--queries", path.join(fixtures, "constructor-edges-overload-queries.json"), "--out", output],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.deepEqual(report.answers.map(({ status }) => status), ["UNSUPPORTED", "UNSUPPORTED"])
  assert.deepEqual(report.differences.map(({ id }) => id), ["overload-false", "overload-true"])
  const oracle = JSON.parse(fs.readFileSync(path.join(output, "oracle.json"), "utf8"))
  assert.deepEqual(oracle.answers.map(({ locations }) => locations.length), [2, 5])
  assert.equal(report.productionApproved, false)
})

test("v2 fails closed when alias, parenthesized, or property-access calls resolve to a constructor", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run", "--hypothesis", hypothesis,
    "--input", path.join(fixtures, "constructor-call-shapes.json"),
    "--queries", path.join(fixtures, "constructor-call-shapes-queries.json"), "--out", output],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.deepEqual(report.answers.map(({ status }) => status), [
    "UNSUPPORTED", "UNSUPPORTED", "UNSUPPORTED", "UNSUPPORTED",
  ])
  assert.deepEqual(report.differences.map(({ id }) => id), [
    "base-false", "base-true", "named-false", "named-true",
  ])
  const oracle = JSON.parse(fs.readFileSync(path.join(output, "oracle.json"), "utf8"))
  assert.deepEqual(oracle.answers.map(({ locations }) => locations.length), [0, 1, 1, 2])
  assert.equal(report.productionApproved, false)
})

test("v1 facts ignore v2-only unsupported ranges and constructor keys", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const extraction = spawnSync(process.execPath, [cli, "--mode", "extract",
    "--input", path.join(fixtures, "ordinary.json")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(extraction.status, 0, extraction.stderr)
  const facts = JSON.parse(extraction.stdout).facts
  facts.unsupportedSelections = [{ file: "origin.ets", start: 16, length: 6 }]
  facts.unsupportedConstructorKeys = facts.selections.map(({ key }) => key)
  const factsPath = path.join(output, "facts.json")
  fs.writeFileSync(factsPath, JSON.stringify(facts))
  const result = spawnSync(process.execPath, [cli, "--mode", "query", "--facts", factsPath,
    "--queries", path.join(fixtures, "ordinary-queries.json")],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 0, result.stderr)
  const consumer = JSON.parse(result.stdout)
  assert.deepEqual(consumer.answers.map(({ status }) => status), [
    "HYPOTHESIS", "HYPOTHESIS", "HYPOTHESIS", "HYPOTHESIS",
  ])
  assert.deepEqual(consumer.answers.map(({ locations }) => locations.length), [3, 2, 3, 2])
})

test("v2 inherited alias and parenthesized heritage falsify constructor projection", (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resolved-signature-"))
  t.after(() => fs.rmSync(output, { recursive: true, force: true }))
  const result = spawnSync(process.execPath, [cli, "--mode", "run", "--hypothesis", hypothesis,
    "--input", path.join(fixtures, "constructor-heritage-counterexample.json"),
    "--queries", path.join(fixtures, "constructor-heritage-counterexample-queries.json"), "--out", output],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 42, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, "FAIL")
  assert.equal(report.productionApproved, false)
  assert.equal(report.extraction.errorDiagnostics, 0)
  assert.equal(report.extraction.findReferencesCalls, 0)
  assert.deepEqual(report.answers.map(({ status }) => status), ["HYPOTHESIS", "HYPOTHESIS"])
  const extra = [location("heritage.ets", 5, 4, 12), location("heritage.ets", 7, 4, 12)]
  assert.deepEqual(report.differences.map(({ id, missing, extra: surplus }) => (
    { id, missing, extra: surplus }
  )), [
    { id: "heritage-false", missing: [], extra },
    { id: "heritage-true", missing: [], extra },
  ])
  const oracle = JSON.parse(fs.readFileSync(path.join(output, "oracle.json"), "utf8"))
  assert.deepEqual(oracle.answers.map(({ locations }) => locations), [
    [], [location("heritage.ets", 1, 2, 13)],
  ])
})

function location(file, line, start, end) {
  return { file, start: { line, character: start }, end: { line, character: end } }
}
