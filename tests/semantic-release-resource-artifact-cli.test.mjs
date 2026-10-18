import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { preparedMemory } from "../scripts/bench/prepared-query-report.mjs"
import { projectRoot } from "./support/lsp-process.mjs"
import { readyReport } from "./support/semantic-release-evidence-fixture.mjs"

const cli = path.join(projectRoot, "scripts/bench/assert-semantic-release.mjs")
const matrix = path.join(projectRoot, "config/semantic-release-matrix.json")
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

test("L08 rejects changed external RSS bytes while retaining complete query results", t => {
  const fixture = resourceFixture(t)
  fs.appendFileSync(fixture.raw, "\n")
  const report = evaluate(fixture)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 20)
  assert.equal(cell.gates.correctness, "PASS")
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_RAW_ARTIFACT_DIGEST_MISMATCH"))
  assert.equal(report.status, "FAIL")
  assert.equal(report.releaseEligible, false)
})

test("L08 rejects an independently hashed raw curve that differs from the report", t => {
  const fixture = resourceFixture(t)
  const samples = structuredClone(fixture.input.memory.samples)
  samples[1].processes[0].rssBytes++
  const bytes = Buffer.from(samples.map(sample => JSON.stringify(sample)).join("\n") + "\n")
  fs.writeFileSync(fixture.raw, bytes)
  fixture.input.memory.rawSamples.sha256 = sha(bytes)
  fixture.input.memory.rawSamples.byteLength = bytes.length
  const report = evaluate(fixture)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 20)
  assert.equal(cell.gates.correctness, "PASS")
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_RAW_ARTIFACT_CONTENT_MISMATCH"))
  assert.equal(report.status, "FAIL")
})

test("L08 rereads a portable raw artifact without mistaking consistent RSS for PSS", t => {
  const fixture = resourceFixture(t)
  const report = evaluate(fixture)
  const cell = report.cells.find(cell => cell.requests)
  const observed = cell.inputGroups[0].memoryEvidence[0]
  assert.equal(observed.status, "PASS", "raw integrity only")
  assert.deepEqual(observed.rawArtifact, { file: fixture.raw,
    sha256: fixture.input.memory.rawSamples.sha256,
    byteLength: fixture.input.memory.rawSamples.byteLength })
  assert.equal(observed.sampleCount, 3)
  assert.equal(cell.gates.memory, "BLOCKED")
  assert.ok(cell.reasons.includes("RSS_NOT_PSS_RELEASE_EVIDENCE"))
  assert.equal(report.releaseEligible, false)
})

test("L08 preserves exact query rows when the declared raw artifact is missing", t => {
  const fixture = resourceFixture(t)
  fs.unlinkSync(fixture.raw)
  const report = evaluate(fixture)
  const cell = report.cells.find(cell => cell.requests)
  assert.equal(cell.requests, 20)
  assert.equal(cell.gates.correctness, "PASS")
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_RAW_ARTIFACT_MISSING"))
})

test("L08 rejects malformed unsafe or invalidly encoded raw artifact declarations", t => {
  for (const [name, mutate, reason] of [
    ["null", memory => { memory.rawSamples = null }, "MEMORY_RAW_ARTIFACT_INVALID"],
    ["absolute", memory => { memory.rawSamples.file = "/tmp/rss.jsonl" }, "MEMORY_RAW_ARTIFACT_INVALID"],
    ["traversal", memory => { memory.rawSamples.file = "../rss.jsonl" }, "MEMORY_RAW_ARTIFACT_INVALID"],
    ["windows-path", memory => { memory.rawSamples.file = "C:\\rss.jsonl" }, "MEMORY_RAW_ARTIFACT_INVALID"],
    ["windows-drive-relative", memory => { memory.rawSamples.file = "C:rss.jsonl" }, "MEMORY_RAW_ARTIFACT_INVALID"],
    ["wrong-hash", memory => { memory.rawSamples.sha256 = "0" }, "MEMORY_RAW_ARTIFACT_INVALID"],
    ["unsafe-size", memory => { memory.rawSamples.byteLength = Number.MAX_SAFE_INTEGER + 1 }, "MEMORY_RAW_ARTIFACT_INVALID"],
    ["malformed-json", (_memory, fixture) => {
      const bytes = Buffer.from("{\n")
      fs.writeFileSync(fixture.raw, bytes)
      fixture.input.memory.rawSamples = { file: path.basename(fixture.raw), sha256: sha(bytes), byteLength: bytes.length }
    }, "MEMORY_RAW_ARTIFACT_CONTENT_INVALID"],
  ]) {
    const fixture = resourceFixture(t)
    mutate(fixture.input.memory, fixture)
    const cell = evaluate(fixture).cells.find(cell => cell.requests)
    assert.equal(cell.gates.memory, "FAIL", name)
    assert.ok(cell.reasons.includes(reason), name)
    assert.equal(cell.requests, 20, name)
  }
})

test("L08 rejects invalid UTF-8 instead of silently repairing raw JSONL bytes", t => {
  const fixture = resourceFixture(t)
  const text = fs.readFileSync(fixture.raw, "utf8").replace('"role":"server"', '"role":"INVALID_BYTE"')
  const index = text.indexOf("INVALID_BYTE")
  const bytes = Buffer.concat([Buffer.from(text.slice(0, index)), Buffer.from([0x80]),
    Buffer.from(text.slice(index + "INVALID_BYTE".length))])
  fs.writeFileSync(fixture.raw, bytes)
  fixture.input.memory.rawSamples = { file: path.basename(fixture.raw), sha256: sha(bytes), byteLength: bytes.length }
  fixture.input.memory.samples[0].processes[0].role = "\ufffd"
  const cell = evaluate(fixture).cells.find(cell => cell.requests)
  assert.equal(cell.gates.memory, "FAIL")
  assert.ok(cell.reasons.includes("MEMORY_RAW_ARTIFACT_CONTENT_INVALID"))
  assert.equal(cell.requests, 20)
})

test("L08 marks legacy embedded-only RSS as unbound without relabeling its observations", t => {
  const fixture = resourceFixture(t)
  delete fixture.input.memory.rawSamples
  const cell = evaluate(fixture).cells.find(cell => cell.requests)
  assert.equal(cell.requests, 20)
  assert.equal(cell.inputGroups[0].memoryEvidence[0].status, "PASS", "legacy internal consistency is preserved")
  assert.equal(cell.inputGroups[0].memoryEvidence[0].rawArtifact, undefined)
  assert.ok(cell.reasons.includes("MEMORY_RAW_ARTIFACT_NOT_BOUND"))
  assert.equal(cell.gates.memory, "BLOCKED")
})

function resourceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l08-resource-artifact-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const input = readyReport(0)
  const samples = [10, 20, 30].map((offset, index) => ({
    timestamp: input.timeline[0].timestamp + offset,
    monotonicMs: 100 + index * 10, completedTimestamp: input.timeline[0].timestamp + offset + 2,
    completedMonotonicMs: 102 + index * 10, totalRssBytes: 800 + index * 100,
    samplerRssBytes: 50,
    processes: [{ role: "server", pid: input.memory.targetPid, rssBytes: 600 + index * 100 },
      { role: "sidecar", pid: 432, rssBytes: 200 }],
  }))
  input.memory = preparedMemory(samples, input.memory.targetPid, 10, "")
  input.memory.platform = "darwin"
  const raw = path.join(root, "rss.jsonl")
  const bytes = Buffer.from(samples.map(sample => JSON.stringify(sample)).join("\n") + "\n")
  fs.writeFileSync(raw, bytes, { flag: "wx" })
  input.memory.rawSamples = { file: path.basename(raw), sha256: sha(bytes), byteLength: bytes.length }
  // Synthetic records exercise the public consumer, not actual product RSS or PSS.
  return { root, input, raw }
}

function evaluate({ root, input }) {
  const source = path.join(root, "prepared.json")
  const out = path.join(root, "release.json")
  fs.writeFileSync(source, JSON.stringify(input))
  const result = spawnSync(process.execPath, [cli, "--matrix", matrix,
    "--prepared-report", source, "--out", out], { cwd: projectRoot, encoding: "utf8" })
  assert.equal(result.status, 1, result.stderr)
  return JSON.parse(fs.readFileSync(out))
}
