import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

const repository = path.resolve(import.meta.dirname, "../..")

test("an immutable installed artifact can preview index caches from an unrelated cwd", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cache-installed-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const artifact = path.join(temporary, "artifact")
  const bin = path.join(temporary, "bin")
  const run = args => {
    const result = spawnSync(process.execPath, args, { cwd: os.tmpdir(), encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    return result.stdout
  }
  run([path.join(repository, "scripts/artifact/build-portable.mjs"), "--source-root", repository,
    "--output", artifact, "--version", "0.1.0-cache-test", "--commit", "9d47e550",
    "--toolchains", JSON.stringify({ node: process.version })])
  run([path.join(repository, "scripts/artifact/install-from-manifest.mjs"), artifact, bin])
  const command = fs.realpathSync(path.join(bin, "arkts-language-server"))
  const server = path.join(path.dirname(command), "../dist/server.cjs")
  const cache = path.join(temporary, "index")
  const report = JSON.parse(run([server, "--index-cache", "preview", "--cache-dir", cache]))
  assert.equal(report.schema, "arkts.index-cache-gc.v1")
  assert.equal(report.apply, false)
  assert.equal(report.scanned, 0)
  assert.equal(fs.existsSync(cache), false)
})
