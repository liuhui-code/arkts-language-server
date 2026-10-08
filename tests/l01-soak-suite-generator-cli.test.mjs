import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const generator = path.resolve("scripts/bench/generate-l01-soak-suite.mjs")

test("L01 generator alternates exact 9/10 unsaved snapshots and repeated L3 recovery", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l01-soak-suite-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const basePath = path.join(directory, "base.json")
  const outPath = path.join(directory, "soak.json")
  const homeOracle = { path: "home-nine.json", sha256: "a".repeat(64), verified: true }
  const editedOracle = { path: "home-ten.json", sha256: "b".repeat(64), verified: true }
  const base = {
    schemaVersion: 1, benchmarkId: "settings-resident-L01", seed: 20261006,
    runtime: { env: { ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full", ARKTS_SEMANTIC_SESSION_REUSE: "off" } },
    targets: [{ id: "home-class", kind: "references", file: "HomeInitData.ets", oracle: homeOracle }],
    scenarios: [
      { id: "home-baseline", bucket: "first-unseen-symbol", targetId: "home-class" },
      { id: "home-new-unsaved-reference", bucket: "edit-reference", targetId: "home-class",
        edit: { file: "HomeInitData.ets", changes: [{ range: {
          start: { line: 28, character: 45 }, end: { line: 28, character: 45 },
        }, newText: "\nhomeInitData = new HomeInitData();" }], oracle: editedOracle } },
    ],
  }
  fs.writeFileSync(basePath, JSON.stringify(base))
  const run = spawnSync(process.execPath, [generator, "--base", basePath, "--out", outPath,
    "--cycles", "100", "--pressure-every", "20", "--idle-ms", "200"], { encoding: "utf8" })
  assert.equal(run.status, 0, run.stderr)
  const suite = JSON.parse(fs.readFileSync(outPath, "utf8"))
  assert.equal(suite.scenarios.filter(item => item.bucket === "edit-reference").length, 100)
  assert.equal(suite.scenarios.filter(item => item.bucket === "pressure-recovery-repeat").length, 5)
  assert.deepEqual(suite.scenarios.slice(0, 3).map(item => item.edit?.oracle.path),
    [undefined, "home-ten.json", "home-nine.json"])
  assert.equal(suite.runtime.env.ARKTS_REFERENCES_TRACE, "1")
  assert.equal(suite.runtime.env.ARKTS_BENCHMARK_CONTROL, "1")
  assert.equal(suite.runtime.postIdleMs, 200)
  assert.equal(suite.scenarios.at(-1).bucket, "pressure-recovery-repeat")

  const noPressurePath = path.join(directory, "soak-no-pressure.json")
  const noPressure = spawnSync(process.execPath, [generator, "--base", basePath, "--out", noPressurePath,
    "--cycles", "100", "--pressure-every", "0", "--idle-ms", "200"], { encoding: "utf8" })
  assert.equal(noPressure.status, 0, noPressure.stderr)
  const traceOffSuite = JSON.parse(fs.readFileSync(noPressurePath, "utf8"))
  assert.equal(traceOffSuite.scenarios.filter(item => item.bucket === "pressure-recovery-repeat").length, 0)
  assert.equal(traceOffSuite.runtime.env.ARKTS_REFERENCES_TRACE, "0")
  assert.equal(traceOffSuite.runtime.env.ARKTS_BENCHMARK_CONTROL, undefined)

  const diagnosticPath = path.join(directory, "short-diagnostic.json")
  const shortRun = spawnSync(process.execPath, [generator, "--base", basePath,
    "--out", diagnosticPath, "--cycles", "20", "--pressure-every", "0",
    "--idle-ms", "200", "--mode", "diagnostic"], { encoding: "utf8" })
  assert.equal(shortRun.status, 0, shortRun.stderr)
  const diagnostic = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"))
  assert.equal(diagnostic.scenarios.filter(item => item.bucket === "edit-reference").length, 20)
  assert.match(diagnostic.benchmarkId, /diagnostic/u)

  const diagnosticTracePath = path.join(directory, "short-diagnostic-trace.json")
  const tracedRun = spawnSync(process.execPath, [generator, "--base", basePath,
    "--out", diagnosticTracePath, "--cycles", "20", "--pressure-every", "0",
    "--idle-ms", "200", "--mode", "diagnostic", "--trace", "1"], { encoding: "utf8" })
  assert.equal(tracedRun.status, 0, tracedRun.stderr)
  const traced = JSON.parse(fs.readFileSync(diagnosticTracePath, "utf8"))
  assert.equal(traced.runtime.env.ARKTS_REFERENCES_TRACE, "1")
  assert.equal(traced.runtime.env.ARKTS_BENCHMARK_CONTROL, undefined)
  assert.equal(traced.scenarios.filter(item => item.bucket === "pressure-recovery-repeat").length, 0)

  const metricsPath = path.join(directory, "worker-memory.jsonl")
  const measuredPath = path.join(directory, "short-diagnostic-metrics.json")
  const measuredRun = spawnSync(process.execPath, [generator, "--base", basePath,
    "--out", measuredPath, "--cycles", "20", "--pressure-every", "0",
    "--idle-ms", "200", "--mode", "diagnostic", "--trace", "1",
    "--metrics-out", metricsPath], { encoding: "utf8" })
  assert.equal(measuredRun.status, 0, measuredRun.stderr)
  const measured = JSON.parse(fs.readFileSync(measuredPath, "utf8"))
  assert.equal(measured.runtime.env.ARKTS_MEMORY_METRICS_FILE, metricsPath)

  const indexedPath = path.join(directory, "short-diagnostic-indexed.json")
  const indexedRun = spawnSync(process.execPath, [generator, "--base", basePath,
    "--out", indexedPath, "--cycles", "20", "--pressure-every", "0",
    "--idle-ms", "200", "--mode", "diagnostic", "--trace", "1",
    "--strategy", "indexed-batched"], { encoding: "utf8" })
  assert.equal(indexedRun.status, 0, indexedRun.stderr)
  const indexed = JSON.parse(fs.readFileSync(indexedPath, "utf8"))
  assert.equal(indexed.runtime.env.ARKTS_REFERENCES_STRATEGY, "indexed-batched")
  assert.equal(indexed.runtime.env.ARKTS_REFERENCES_SDK_AMBIENT_PROFILE, "full")
  assert.deepEqual({ ...indexed.runtime.env, ARKTS_REFERENCES_STRATEGY: "legacy" },
    traced.runtime.env)
  assert.deepEqual(indexed.scenarios, traced.scenarios)
  assert.match(indexed.benchmarkId, /indexed-batched/u)

  const invalidSoak = spawnSync(process.execPath, [generator, "--base", basePath,
    "--out", path.join(directory, "invalid-soak.json"), "--cycles", "100",
    "--pressure-every", "0", "--idle-ms", "200", "--strategy", "indexed-batched"],
  { encoding: "utf8" })
  assert.equal(invalidSoak.status, 2)
  assert.match(invalidSoak.stderr, /L01_SOAK_INVALID=MODE/u)

  const registryPath = path.join(directory, "registry-probe.jsonl")
  const probedPath = path.join(directory, "short-diagnostic-registry.json")
  const probedRun = spawnSync(process.execPath, [generator, "--base", basePath,
    "--out", probedPath, "--cycles", "4", "--pressure-every", "0",
    "--idle-ms", "200", "--mode", "diagnostic", "--trace", "1",
    "--registry-probe-out", registryPath], { encoding: "utf8" })
  assert.equal(probedRun.status, 0, probedRun.stderr)
  const probed = JSON.parse(fs.readFileSync(probedPath, "utf8"))
  assert.equal(probed.runtime.env.ARKTS_L01_REGISTRY_PROBE_FILE, registryPath)
  assert.equal(probed.runtime.env.ARKTS_BENCHMARK_CONTROL, "1")
  assert.equal(probed.scenarios.filter(item => item.bucket === "pressure-recovery-repeat").length, 0)
  const invalidProbe = spawnSync(process.execPath, [generator, "--base", basePath,
    "--out", path.join(directory, "invalid-probe.json"), "--cycles", "100",
    "--pressure-every", "0", "--idle-ms", "200",
    "--registry-probe-out", registryPath], { encoding: "utf8" })
  assert.equal(invalidProbe.status, 2)
  assert.match(invalidProbe.stderr, /L01_SOAK_INVALID=MODE/u)
})
