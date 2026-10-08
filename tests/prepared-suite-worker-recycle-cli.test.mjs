import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"

test("prepared suite observes an opt-in semantic Worker recycle before post-L3 references",
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-prepared-recycle-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const workspace = path.join(directory, "workspace")
    const sdk = path.join(directory, "sdk")
    fs.mkdirSync(workspace)
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))
    const source = ["export class WarmThing {}", "export const warm = new WarmThing()",
      "export class ColdThing {}", "export const cold = new ColdThing()", ""].join("\n")
    const sourcePath = path.join(workspace, "Query.ets")
    fs.writeFileSync(sourcePath, source)
    for (const args of [["init", "-q"], ["add", "Query.ets"],
      ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]]) {
      const git = spawnSync("git", args, { cwd: workspace, encoding: "utf8" })
      assert.equal(git.status, 0, git.stderr)
    }
    const span = (line, symbol) => {
      const character = source.split("\n")[line].indexOf(symbol)
      return { start: { line, character }, end: { line, character: character + symbol.length } }
    }
    const oracle = (name, symbol, declarationLine, usageLine) => {
      const file = path.join(directory, `${name}-oracle.json`)
      fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, locations: [
        { file: "Query.ets", range: span(declarationLine, symbol) },
        { file: "Query.ets", range: span(usageLine, symbol) },
      ] }))
      return { path: file, sha256: sha256File(file), verified: true }
    }
    const server = path.resolve("dist/server.cjs")
    const sidecar = path.resolve("target/release/arkts-index-sidecar")
    const suite = {
      schemaVersion: 1, benchmarkId: "prepared-recycle-real-lsp", seed: 20261008,
      workspace, sdk, server, sidecar,
      pins: await capturePreparedIdentity({ workspace, sdk, server, sidecar }),
      runtime: { timeoutMs: 30_000, diagnosticTimeoutMs: 30_000, sampleIntervalMs: 25,
        afterEvictionObservationMs: 120,
        env: { ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_TRACE: "1",
          ARKTS_BENCHMARK_CONTROL: "1", ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1",
          ARKTS_MEMORY_BUDGET_MB: "1024" } },
      readiness: { candidateControl: true }, preOpenTargetIds: ["warm", "cold"],
      targets: [
        { id: "warm", moduleId: "fixture", kind: "references", file: "Query.ets",
          symbol: "WarmThing", position: span(0, "WarmThing").start, includeDeclaration: true,
          sourceSha256: sha256File(sourcePath), oracle: oracle("warm", "WarmThing", 0, 1) },
        { id: "cold", moduleId: "fixture", kind: "references", file: "Query.ets",
          symbol: "ColdThing", position: span(2, "ColdThing").start, includeDeclaration: true,
          sourceSha256: sha256File(sourcePath), oracle: oracle("cold", "ColdThing", 2, 3) },
      ],
      scenarios: [
        { id: "prepare-warm", bucket: "first-unseen-symbol", targetId: "warm" },
        { id: "recover-cold", bucket: "after-eviction", targetId: "cold",
          waitForPreOpenDiagnostics: true },
      ],
    }
    const input = path.join(directory, "suite.json")
    const output = path.join(directory, "report.json")
    fs.writeFileSync(input, JSON.stringify(suite))
    const run = spawnSync(process.execPath,
      [path.resolve("scripts/bench/replay-references.mjs"), "--prepared-suite", input, "--out", output],
      { encoding: "utf8", timeout: 60_000 })
    assert.equal(run.status, 1, `${run.stderr}\n${run.stdout}`)
    const report = JSON.parse(fs.readFileSync(output, "utf8"))
    assert.equal(report.readiness.semantic.status, "READINESS_UNSUPPORTED")
    assert.equal(report.correctness.status, "PASS", JSON.stringify(report.failure))
    assert.equal(report.gateStatus.diagnostics, "PASS")
    assert.ok(report.requests.every(request => request.status === "COMPLETE" && request.correctness.equal))
    const eviction = report.timeline.find(event => event.phase === "memory-pressure-eviction-observed")
    const recycle = report.timeline.find(event => event.phase === "semantic-worker-recycle-complete")
    const observation = report.timeline.find(event => event.phase === "post-eviction-observation-complete")
    const query = report.timeline.find(event => event.phase === "request-start"
      && event.scenarioId === "recover-cold")
    assert.ok(eviction && recycle && observation && query)
    assert.equal(recycle.recycled, true)
    assert.ok(recycle.oldThreadId > 0 && recycle.newThreadId > 0)
    assert.notEqual(recycle.oldThreadId, recycle.newThreadId)
    assert.ok(eviction.monotonicMs <= recycle.monotonicMs)
    assert.ok(recycle.monotonicMs <= observation.monotonicMs)
    assert.ok(observation.monotonicMs <= query.monotonicMs)
    assert.equal(report.inputIdentity.inputUnchanged, true)
  })
