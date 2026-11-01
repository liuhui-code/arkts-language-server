import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

// Parent 2972148759194fb12b9c2c05b49fa3801ccde203 plus SDK environment working snapshot.
// RED: node --test tests/project-sdk-target.test.mjs
test("selected product owns the SDK build target without borrowing another product's versions", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-sdk-target-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const driver = path.join(root, "model.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/project/harmony-project-model.ts")],
    outfile: driver, platform: "node", format: "cjs", bundle: true, logLevel: "silent" })
  const { HarmonyProjectModel } = createRequire(import.meta.url)(driver)
  fs.writeFileSync(path.join(root, "build-profile.json5"), JSON.stringify({ app: { products: [
    { name: "default", compileSdkVersion: 22, compatibleSdkVersion: 12 },
    { name: "enterprise", compileSdkVersion: "6.1.1(24)", compatibleSdkVersion: "5.0.0(12)",
      targetSdkVersion: "6.0.2(22)", runtimeOS: "HarmonyOS" },
  ] } }))
  const model = new HarmonyProjectModel(root, { product: "enterprise" })
  const target = model.sdkTarget()
  assert.deepEqual(target, { status: "ready", product: "enterprise", compileSdkVersion: "6.1.1(24)",
    compatibleSdkVersion: "5.0.0(12)", targetSdkVersion: "6.0.2(22)", runtimeOS: "HarmonyOS" })
  assert.throws(() => { target.compileSdkVersion = 99 }, TypeError)
})

test("SDK target cache retains its original input witness until project invalidation", t => {
  const { root, Model } = fixture(t)
  const profile = path.join(root, "build-profile.json5")
  const write = version => fs.writeFileSync(profile, JSON.stringify({ app: { products: [
    { name: "default", compileSdkVersion: version },
  ] } }))
  write(24)
  const model = new Model(root)
  model.enableConfigurationWitness()
  assert.equal(model.sdkTarget().compileSdkVersion, 24)
  assert.equal(model.configurationFreshness(() => {})?.(), true)
  write(22)
  assert.equal(model.sdkTarget().compileSdkVersion, 24, "cache hits cannot silently adopt changed configuration")
  assert.notEqual(model.configurationFreshness(() => {})?.(), true)
  model.invalidate()
  assert.equal(model.sdkTarget().compileSdkVersion, 22)
  assert.equal(model.configurationFreshness(() => {})?.(), true)
})

test("missing or ambiguous selected product cannot borrow a default SDK target", t => {
  const { root, Model } = fixture(t)
  const profile = path.join(root, "build-profile.json5")
  for (const products of [
    [{ name: "default", compileSdkVersion: 24 }],
    [{ name: "enterprise", compileSdkVersion: 24 }, { name: "enterprise", compileSdkVersion: 22 }],
    [{ name: "enterprise", compileSdkVersion: { api: 24 } }],
  ]) {
    fs.writeFileSync(profile, JSON.stringify({ app: { products } }))
    const target = new Model(root, { product: "enterprise" }).sdkTarget()
    assert.equal(target.status, "unavailable")
    assert.equal(target.compileSdkVersion, undefined)
  }
})

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-sdk-target-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const driver = path.join(root, "model.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/project/harmony-project-model.ts")],
    outfile: driver, platform: "node", format: "cjs", bundle: true, logLevel: "silent" })
  return { root, Model: createRequire(import.meta.url)(driver).HarmonyProjectModel }
}
