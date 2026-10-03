import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { postIdleTiming, targetRssCoverage } from "../scripts/bench/settings-mixed-report.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runner = path.join(root, "scripts/bench/replay-settings-mixed-ops.mjs")

function invoke(...args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root, encoding: "utf8", timeout: 10_000,
  })
}

test("Settings mixed replay rejects fewer than 100 actual disk edits", () => {
  const result = invoke("--workspace", "/unused/workspace", "--sdk", "/unused/sdk",
    "--out", "/unused/report.json", "--session-reuse", "off", "--operations", "99")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /--operations must be at least 100/u)
})

test("Settings mixed replay accepts a default-off index rejection probe flag", () => {
  const result = invoke("--workspace", "/unused/workspace", "--sdk", "/unused/sdk",
    "--out", "/unused/report.json", "--session-reuse", "off", "--operations", "99",
    "--index-rejection-snapshot")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /--operations must be at least 100/u)
  assert.doesNotMatch(result.stderr, /unknown argument/u)
})

test("Settings mixed replay accepts a default-off post-idle reference check", () => {
  const result = invoke("--workspace", "/unused/workspace", "--sdk", "/unused/sdk",
    "--out", "/unused/report.json", "--session-reuse", "off", "--operations", "99",
    "--post-idle-reference")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /--operations must be at least 100/u)
  assert.doesNotMatch(result.stderr, /unknown argument/u)
})

test("Settings mixed replay refuses a report path inside the source checkout", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-mixed-cli-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const output = path.join(workspace, "reports", "run.json")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", output, "--session-reuse", "experimental", "--operations", "100")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=OUTPUT_INSIDE_SOURCE/u)
  assert.equal(fs.existsSync(path.dirname(output)), false)
})

test("mixed replay requires continuous RSS samples for the target Node PID", () => {
  const sample = (timestamp, pid = 42, rssBytes = 100) => ({
    timestamp, processes: [{ role: "server", pid, rssBytes }],
  })
  const valid = targetRssCoverage([
    sample(900), sample(1050), sample(1200), sample(1350),
  ], 42, 1000, 1300, 50)
  assert.equal(valid.sampleCount, 4)
  assert.equal(valid.coversOperations, true)
  assert.equal(valid.continuous, true)

  const wrongPid = targetRssCoverage([
    sample(900, 43), sample(1050, 43), sample(1350, 43),
  ], 42, 1000, 1300, 50)
  assert.equal(wrongPid.sampleCount, 0)
  assert.equal(wrongPid.coversOperations, false)

  const missingStart = targetRssCoverage([
    sample(1050), sample(1200), sample(1350),
  ], 42, 1000, 1300, 50)
  assert.equal(missingStart.coversOperations, false)

  const missingEnd = targetRssCoverage([
    sample(900), sample(1050), sample(1200),
  ], 42, 1000, 1300, 50)
  assert.equal(missingEnd.coversOperations, false)

  const longGap = targetRssCoverage([
    sample(900), sample(1000), sample(3000), sample(3100),
  ], 42, 1000, 3000, 50)
  assert.equal(longGap.coversOperations, true)
  assert.equal(longGap.continuous, false)

  const invalidRss = targetRssCoverage([
    sample(900, 42, 0), sample(1050, 42, NaN), sample(1350, 42, 100),
  ], 42, 1000, 1300, 50)
  assert.equal(invalidRss.coversOperations, false)
})

test("post-idle catalog wait excludes the following references request", () => {
  assert.deepEqual(postIdleTiming(1_000, 9_600, 9_630, 15_180), {
    waitMs: 8_600,
    queryMs: 5_550,
  })
})
