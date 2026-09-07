import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

const output = path.join(projectRoot, "dist", "sdk-discovery-driver.cjs")
buildSync({
  entryPoints: [path.join(projectRoot, "tests", "fixtures", "sdk", "sdk-discovery-driver.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: output,
})
const driver = createRequire(import.meta.url)(output)

test("derives the per-user DevEco SDK candidate from the current home directory", () => {
  const candidates = driver.candidatesForDarwinHome("/Users/another-developer")

  assert.deepEqual(candidates, [
    "/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony",
    "/Applications/DevEco Studio.app/Contents/sdk/default/openharmony",
    "/Users/another-developer/Library/Huawei/Sdk/default/openharmony",
  ])
})

test("SDK module candidates keep all supported namespaces flat on every platform", () => {
  const root = path.join(os.tmpdir(), "arkts-sdk-module-boundary")
  const namespaces = [
    ["@ohos.testApi.v1", "api", true],
    ["@system.testApi.v1", "api", true],
    ["@kit.TestKit", "kits", false],
    ["@arkts.testApi.v1", "arkts", false],
  ]
  const invalidSpecifiers = []
  for (const [name, directory, hasJsFallback] of namespaces) {
    assert.deepEqual(driver.harmonySdkModuleCandidates(root, name), [
      path.join(root, "ets", directory, `${name}.d.ts`),
      path.join(root, "ets", directory, `${name}.d.ets`),
      ...(hasJsFallback ? [
        path.join(root, "js", directory, `${name}.d.ts`),
        path.join(root, "js", directory, `${name}.d.ets`),
      ] : []),
    ])
    for (const separator of ["/", "\\"]) {
      invalidSpecifiers.push(`${name}${separator}member`,
        `${name}${separator}..${separator}..${separator}..${separator}..${separator}outside`)
    }
  }
  assert.deepEqual(invalidSpecifiers.map((name) => ({
    name, candidates: driver.harmonySdkModuleCandidates(root, name),
  })), invalidSpecifiers.map((name) => ({ name, candidates: [] })))
})

test("SDK identity distinguishes the ETS API level from its component version without claiming dialect compatibility", (t) => {
  const root = sdkFixture(t)
  const metadataPath = path.join(root, "ets", "oh-uni-package.json")
  fs.writeFileSync(metadataPath, JSON.stringify({ apiVersion: "11", displayName: "Ets",
    meta: { metaVersion: "3.0.0" }, path: "ets", releaseType: "Release", version: "4.1.0.36" }))
  assert.deepEqual(driver.discoverHarmonySdk(root).identity, {
    status: "identified", metadataPath, apiVersion: "11", componentVersion: "4.1.0.36",
    dialectCompatibility: "unverified", declarationSupport: "typescript-compatible-only",
  })
})

test("SDK discovery rejects files masquerading as required component directories", (t) => {
  const root = sdkFixture(t)
  fs.rmdirSync(path.join(root, "ets"))
  fs.writeFileSync(path.join(root, "ets"), "not a component directory")
  assert.equal(driver.discoverHarmonySdk(root).ready, false)
})

test("project SDK properties preserve Java escapes, duplicate-key precedence and continued paths", (t) => {
  const sdk = sdkFixture(t, "arkts-sdk-中文 space-")
  const workspace = sdkFixture(t)
  const escaped = sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/ /g, "\\ ")
    .replace(/中/g, "\\u4e2d").replace(/文/g, "\\u6587")
  fs.writeFileSync(path.join(workspace, "local.properties"),
    `! generated properties\nsdk.dir=/wrong\nsdk\\u002edir : \\\n  ${escaped}\n`)
  const selected = driver.discoverProjectSdk(workspace, path.join(workspace, "missing"))
  assert.equal(selected.path, sdk)
  assert.equal(selected.source, "project")
})

test("SDK selection reads only workspace local.properties and resolves its relative directory", (t) => {
  const sdk = sdkFixture(t)
  const workspace = path.join(sdk, "workspace")
  const module = path.join(workspace, "entry")
  fs.mkdirSync(module, { recursive: true })
  fs.writeFileSync(path.join(workspace, "local.properties"), "sdk.dir=..\n")
  fs.writeFileSync(path.join(module, "local.properties"), "sdk.dir=/wrong\n")
  fs.writeFileSync(path.join(workspace, "build-profile.json5"), "{ app: { products: [{ compileSdkVersion: 99, compatibleSdkVersion: 98 }] } }")
  assert.equal(driver.discoverProjectSdk(workspace).path, sdk)
})

test("absent sdk.dir uses the process fallback but invalid explicit configuration fails closed", (t) => {
  const sdk = sdkFixture(t)
  const workspace = sdkFixture(t)
  const configuration = path.join(workspace, "local.properties")
  assert.equal(driver.discoverProjectSdk(workspace, sdk).path, sdk)
  fs.writeFileSync(configuration, "other.setting=true\n")
  assert.equal(driver.discoverProjectSdk(workspace, sdk).path, sdk)
  for (const content of ["sdk.dir=\n", "sdk.dir=/missing-sdk\n", "sdk.dir=\\uZZZZ\n", `${sdkProperty(sdk)}${"#".repeat(65536)}`]) {
    fs.writeFileSync(configuration, content)
    assert.deepEqual(driver.discoverProjectSdk(workspace, sdk), { ready: false, path: null, source: "project" })
  }
  fs.rmSync(configuration)
  fs.mkdirSync(configuration)
  assert.equal(driver.discoverProjectSdk(workspace, sdk).ready, false)
})

test("missing and malformed metadata remain explicit unknown identities, not inferred API or dialect support", (t) => {
  const sdk = sdkFixture(t)
  fs.writeFileSync(path.join(sdk, "sdk-pkg.json"), '{"apiVersion":99}')
  assert.equal(driver.discoverHarmonySdk(sdk).identity.status, "missing")
  const metadata = path.join(sdk, "ets", "oh-uni-package.json")
  for (const content of ["{broken", "[]", '{"path":"ets","apiVersion":"4.1.0.36","version":"11"}',
    '{"path":"toolchains","apiVersion":"24","version":"6.1.1.125"}', "#".repeat(65537)]) {
    fs.writeFileSync(metadata, content)
    const identity = driver.discoverHarmonySdk(sdk).identity
    assert.equal(identity.status, "invalid")
    assert.equal(identity.apiVersion, undefined)
    assert.equal(identity.dialectCompatibility, "unverified")
  }
})

test("a dangling project configuration symlink is unavailable rather than an absent configuration fallback", (t) => {
  const sdk = sdkFixture(t)
  const workspace = sdkFixture(t)
  fs.symlinkSync(path.join(workspace, "missing.properties"), path.join(workspace, "local.properties"), "file")
  assert.deepEqual(driver.discoverProjectSdk(workspace, sdk), { ready: false, path: null, source: "project" })
})

test("bundled SDK selection preserves the properties-file MIT license notice", () => {
  const bundle = fs.readFileSync(output, "utf8")
  assert.match(bundle, /Copyright \(c\) 2022 Nicolas Bouvrette/)
  assert.match(bundle, /The above copyright notice and this permission notice shall be included in all/)
})

test("warm SDK queries do not reopen project configuration or rescan SDK layout or metadata", (t) => {
  const sdk = sdkFixture(t)
  const workspace = sdkFixture(t)
  fs.mkdirSync(path.join(sdk, "ets", "api"))
  const declaration = path.join(sdk, "ets", "api", "@ohos.projectApi.d.ts")
  fs.writeFileSync(declaration, "export declare class ProjectApi {}\n")
  fs.writeFileSync(path.join(workspace, "local.properties"), sdkProperty(sdk))
  const queries = driver.sdkQueries(workspace, path.join(workspace, "Page.ets"),
    "import { ProjectApi } from '@ohos.projectApi'\nconst api = new ProjectApi()\n")
  t.after(() => queries.dispose())
  assert.equal(queries.define()[0]?.path, declaration)
  const configurationPaths = new Set([sdk, path.join(sdk, "ets"), path.join(sdk, "toolchains"),
    path.join(sdk, "ets", "oh-uni-package.json"), path.join(workspace, "local.properties")])
  const originals = new Map()
  let probes = 0
  for (const method of ["openSync", "statSync", "lstatSync", "readdirSync"]) {
    const original = fs[method]
    originals.set(method, original)
    fs[method] = function (filePath, ...rest) {
      if (configurationPaths.has(String(filePath))) probes += 1
      return original.call(this, filePath, ...rest)
    }
  }
  try {
    // A new importer forces the module-resolution boundary, rather than only
    // repeating a query that TypeScript can answer from its own resolved cache.
    for (let i = 0; i < 100; i++) assert.equal(queries.defineFresh(i)[0]?.path, declaration)
    assert.equal(probes, 0)
  } finally {
    for (const [method, original] of originals) fs[method] = original
  }
})

function sdkFixture(t, prefix = "arkts-sdk-discovery-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, "ets"))
  fs.mkdirSync(path.join(root, "toolchains"))
  return root
}

function sdkProperty(sdkRoot) {
  return `sdk.dir=${sdkRoot.replaceAll("\\", "\\\\")}\n`
}
