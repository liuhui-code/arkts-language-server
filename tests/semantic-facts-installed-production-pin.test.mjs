import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pinCli = path.join(repository, "scripts/semantic/semantic-facts-spike/pin-production-workspace.mjs")
const runCli = path.join(repository, "scripts/semantic/semantic-facts-spike/run.mjs")

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-installed-pin-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const packageRoot = path.join(workspace, "oh_modules", ".ohpm", "@fixture+chart@1.0.0",
    "oh_modules", "@fixture", "chart")
  const packageLink = path.join(workspace, "oh_modules", "@fixture", "chart")
  fs.mkdirSync(path.join(workspace, "src"), { recursive: true })
  fs.mkdirSync(packageRoot, { recursive: true })
  fs.mkdirSync(path.dirname(packageLink), { recursive: true })
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "ets", "api"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(sdk, "ets", "component", "index-full.d.ts"),
    "/// <reference path=\"./common.d.ts\" />\n")
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface ArkThing {}\n")
  fs.writeFileSync(path.join(workspace, "src", "model.ets"),
    "export function target() {}\ntarget()\n")
  fs.writeFileSync(path.join(workspace, "oh-package.json5"), JSON.stringify({
    name: "fixture", dependencies: { "@fixture/chart": "1.0.0" },
  }))
  fs.writeFileSync(path.join(workspace, "oh-package-lock.json5"), JSON.stringify({
    lockfileVersion: 3,
    specifiers: { "@fixture/chart@1.0.0": "@fixture/chart@1.0.0" },
    packages: { "@fixture/chart@1.0.0": {
      name: "@fixture/chart", version: "1.0.0", registryType: "ohpm",
      integrity: "sha512-" + Buffer.alloc(64, 7).toString("base64"),
    } },
  }))
  fs.writeFileSync(path.join(packageRoot, "oh-package.json5"),
    JSON.stringify({ name: "@fixture/chart", version: "1.0.0", main: "index.ets" }))
  fs.writeFileSync(path.join(packageRoot, "index.ets"), "export class Chart {}\n")
  fs.symlinkSync(path.relative(path.dirname(packageLink), packageRoot), packageLink, "dir")
  const input = path.join(temporary, "input.json")
  const queries = path.join(temporary, "queries.json")
  fs.writeFileSync(queries, JSON.stringify({ schemaVersion: 1, queries: [
    { id: "target", file: "src/model.ets", line: 0, character: 16, includeDeclaration: true },
  ] }))
  return { temporary, workspace, sdk, packageRoot, packageLink, input, queries }
}

function invoke(cli, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repository, encoding: "utf8", timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  })
}

function pin(f, ...extra) {
  return invoke(pinCli, "--workspace", f.workspace, "--sdk", f.sdk,
    "--file", "src/model.ets", "--out", f.input, ...extra)
}

function addLocalAlias(f) {
  const local = path.join(f.workspace, "local")
  const link = path.join(f.workspace, "oh_modules", "@fixture", "local")
  fs.mkdirSync(local)
  fs.writeFileSync(path.join(local, "oh-package.json5"),
    JSON.stringify({ name: "local-actual", version: "1.0.0", main: "index.ets" }))
  fs.writeFileSync(path.join(local, "index.ets"), "export class Local {}\n")
  fs.symlinkSync(path.relative(path.dirname(link), local), link, "dir")
  const manifestPath = path.join(f.workspace, "oh-package.json5")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.dependencies["@fixture/local"] = "file:./local"
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  const lockPath = path.join(f.workspace, "oh-package-lock.json5")
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
  lock.specifiers["@fixture/local@./local"] = "@fixture/local@./local"
  lock.packages["@fixture/local@./local"] = {
    name: "local-actual", version: "1.0.0", registryType: "local", resolved: "./local",
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock))
  return { link, lockPath }
}

test("installed packages need an explicit pinned disk-workspace mode", (t) => {
  const f = fixture(t)
  const refused = pin(f)
  assert.equal(refused.status, 2)
  assert.match(refused.stderr, /installed dependencies are not pinned/u)
  assert.equal(fs.existsSync(f.input), false)

  const accepted = pin(f, "--pin-installed")
  assert.equal(accepted.status, 0, `${accepted.stderr}\n${accepted.stdout}`)
  const manifest = JSON.parse(fs.readFileSync(f.input, "utf8"))
  assert.equal(manifest.schemaVersion, 3)
  assert.equal(manifest.kind, "disk-workspace")
  assert.match(manifest.installedDependencyDigest, /^[a-f0-9]{64}$/u)
  assert.match(manifest.projectConfigurationDigest, /^[a-f0-9]{64}$/u)
})

test("production oracle rejects a changed installed package before any stock answer", (t) => {
  const f = fixture(t)
  const accepted = pin(f, "--pin-installed")
  assert.equal(accepted.status, 0, accepted.stderr)
  const initial = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(initial.status, 0, `${initial.stderr}\n${initial.stdout}`)
  assert.ok(JSON.parse(initial.stdout).answers[0].locations.length > 0)

  fs.appendFileSync(path.join(f.packageRoot, "index.ets"), "export class Changed {}\n")
  const drift = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(drift.status, 2)
  assert.equal(drift.stdout, "")
  assert.match(drift.stderr, /installed dependency digest mismatch/u)
})

test("installed registry packages require an exact lock row with a full integrity digest", (t) => {
  const f = fixture(t)
  const lockPath = path.join(f.workspace, "oh-package-lock.json5")
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
  lock.packages["@fixture/chart@1.0.0"].integrity = "sha512-QQ=="
  fs.writeFileSync(lockPath, JSON.stringify(lock))

  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /installed registry package is not matched by exact lock row/u)
  assert.equal(fs.existsSync(f.input), false)
})

test("a local alias link must match its exact lock row name and version", (t) => {
  const f = fixture(t)
  const { lockPath } = addLocalAlias(f)
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
  lock.packages["@fixture/local@./local"].version = "2.0.0"
  fs.writeFileSync(lockPath, JSON.stringify(lock))

  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /installed local package disagrees with exact lock row/u)
})

test("ohpm-normalized local specifier paths still pin the same physical package", (t) => {
  const f = fixture(t)
  const { lockPath } = addLocalAlias(f)
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
  const row = lock.packages["@fixture/local@./local"]
  delete lock.specifiers["@fixture/local@./local"]
  delete lock.packages["@fixture/local@./local"]
  lock.specifiers["@fixture/local@local"] = "@fixture/local@local"
  lock.packages["@fixture/local@local"] = { ...row, resolved: "local" }
  fs.writeFileSync(lockPath, JSON.stringify(lock))

  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
})

test("an empty local package version pins ohpm's explicit 0.0.0 lock value", (t) => {
  const f = fixture(t)
  const { lockPath } = addLocalAlias(f)
  const localManifestPath = path.join(f.workspace, "local", "oh-package.json5")
  const localManifest = JSON.parse(fs.readFileSync(localManifestPath, "utf8"))
  localManifest.version = ""
  fs.writeFileSync(localManifestPath, JSON.stringify(localManifest))
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"))
  lock.packages["@fixture/local@./local"].version = "0.0.0"
  fs.writeFileSync(lockPath, JSON.stringify(lock))

  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
})

test("the pin rejects changed raw symlink text even when the canonical target is unchanged", (t) => {
  const f = fixture(t)
  assert.equal(pin(f, "--pin-installed").status, 0)
  const original = fs.readlinkSync(f.packageLink)
  fs.unlinkSync(f.packageLink)
  fs.symlinkSync(`${original}/.`, f.packageLink, "dir")

  const drift = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(drift.status, 2)
  assert.equal(drift.stdout, "")
  assert.match(drift.stderr, /installed dependency digest mismatch/u)
})

test("the pin rejects package links leaving the workspace", (t) => {
  const f = fixture(t)
  const outside = path.join(f.temporary, "outside")
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, "oh-package.json5"),
    JSON.stringify({ name: "@fixture/chart", version: "1.0.0" }))
  fs.unlinkSync(f.packageLink)
  fs.symlinkSync(outside, f.packageLink, "dir")

  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /installed path escapes workspace/u)
})

test("the pin rejects dangling and cyclic package links", (t) => {
  const f = fixture(t)
  fs.unlinkSync(f.packageLink)
  fs.symlinkSync("missing-package", f.packageLink, "dir")
  const dangling = pin(f, "--pin-installed")
  assert.equal(dangling.status, 2)
  assert.match(dangling.stderr, /dangling or cyclic/u)
  fs.unlinkSync(f.packageLink)
  fs.symlinkSync(f.packageLink, f.packageLink, "dir")
  const cyclic = pin(f, "--pin-installed")
  assert.equal(cyclic.status, 2)
  assert.match(cyclic.stderr, /dangling or cyclic/u)
})

test("the pin rejects a registry package manifest that disagrees with the lock version", (t) => {
  const f = fixture(t)
  const manifestPath = path.join(f.packageRoot, "oh-package.json5")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.version = "2.0.0"
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.match(result.stderr, /installed registry package is not matched by exact lock row/u)
})

test("an unlinked physical registry package also needs a matching lock row", (t) => {
  const f = fixture(t)
  const unlinked = path.join(f.workspace, "oh_modules", ".ohpm", "@fixture+unlinked@1.0.0",
    "oh_modules", "@fixture", "unlinked")
  fs.mkdirSync(unlinked, { recursive: true })
  fs.writeFileSync(path.join(unlinked, "oh-package.json5"),
    JSON.stringify({ name: "@fixture/unlinked", version: "1.0.0" }))
  fs.writeFileSync(path.join(unlinked, "index.ets"), "export class Unlinked {}\n")
  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.match(result.stderr, /installed registry package is not matched by exact lock row/u)
})

test("a same-name registry package at an unrelated physical location cannot borrow a lock row", (t) => {
  const f = fixture(t)
  const rogue = path.join(f.workspace, "oh_modules", "@fixture", "other")
  fs.mkdirSync(rogue, { recursive: true })
  fs.writeFileSync(path.join(rogue, "oh-package.json5"),
    JSON.stringify({ name: "@fixture/chart", version: "1.0.0", main: "index.ets" }))
  fs.writeFileSync(path.join(rogue, "index.ets"), "export class Rogue {}\n")

  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2, `${result.stderr}\n${result.stdout}`)
  assert.equal(result.stdout, "")
  assert.equal(fs.existsSync(f.input), false)
})

test("the query rejects a changed project lockfile before any stock answer", (t) => {
  const f = fixture(t)
  assert.equal(pin(f, "--pin-installed").status, 0)
  fs.appendFileSync(path.join(f.workspace, "oh-package-lock.json5"), "\n")
  const drift = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(drift.status, 2)
  assert.equal(drift.stdout, "")
  assert.match(drift.stderr, /project configuration digest mismatch/u)
})

test("a new empty oh_modules root changes the installed topology pin", (t) => {
  const f = fixture(t)
  assert.equal(pin(f, "--pin-installed").status, 0)
  fs.mkdirSync(path.join(f.workspace, "new-module", "oh_modules"), { recursive: true })
  const drift = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(drift.status, 2)
  assert.equal(drift.stdout, "")
  assert.match(drift.stderr, /installed dependency digest mismatch/u)
})

test("the pin rejects unrelated symlinks and node_modules", (t) => {
  const f = fixture(t)
  fs.symlinkSync("index.ets", path.join(f.packageRoot, "unexpected.ets"))
  const link = pin(f, "--pin-installed")
  assert.equal(link.status, 2)
  assert.match(link.stderr, /unrelated symbolic link is not pinned/u)
  fs.unlinkSync(path.join(f.packageRoot, "unexpected.ets"))
  fs.mkdirSync(path.join(f.workspace, "node_modules"))
  const nodeModules = pin(f, "--pin-installed")
  assert.equal(nodeModules.status, 2)
  assert.match(nodeModules.stderr, /installed dependencies are not pinned|node_modules is not pinned/u)
})

test("a registry link to a workspace package cannot read unpinned target bytes", (t) => {
  const f = fixture(t)
  const rogue = path.join(f.workspace, "rogue")
  fs.mkdirSync(rogue)
  fs.writeFileSync(path.join(rogue, "oh-package.json5"),
    JSON.stringify({ name: "@fixture/chart", version: "1.0.0" }))
  fs.writeFileSync(path.join(rogue, "index.ets"), "export class Chart {}\n")
  fs.unlinkSync(f.packageLink)
  fs.symlinkSync(path.relative(path.dirname(f.packageLink), rogue), f.packageLink, "dir")
  const pinned = pin(f, "--pin-installed")
  if (pinned.status === 2) {
    assert.match(pinned.stderr, /registry package target is outside the pinned store/u)
    return
  }
  assert.equal(pinned.status, 0, pinned.stderr)
  fs.appendFileSync(path.join(rogue, "index.ets"), "export class Changed {}\n")
  const drift = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(drift.status, 2)
  assert.equal(drift.stdout, "")
  assert.match(drift.stderr, /installed dependency digest mismatch/u)
})

test("an installed package link without an owner manifest fails closed", (t) => {
  const f = fixture(t)
  fs.unlinkSync(path.join(f.workspace, "oh-package.json5"))
  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.match(result.stderr, /installed package owner has no manifest/u)
})

test("a local package link without an owner lock pins its canonical target bytes", (t) => {
  const f = fixture(t)
  addLocalAlias(f)
  fs.unlinkSync(f.packageLink)
  fs.rmSync(path.join(f.workspace, "oh_modules", ".ohpm"), { recursive: true })
  const manifestPath = path.join(f.workspace, "oh-package.json5")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  delete manifest.dependencies["@fixture/chart"]
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  fs.unlinkSync(path.join(f.workspace, "oh-package-lock.json5"))
  const asset = path.join(f.workspace, "local", "asset.bin")
  fs.writeFileSync(asset, "original")
  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  fs.writeFileSync(asset, "changed")
  const drift = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(drift.status, 2)
  assert.equal(drift.stdout, "")
  assert.match(drift.stderr, /installed dependency digest mismatch/u)
})

test("a registry package link without an owner lock fails closed", (t) => {
  const f = fixture(t)
  fs.unlinkSync(path.join(f.workspace, "oh-package-lock.json5"))
  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.match(result.stderr, /installed registry package owner has no lock/u)
})

test("a local package target cannot hide compiler-readable files under .git", (t) => {
  const f = fixture(t)
  addLocalAlias(f)
  const local = path.join(f.workspace, "local")
  const manifestPath = path.join(local, "oh-package.json5")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.main = ".git/index.ets"
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  fs.mkdirSync(path.join(local, ".git"))
  fs.writeFileSync(path.join(local, ".git", "index.ets"), "export class Hidden {}\n")
  const result = pin(f, "--pin-installed")
  assert.equal(result.status, 2)
  assert.match(result.stderr, /local package target contains unpinned .git/u)
})

test("a declared file dependency without an installed link still pins target bytes", (t) => {
  const f = fixture(t)
  const local = path.join(f.workspace, "local")
  fs.mkdirSync(local)
  fs.writeFileSync(path.join(local, "oh-package.json5"),
    JSON.stringify({ name: "local-actual", version: "1.0.0" }))
  const asset = path.join(local, "asset.bin")
  fs.writeFileSync(asset, "original")
  const manifestPath = path.join(f.workspace, "oh-package.json5")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.dependencies["@fixture/local"] = "file:./local"
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))

  const pinned = pin(f, "--pin-installed")
  assert.equal(pinned.status, 0, `${pinned.stderr}\n${pinned.stdout}`)
  fs.writeFileSync(asset, "changed")
  const drift = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(drift.status, 2)
  assert.equal(drift.stdout, "")
  assert.match(drift.stderr, /installed dependency digest mismatch/u)
})

test("schema 3 cannot become an inline source fixture when its installed pin is absent", (t) => {
  const f = fixture(t)
  assert.equal(pin(f, "--pin-installed").status, 0)
  const manifest = JSON.parse(fs.readFileSync(f.input, "utf8"))
  delete manifest.installedDependencyDigest
  fs.writeFileSync(f.input, JSON.stringify(manifest))

  const result = invoke(runCli, "--mode", "production-oracle", "--input", f.input,
    "--queries", f.queries)
  assert.equal(result.status, 2)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /pinned workspace digest; no source copies/u)
})
