import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

const output = path.join(projectRoot, "dist", "harmony-project-model-driver.cjs")
buildSync({
  entryPoints: [path.join(projectRoot, "tests", "fixtures", "project", "harmony-project-model-driver.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: output,
})
const { HarmonyProjectModel, ArkUIResourceIndex } = createRequire(import.meta.url)(output)

test("warm project scope queries do not reread profiles or enumerate project directories", (t) => {
  const { root, source, moduleRoot } = projectFixture(t)
  const model = new HarmonyProjectModel(root)
  assert.equal(model.scopeFor(source).status, "ready")
  let profileReads = 0
  let directoryEnumerations = 0
  for (const method of ["openSync", "readFileSync"]) {
    const original = fs[method]
    t.mock.method(fs, method, (...args) => {
      if (String(args[0]).endsWith("build-profile.json5")) profileReads += 1
      return original(...args)
    })
  }
  for (const method of ["readdirSync", "opendirSync"]) {
    const original = fs[method]
    t.mock.method(fs, method, (...args) => {
      directoryEnumerations += 1
      return original(...args)
    })
  }
  for (let index = 0; index < 100; index += 1) {
    const scope = model.scopeFor(source)
    assert.equal(scope.status, "ready")
    assert.equal(scope.moduleRoot, moduleRoot)
  }
  assert.equal(profileReads, 0)
  assert.equal(directoryEnumerations, 0)
})

test("oversized project profiles fail closed before reading their contents", (t) => {
  const { root, source, profilePath } = projectFixture(t)
  fs.writeFileSync(profilePath, " ".repeat(64 * 1024 + 1))
  const model = new HarmonyProjectModel(root)
  const read = fs.readSync
  let bytesRead = 0
  t.mock.method(fs, "readSync", (...args) => {
    const bytes = read(...args)
    bytesRead += bytes
    return bytes
  })
  const scope = model.scopeFor(source)
  assert.equal(scope.status, "unavailable")
  assert.deepEqual(scope.sourceRoots, [])
  assert.deepEqual(scope.resourceRoots, [])
  assert.equal(bytesRead, 0)
})

test("more than 256 declared modules fail closed before probing module paths", (t) => {
  const { root, source, profilePath, profile } = projectFixture(t)
  profile.modules = Array.from({ length: 257 }, (_, index) => ({
    name: `module-${index}`, srcPath: `./module-${index}`,
    targets: [{ name: "default", applyToProducts: ["default"] }],
  }))
  fs.writeFileSync(profilePath, JSON.stringify(profile))
  const model = new HarmonyProjectModel(root)
  const realpath = fs.realpathSync.native
  let physicalPathProbes = 0
  t.mock.method(fs.realpathSync, "native", (...args) => {
    physicalPathProbes += 1
    return realpath(...args)
  })
  const scope = model.scopeFor(source)
  assert.equal(scope.status, "unavailable")
  assert.deepEqual(scope.sourceRoots, [])
  assert.deepEqual(scope.resourceRoots, [])
  assert.equal(physicalPathProbes, 0)
})

test("invalidated project scopes agree with a fresh model after profile removal and restoration", (t) => {
  const { root, source, profilePath, profile } = projectFixture(t)
  const model = new HarmonyProjectModel(root)
  assert.equal(model.scopeFor(source).status, "ready")
  fs.writeFileSync(profilePath, JSON.stringify({ ...profile, modules: [] }))
  model.invalidate()
  const removed = model.scopeFor(source)
  assert.equal(removed.status, "unavailable")
  assert.deepEqual(removed.resourceRoots, [])
  assert.deepEqual(removed, new HarmonyProjectModel(root).scopeFor(source))
  fs.writeFileSync(profilePath, JSON.stringify(profile))
  model.invalidate()
  const restored = model.scopeFor(source)
  assert.equal(restored.status, "ready")
  assert.deepEqual(restored, new HarmonyProjectModel(root).scopeFor(source))
})

test("resource directory admission materializes at most its limit plus one entries", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-directory-budget-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (let index = 0; index < 40; index += 1) {
    fs.writeFileSync(path.join(root, `unrelated-${index}.txt`), "")
  }
  const index = new ArkUIResourceIndex(root, { maxDirectoryEntries: 3 })
  let materializedEntries = 0
  const readdir = fs.readdirSync
  t.mock.method(fs, "readdirSync", (...args) => {
    const entries = readdir(...args)
    materializedEntries += entries.length
    return entries
  })
  const opendir = fs.opendirSync
  t.mock.method(fs, "opendirSync", (...args) => {
    const directory = opendir(...args)
    const read = directory.readSync.bind(directory)
    t.mock.method(directory, "readSync", () => {
      const entry = read()
      if (entry) materializedEntries += 1
      return entry
    })
    return directory
  })
  const result = index.findExact("app.string.missing")
  assert.equal(result.status, "partial")
  assert.deepEqual(result.resources, [])
  assert.ok(materializedEntries <= 4, `expected at most 4 filesystem entries, materialized ${materializedEntries}`)
})

test("a resource root symlink to the module parent is rejected before directory reads", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-parent-boundary-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const moduleRoot = path.join(root, "entry")
  const resourceRoot = path.join(moduleRoot, "resources")
  fs.mkdirSync(moduleRoot)
  fs.symlinkSync(root, resourceRoot, "dir")
  const index = new ArkUIResourceIndex(moduleRoot, { resourceRoots: [resourceRoot] })
  let directoryReads = 0
  for (const method of ["readdirSync", "opendirSync"]) {
    const original = fs[method]
    t.mock.method(fs, method, (...args) => {
      directoryReads += 1
      return original(...args)
    })
  }
  const result = index.findExact("app.string.missing")
  assert.equal(result.status, "unavailable")
  assert.deepEqual(result.resources, [])
  assert.equal(directoryReads, 0)
})

test("a resource directory read failure closes its handle and returns unavailable", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-read-failure-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const index = new ArkUIResourceIndex(root)
  const opendir = fs.opendirSync
  let closedHandles = 0
  t.mock.method(fs, "opendirSync", (...args) => {
    const directory = opendir(...args)
    t.mock.method(directory, "readSync", () => {
      throw Object.assign(new Error("simulated directory read failure"), { code: "EIO" })
    })
    const close = directory.closeSync.bind(directory)
    t.mock.method(directory, "closeSync", () => {
      closedHandles += 1
      return close()
    })
    return directory
  })
  assert.deepEqual(index.findExact("app.string.missing"), { status: "unavailable", resources: [] })
  assert.equal(closedHandles, 1)
})

function projectFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-project-budget-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const moduleRoot = path.join(root, "alpha")
  const source = path.join(moduleRoot, "src", "main", "ets", "Page.ets")
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(source, "const value = 1\n")
  const profilePath = path.join(root, "build-profile.json5")
  const profile = {
    app: { products: [{ name: "default" }] },
    modules: [{ name: "alpha", srcPath: "./alpha", targets: [{ name: "default", applyToProducts: ["default"] }] }],
  }
  fs.writeFileSync(profilePath, JSON.stringify(profile))
  fs.writeFileSync(path.join(moduleRoot, "build-profile.json5"), "{ targets: [{ name: 'default' }] }")
  return { root, source, moduleRoot, profile, profilePath }
}
