import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runner = path.join(root, "scripts", "bench", "replay-settings-disk-edit.mjs")

function invoke(...args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root, encoding: "utf8", timeout: 10_000,
  })
}

test("Settings disk-edit replay exposes one safe, explicit CLI", () => {
  const result = invoke("--help")
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  for (const required of ["--workspace", "--sdk", "--out", "--session-reuse"]) {
    assert.match(result.stdout, new RegExp(required))
  }
  assert.match(result.stdout, /textDocument\/definition/u)
  assert.match(result.stdout, /textDocument\/references/u)
})

test("Settings disk-edit replay refuses existing output before touching source", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-disk-cli-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const output = path.join(temporary, "evidence.json")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  fs.writeFileSync(output, "untouched\n")
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", output, "--session-reuse", "experimental")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /output already exists/u)
  assert.equal(fs.readFileSync(output, "utf8"), "untouched\n")
})

test("Settings disk-edit replay refuses a dirty source checkout", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-dirty-settings-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  for (const args of [["init", "-q"], ["-c", "user.name=Test", "-c", "user.email=test@example.com",
    "commit", "--allow-empty", "-qm", "fixture"]]) {
    const result = spawnSync("git", ["-C", workspace, ...args], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
  }
  fs.writeFileSync(path.join(workspace, "untracked.txt"), "dirty\n")
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", path.join(temporary, "result.json"), "--session-reuse", "off")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /DIRTY_WORKSPACE/u)
  assert.equal(fs.readFileSync(path.join(workspace, "untracked.txt"), "utf8"), "dirty\n")
})

test("Settings disk-edit replay cannot write a new report inside its source checkout", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-output-scope-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const output = path.join(workspace, "evidence", "run.json")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", output, "--session-reuse", "off")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=OUTPUT_INSIDE_SOURCE/u)
  assert.equal(fs.existsSync(output), false)
})

test("Settings disk-edit replay follows an output-parent symlink before the source guard", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-output-alias-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const alias = path.join(temporary, "workspace-alias")
  const sdk = path.join(temporary, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  fs.symlinkSync(workspace, alias, "dir")
  const output = path.join(alias, "new-directory", "evidence.json")
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", output, "--session-reuse", "experimental")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=OUTPUT_INSIDE_SOURCE/u)
  assert.equal(fs.existsSync(path.join(workspace, "new-directory")), false)
})

test("Settings disk-edit replay cannot write a new report inside the SDK", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-output-sdk-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  const output = path.join(sdk, "evidence", "run.json")
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", output, "--session-reuse", "off")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=OUTPUT_INSIDE_SDK/u)
  assert.equal(fs.existsSync(output), false)
})

test("Settings disk-edit replay fails closed when git status cannot be read", t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-status-failure-test-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(sdk)
  for (const args of [["init", "-q"], ["-c", "user.name=Test", "-c", "user.email=test@example.com",
    "commit", "--allow-empty", "-qm", "fixture"]]) {
    const result = spawnSync("git", ["-C", workspace, ...args], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
  }
  fs.writeFileSync(path.join(workspace, ".git", "index"), "corrupt index\n")
  const result = invoke("--workspace", workspace, "--sdk", sdk,
    "--out", path.join(temporary, "result.json"), "--session-reuse", "off")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.match(result.stderr, /BENCHMARK_BLOCKED=SOURCE_STATUS_UNAVAILABLE/u)
})
