import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { makeSuite, runSuite, saveSuite } from "./support/prepared-suite-fixture.mjs"

test("prepared collector retains unchanged native RSS JSONL after its temporary directory closes", async t => {
  const fixture = await makeSuite(t)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const report = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  if (assertUnsupportedSampling(report)) return
  assert.equal(report.requests.length, 2)
  assert.ok(report.requests.every(request => request.correctness.equal))
  assert.ok(report.memory.rawSamples, "the external sampler file survives temporary cleanup")
  assert.equal(report.memory.rawSamples.file, path.basename(fixture.output) + ".rss.jsonl")
  const file = path.join(path.dirname(fixture.output), report.memory.rawSamples.file)
  const bytes = fs.readFileSync(file)
  assert.equal(report.memory.rawSamples.byteLength, bytes.length)
  assert.equal(report.memory.rawSamples.sha256, createHash("sha256").update(bytes).digest("hex"))
  assert.deepEqual(bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).map(JSON.parse), report.memory.samples)
  assert.equal(report.gateStatus.memory, "BLOCKED", "real RSS is not a PSS release pass")
})

test("prepared collector rejects an existing raw artifact before native server launch", async t => {
  const fixture = await makeSuite(t)
  const original = Buffer.from("original sampler bytes\n")
  const raw = fixture.output + ".rss.jsonl"
  fs.writeFileSync(raw, original, { flag: "wx" })
  const marker = path.join(fixture.directory, "native-started")
  const wrapper = path.join(fixture.directory, "server.cjs")
  fs.writeFileSync(wrapper, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, String(process.pid));\n`
    + `void import(${JSON.stringify(pathToFileURL(fixture.suite.server).href)});\n`)
  fixture.suite.server = wrapper
  fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
  saveSuite(fixture)
  const result = runSuite(fixture)
  assert.equal(result.status, 2, result.stderr)
  assert.match(result.stderr, /PREPARED_SUITE_INVALID=OUTPUT_EXISTS/u)
  assert.equal(fs.existsSync(marker), false, "no native query process may start after output rejection")
  assert.equal(fs.existsSync(fixture.output), false)
  assert.deepEqual(fs.readFileSync(raw), original)
})

test("prepared native sampler artifacts are consumed by the public L08 CLI", async t => {
  const fixture = await makeSuite(t)
  const result = runSuite(fixture)
  assert.equal(result.status, 1, `${result.stderr}\n${result.stdout}`)
  const source = JSON.parse(fs.readFileSync(fixture.output, "utf8"))
  if (assertUnsupportedSampling(source)) return
  assert.equal(source.requests.length, 2)
  const out = path.join(fixture.directory, "release.json")
  const consumed = spawnSync(process.execPath, [path.resolve("scripts/bench/assert-semantic-release.mjs"),
    "--matrix", path.resolve("config/semantic-release-matrix.json"),
    "--prepared-report", fixture.output, "--out", out], { encoding: "utf8" })
  assert.equal(consumed.status, 1, consumed.stderr)
  const report = JSON.parse(fs.readFileSync(out))
  for (const cell of report.cells.filter(cell => cell.requests)) {
    const observed = cell.inputGroups[0].memoryEvidence[0]
    assert.equal(observed.status, "PASS", JSON.stringify(observed))
    assert.equal(observed.rawArtifact.file, fixture.output + ".rss.jsonl")
    assert.equal(observed.rawArtifact.sha256, source.memory.rawSamples.sha256)
    assert.equal(observed.sampleCount, source.memory.samples.length)
    assert.equal(cell.gates.memory, "BLOCKED")
  }
  assert.equal(report.releaseEligible, false, "fake semantic fixture plus real RSS cannot qualify product PSS")
})

function assertUnsupportedSampling(report) {
  if (["darwin", "linux"].includes(process.platform)) return false
  assert.equal(report.requests.length, 0, "unsupported sampling must never fabricate completed queries")
  assert.match(report.memory.samplerStderr, /external RSS sampling is unsupported/u)
  assert.equal(report.memory.rawSamples, undefined, "no raw bytes were produced")
  assert.equal(report.correctness.status, "FAIL")
  assert.ok(report.failure, "unsupported is a failed measurement, not a successful platform receipt")
  return true
}
