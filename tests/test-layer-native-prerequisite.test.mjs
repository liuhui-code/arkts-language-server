import assert from "node:assert/strict"
import { spawn as spawnChild } from "node:child_process"
import { EventEmitter } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { runNodeTestLayer } from "../scripts/run-node-test-layer.mjs"
import { TEST_LAYER_MANIFEST } from "./support/test-layer-manifest.mjs"

test("selected native layers build once before their real tests in a clean workspace", async t => {
  const fixture = nativeWorkspace(t)
  const calls = []
  const result = await runNodeTestLayer({
    argv: ["--fast"], manifest: fixture.manifest, cwd: fixture.root, evidenceRoot: null,
    spawn(command, args, options) {
      calls.push({ command, args, options })
      if (command === "cargo") {
        fs.mkdirSync(path.dirname(fixture.artifact), { recursive: true })
        fs.writeFileSync(fixture.artifact, "current native build", { mode: 0o755 })
        return finishedChild(0)
      }
      return spawnOutsideTestContext(command, args, options)
    },
  })
  assert.equal(result.code, 0, "both real tests require the built native artifact")
  assert.equal(result.signal, null)
  assert.equal(calls.filter(call => call.command === "cargo").length, 1)
  assert.deepEqual(calls[0].args, ["build", "--locked", "--package", "arkts-index-sidecar",
    "--release", "--target-dir", path.join(fixture.root, "target")])
  assert.equal(calls[0].options.cwd, fixture.root)
  assert.equal(calls[0].options.stdio, "inherit")
})

test("the default manifest declares native prerequisites only for their consuming layers", () => {
  assert.deepEqual(TEST_LAYER_MANIFEST.layers.filter(layer => layer.requiresReleaseSidecar)
    .map(layer => layer.id), ["unit-contract", "bundle-e2e"])
})

test("an existing artifact still goes through locked Cargo freshness validation", async t => {
  const fixture = nativeWorkspace(t)
  fs.mkdirSync(path.dirname(fixture.artifact), { recursive: true })
  fs.writeFileSync(fixture.artifact, "obsolete native build", { mode: 0o755 })
  let builds = 0
  const result = await runNodeTestLayer({
    argv: ["--fast"], manifest: fixture.manifest, cwd: fixture.root, evidenceRoot: null,
    spawn(command, args, options) {
      if (command === "cargo") {
        builds += 1
        fs.writeFileSync(fixture.artifact, "current native build")
        return finishedChild(0)
      }
      return spawnOutsideTestContext(command, args, options)
    },
  })
  assert.equal(result.code, 0)
  assert.equal(builds, 1)
})

test("a relative working directory uses an absolute native output directory", async t => {
  const fixture = nativeWorkspace(t)
  const cwd = path.relative(process.cwd(), fixture.root)
  const result = await runNodeTestLayer({
    argv: ["--fast"], manifest: fixture.manifest, cwd, evidenceRoot: null,
    spawn(command, args, options) {
      if (command === "cargo") {
        assert.equal(path.isAbsolute(args.at(-1)), true,
          "Cargo interprets relative target-dir from its own working directory")
        assert.equal(args.at(-1), path.join(fixture.root, "target"))
        fs.mkdirSync(path.dirname(fixture.artifact), { recursive: true })
        fs.writeFileSync(fixture.artifact, "current native build", { mode: 0o755 })
        return finishedChild(0)
      }
      return spawnOutsideTestContext(command, args, options)
    },
  })
  assert.equal(result.code, 0)
})

for (const [code, signal] of [[23, null], [null, "SIGTERM"]]) {
  test(`native build ${code ?? signal} stops tests and retains the original termination`, async t => {
    const fixture = nativeWorkspace(t)
    const evidenceRoot = path.join(fixture.root, "evidence")
    const calls = []
    const result = await runNodeTestLayer({
      argv: ["--fast"], manifest: fixture.manifest, cwd: fixture.root, evidenceRoot,
      spawn(command) {
        calls.push(command)
        assert.equal(command, "cargo", "failed build must never start Node tests")
        return finishedChild(code, signal)
      },
    })
    assert.equal(result.code, code)
    assert.equal(result.signal, signal)
    assert.deepEqual(calls, ["cargo"])
    const retained = fs.readdirSync(evidenceRoot)
    assert.equal(retained.length, 1)
    const evidence = JSON.parse(fs.readFileSync(path.join(evidenceRoot, retained[0], "failure.json")))
    assert.equal(evidence.error.code, code)
    assert.equal(evidence.error.signal, signal)
  })
}

test("successful Cargo without its expected artifact fails before starting tests", async t => {
  const fixture = nativeWorkspace(t)
  await assert.rejects(runNodeTestLayer({
    argv: ["--fast"], manifest: fixture.manifest, cwd: fixture.root, evidenceRoot: null,
    spawn(command) {
      assert.equal(command, "cargo", "missing native output must not start Node tests")
      return finishedChild(0)
    },
  }), error => error.code === "ENOENT")
})

test("successful Cargo cannot use a directory as the release artifact", async t => {
  const fixture = nativeWorkspace(t)
  await assert.rejects(runNodeTestLayer({
    argv: ["--fast"], manifest: fixture.manifest, cwd: fixture.root, evidenceRoot: null,
    spawn(command) {
      assert.equal(command, "cargo")
      fs.mkdirSync(fixture.artifact, { recursive: true })
      return finishedChild(0)
    },
  }), /release sidecar is not a file/)
})

test("listing a native layer neither builds nor creates artifacts", async t => {
  const fixture = nativeWorkspace(t)
  let output = ""
  const result = await runNodeTestLayer({
    argv: ["--layer", "unit-contract", "--list"], manifest: fixture.manifest,
    cwd: fixture.root, stdout: { write(chunk) { output += chunk } },
    spawn() { throw new Error("listing must not spawn any tool") },
  })
  assert.equal(result.code, 0)
  assert.equal(output, "unit.test.mjs\n")
  assert.equal(fs.existsSync(fixture.artifact), false)
})

test("a pure protocol layer has no native build dependency", async t => {
  const fixture = nativeWorkspace(t)
  fs.writeFileSync(path.join(fixture.root, "unit.test.mjs"),
    'import test from "node:test"; test("pure protocol", () => {})\n')
  const manifest = { layers: [
    ...fixture.manifest.layers,
    { id: "protocol", fast: true, entries: ["unit.test.mjs"] },
  ] }
  const result = await runNodeTestLayer({
    argv: ["--layer", "protocol"], manifest, cwd: fixture.root, evidenceRoot: null,
    spawn(command, args, options) {
      assert.notEqual(command, "cargo")
      return spawnOutsideTestContext(command, args, options)
    },
  })
  assert.equal(result.code, 0)
  assert.equal(fs.existsSync(fixture.artifact), false)
})

function nativeWorkspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-native-layer-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const artifact = path.join(root, "target", "release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  const entries = ["unit.test.mjs", "bundle.test.mjs"]
  for (const entry of entries) fs.writeFileSync(path.join(root, entry), [
    'import assert from "node:assert/strict"',
    'import fs from "node:fs"',
    'import test from "node:test"',
    `test(${JSON.stringify(entry)}, () => assert.equal(fs.readFileSync(${JSON.stringify(artifact)}, "utf8"), "current native build"))`,
    "",
  ].join("\n"))
  const manifest = { layers: entries.map((entry, i) => ({
    id: i === 0 ? "unit-contract" : "bundle-e2e", fast: true,
    requiresReleaseSidecar: true, entries: [entry],
  })) }
  return { root, artifact, manifest }
}

function finishedChild(code, signal = null) {
  const child = new EventEmitter()
  queueMicrotask(() => child.emit("close", code, signal))
  return child
}

function spawnOutsideTestContext(command, args, options) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return spawnChild(command, args, { ...options, env })
}
