import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const script = path.join(projectRoot, "scripts", "semantic", "lock-toolchain.mjs")

test("the repository toolchain lock pins exact backend and SDK identities", () => {
  const lock = JSON.parse(fs.readFileSync(
    path.join(projectRoot, "docs", "toolchains", "arkts-toolchain.lock.json"),
    "utf8",
  ))
  assert.equal(lock.schemaVersion, 1)
  assert.equal(lock.semanticBackend, "openharmony/third_party_typescript")
  assert.match(lock.semanticBackendRevision, /^[0-9a-f]{40}$/)
  assert.equal(lock.sdkApiLevel, 24)
  assert.match(lock.sdkDeclarationDigest, /^[0-9a-f]{64}$/)
})

test("writes a deterministic toolchain lock for an explicit backend revision", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-toolchain-lock-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(path.join(sdk, "ets", "api"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"), { recursive: true })
  fs.writeFileSync(path.join(sdk, "ets", "api", "@ohos.alpha.d.ts"), "export const alpha: number\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), '{"apiVersion":"24"}\n')
  const out = path.join(root, "arkts-toolchain.lock.json")
  const revision = "a".repeat(40)

  runLock({ sdk, out, revision })
  const first = JSON.parse(fs.readFileSync(out, "utf8"))
  runLock({ sdk, out, revision })
  const second = JSON.parse(fs.readFileSync(out, "utf8"))
  runLock({ sdk, out })
  const reused = JSON.parse(fs.readFileSync(out, "utf8"))

  assert.deepEqual(second, first)
  assert.deepEqual(reused, first)
  assert.deepEqual(first, {
    schemaVersion: 1,
    semanticBackend: "openharmony/third_party_typescript",
    semanticBackendRevision: revision,
    semanticBackendRepository: "https://github.com/openharmony/third_party_typescript.git",
    sdkApiLevel: 24,
    sdkDeclarationDigest: first.sdkDeclarationDigest,
    packageName: null,
    packageVersion: null,
  })
  assert.match(first.sdkDeclarationDigest, /^[0-9a-f]{64}$/)
})

test("the SDK digest binds both normalized relative paths and file contents", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-toolchain-digest-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sdk = writeSdk(root)
  const declaration = path.join(sdk, "ets", "api", "@ohos.alpha.d.ts")
  const renamed = path.join(sdk, "ets", "api", "@ohos.renamed.d.ts")
  const out = path.join(root, "lock.json")
  const revision = "c".repeat(40)

  runLock({ sdk, out, revision })
  const baseline = readDigest(out)
  fs.writeFileSync(declaration, "export const alpha: string\n")
  runLock({ sdk, out, revision })
  assert.notEqual(readDigest(out), baseline)
  fs.writeFileSync(declaration, "export const alpha: number\n")
  fs.renameSync(declaration, renamed)
  runLock({ sdk, out, revision })
  assert.notEqual(readDigest(out), baseline)
})

test("resolves upstream HEAD only when no explicit or existing revision is available", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-toolchain-upstream-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sdk = writeSdk(root)
  const out = path.join(root, "lock.json")
  const bin = path.join(root, "bin")
  fs.mkdirSync(bin)
  const fakeGit = path.join(bin, "git")
  fs.writeFileSync(fakeGit, [
    "#!/usr/bin/env node",
    `process.stdout.write(${JSON.stringify(`${"b".repeat(40)}\tHEAD\n`)})`,
    "",
  ].join("\n"))
  fs.chmodSync(fakeGit, 0o755)

  runLock({
    sdk,
    out,
    expectedRevision: "b".repeat(40),
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  })
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).semanticBackendRevision, "b".repeat(40))
})

test("fails closed for empty SDK inputs and symbolic links", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-toolchain-invalid-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(path.join(sdk, "ets"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"), { recursive: true })
  const out = path.join(root, "lock.json")
  const revision = "d".repeat(40)

  const empty = invokeLock({ sdk, out, revision })
  assert.equal(empty.status, 1)
  assert.match(empty.stderr, /contains no .* inputs/)
  assert.equal(fs.existsSync(out), false)

  const outside = path.join(root, "outside.d.ts")
  fs.writeFileSync(outside, "export const outside: number\n")
  fs.symlinkSync(outside, path.join(sdk, "ets", "linked.d.ts"))
  const linked = invokeLock({ sdk, out, revision })
  assert.equal(linked.status, 1)
  assert.match(linked.stderr, /symbolic link/)
  assert.equal(fs.existsSync(out), false)
})

test("ignores unrelated toolchain symlinks that cannot enter the declaration digest", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-toolchain-link-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sdk = writeSdk(root)
  fs.symlinkSync("missing-clang", path.join(sdk, "toolchains", "clang"))
  const out = path.join(root, "lock.json")
  runLock({ sdk, out, revision: "e".repeat(40) })
  assert.match(readDigest(out), /^[0-9a-f]{64}$/)
})

test("does not follow a symbolic link when reusing an existing lock", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-toolchain-lock-link-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sdk = writeSdk(root)
  const target = path.join(root, "outside.json")
  fs.writeFileSync(target, JSON.stringify({
    schemaVersion: 1,
    semanticBackend: "openharmony/third_party_typescript",
    semanticBackendRepository: "https://github.com/openharmony/third_party_typescript.git",
    semanticBackendRevision: "f".repeat(40),
  }))
  const out = path.join(root, "lock.json")
  fs.symlinkSync(target, out)

  const result = invokeLock({ sdk, out })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /existing toolchain lock.*regular file/i)
  assert.equal(fs.readFileSync(out, "utf8"), fs.readFileSync(target, "utf8"))
})

function writeSdk(root) {
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(path.join(sdk, "ets", "api"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"), { recursive: true })
  fs.writeFileSync(path.join(sdk, "ets", "api", "@ohos.alpha.d.ts"), "export const alpha: number\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), '{"apiVersion":"24"}\n')
  return sdk
}

function readDigest(out) {
  return JSON.parse(fs.readFileSync(out, "utf8")).sdkDeclarationDigest
}

function invokeLock({ sdk, out, revision, env }) {
  const args = [
    script,
    "--sdk", sdk,
    "--api-level", "24",
    "--repo", "https://github.com/openharmony/third_party_typescript.git",
    "--out", out,
  ]
  if (revision) args.push("--revision", revision)
  return spawnSync(process.execPath, args, { cwd: projectRoot, encoding: "utf8", env })
}

function runLock({ sdk, out, revision, expectedRevision = revision ?? "a".repeat(40), env }) {
  const result = invokeLock({ sdk, out, revision, env })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, `${expectedRevision}\n`)
  assert.equal(result.stderr, "")
}
