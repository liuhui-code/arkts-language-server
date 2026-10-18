import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import { capturePreparedIdentity } from "../../scripts/bench/prepared-suite-input.mjs"
import { sha256File } from "../../scripts/bench/reference-replay-input.mjs"
import { makeSuite, saveSuite } from "./prepared-suite-fixture.mjs"

/** A pinned disk fixture with the real production compiler/Workers and a valid full SDK. */
export async function makeQueryLayerFixture(t, { files, target, oracle }) {
  const fixture = await makeSuite(t)
  for (const [file, text] of Object.entries(files)) {
    const absolute = path.join(fixture.suite.workspace, file)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, text)
  }
  fs.mkdirSync(path.join(fixture.suite.sdk, "ets", "component"))
  fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  for (const args of [["add", ...Object.keys(files)],
    ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "query layer fixture"]]) {
    const result = spawnSync("git", args, { cwd: fixture.suite.workspace, encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
  }
  const oraclePath = fixture.suite.targets[0].oracle.path
  fs.writeFileSync(oraclePath, JSON.stringify(oracle))
  fixture.suite.targets[0] = { ...fixture.suite.targets[0], ...target,
    sourceSha256: sha256File(path.join(fixture.suite.workspace, target.file)),
    oracle: { path: oraclePath, sha256: sha256File(oraclePath), verified: true } }
  fixture.suite.server = path.resolve("dist/server.cjs")
  fixture.suite.sidecar = path.resolve("target/release", process.platform === "win32"
    ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  fixture.suite.runtime = { ...fixture.suite.runtime, env: {}, timeoutMs: 10_000 }
  fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
  saveSuite(fixture)
  return fixture
}

export function runQueryLayerFixture(fixture, layer) {
  const output = path.join(fixture.directory, `${layer}-report.json`)
  const result = spawnSync(process.execPath, [path.resolve("scripts/bench/query-layer-probe.mjs"),
    "--layer", layer, "--manifest", fixture.input, "--out", output], { encoding: "utf8", timeout: 25_000 })
  return { ...result, report: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) : null }
}
