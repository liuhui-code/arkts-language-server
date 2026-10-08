import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { capturePreparedIdentity } from "../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../scripts/bench/reference-replay-input.mjs"

const root = path.resolve(import.meta.dirname, "..")
const runner = path.join(root, "scripts/bench/discover-semantic-oracle.mjs")

test("implementation discovery preserves the complete public Location set across fresh processes", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-implementation-oracle-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "minimal.d.ts"), "declare interface Minimal {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  for (const file of ["NavigationContracts.ets", "NavigationImplementations.ets"]) {
    fs.copyFileSync(path.join(root, "fixtures/basic", file), path.join(workspace, file))
  }
  execFileSync("git", ["init", "-q", workspace])
  execFileSync("git", ["-C", workspace, "add", "."])
  execFileSync("git", ["-C", workspace, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "commit", "-qm", "fixed implementation fixture"])

  const manifest = {
    schemaVersion: 1,
    benchmarkId: "implementation-public-lsp-control",
    workspace,
    sdk,
    server: path.join(root, "dist/server.cjs"),
    sidecar: path.join(root, "target/release/arkts-index-sidecar"),
    query: { file: "NavigationContracts.ets", symbol: "Formatter",
      position: { line: 0, character: 20 }, sourceSha256: sha256File(path.join(workspace, "NavigationContracts.ets")) },
    knownLocation: { file: "NavigationImplementations.ets", range: {
      start: { line: 2, character: 13 }, end: { line: 2, character: 26 },
    } },
    runtime: { timeoutMs: 20_000, diagnosticTimeoutMs: 20_000, env: {
      ARKTS_SEMANTIC_SESSION_REUSE: "off",
    } },
  }
  manifest.pins = await capturePreparedIdentity({ ...manifest, file: manifest.query.file })
  const input = path.join(directory, "manifest.json")
  fs.writeFileSync(input, `${JSON.stringify(manifest, null, 2)}\n`)
  const first = path.join(directory, "first.json")
  const second = path.join(directory, "second.json")
  const run = (output, compare) => spawnSync(process.execPath, [runner, "--manifest", input,
    "--out", output, ...(compare ? ["--compare", compare] : [])], {
    cwd: root, encoding: "utf8", timeout: 60_000,
  })
  const firstProcess = run(first)
  assert.equal(firstProcess.status, 0, `${firstProcess.stderr}\n${firstProcess.stdout}\n${fs.existsSync(first) ? fs.readFileSync(first, "utf8") : "no report"}`)
  const discovered = JSON.parse(fs.readFileSync(first, "utf8"))
  assert.equal(discovered.status, "DISCOVERED")
  assert.equal(discovered.request.method, "textDocument/implementation")
  assert.deepEqual(discovered.locations, [manifest.knownLocation])
  assert.ok(Array.isArray(discovered.diagnostics[0]?.diagnostics))

  const secondProcess = run(second, first)
  assert.equal(secondProcess.status, 0, `${secondProcess.stderr}\n${secondProcess.stdout}`)
  const verified = JSON.parse(fs.readFileSync(second, "utf8"))
  assert.equal(verified.status, "VERIFIED")
  assert.deepEqual(verified.locations, discovered.locations)
  assert.equal(verified.comparison.equal, true)
  assert.equal(verified.knownLocation.included, true)

  fs.appendFileSync(path.join(sdk, "ets", "minimal.d.ts"), "declare interface Changed {}\n")
  const drifted = path.join(directory, "drifted.json")
  const drift = run(drifted)
  assert.equal(drift.status, 2, drift.stderr)
  assert.match(drift.stderr, /DISCOVERY_BLOCKED=PIN_MISMATCH/u)
  assert.equal(fs.existsSync(drifted), false)
})
