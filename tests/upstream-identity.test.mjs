import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const script = path.join(projectRoot, "scripts", "semantic", "record-upstream-identity.mjs")

test("records a pinned upstream checkout and its loadable ETS compiler API", (t) => {
  const fixture = createUpstreamFixture(t)
  const lock = writeLock(fixture.root, fixture.revision)
  const licenseOut = path.join(fixture.root, "license.sha256")
  const reportOut = path.join(fixture.root, "report.json")

  const result = invoke({ checkout: fixture.checkout, lock, licenseOut, reportOut })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, fixture.revision + "\n")
  assert.equal(result.stderr, "")

  const updatedLock = JSON.parse(fs.readFileSync(lock, "utf8"))
  assert.equal(updatedLock.packageName, "ohos-typescript")
  assert.equal(updatedLock.packageVersion, "4.9.5-r4")
  const licenseDigest = createHash("sha256").update("Apache fixture\n").digest("hex")
  assert.equal(fs.readFileSync(licenseOut, "utf8"), licenseDigest + "  LICENSE\n")
  assert.deepEqual(JSON.parse(fs.readFileSync(reportOut, "utf8")), {
    schemaVersion: 1,
    semanticBackend: "openharmony/third_party_typescript",
    semanticBackendRepository: "https://github.com/openharmony/third_party_typescript.git",
    semanticBackendRevision: fixture.revision,
    sdkApiLevel: 24,
    sdkDeclarationDigest: "b".repeat(64),
    checkoutRevision: fixture.revision,
    licenseSha256: licenseDigest,
    packageName: "ohos-typescript",
    packageVersion: "4.9.5-r4",
    buildScript: { name: "build:compiler", command: "hereby local" },
    probeRuntime: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    },
    compilerApiIdentity: {
      modulePath: "lib/typescript.js",
      version: "4.9.5",
      scriptKindEts: 7,
      hasCreateLanguageService: true,
      hasCreateDocumentRegistry: true,
    },
  })
})

test("rejects a mismatched checkout or missing ETS API without mutating evidence", (t) => {
  const fixture = createUpstreamFixture(t)
  const lock = writeLock(fixture.root, "a".repeat(40))
  const licenseOut = path.join(fixture.root, "license.sha256")
  const reportOut = path.join(fixture.root, "report.json")

  const mismatch = invoke({ checkout: fixture.checkout, lock, licenseOut, reportOut })
  assert.equal(mismatch.status, 1)
  assert.match(mismatch.stderr, /checkout revision does not match/i)
  assert.equal(fs.existsSync(licenseOut), false)
  assert.equal(fs.existsSync(reportOut), false)
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).packageName, null)

  writeLock(fixture.root, fixture.revision)
  fs.writeFileSync(path.join(fixture.checkout, "lib", "typescript.js"), [
    "module.exports = {",
    "  version: '4.9.5',",
    "  ScriptKind: {},",
    "  createLanguageService() {},",
    "  createDocumentRegistry() {},",
    "}",
    "",
  ].join("\n"))
  const missingApi = invoke({ checkout: fixture.checkout, lock, licenseOut, reportOut })
  assert.equal(missingApi.status, 1)
  assert.match(missingApi.stderr, /ScriptKind\.ETS/)
  assert.equal(fs.existsSync(licenseOut), false)
  assert.equal(fs.existsSync(reportOut), false)
  assert.equal(JSON.parse(fs.readFileSync(lock, "utf8")).packageName, null)
})

test("the upstream cache is excluded from version control", () => {
  const ignore = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf8")
  assert.match(ignore, /^\.cache\/upstream\/$/m)
})

test("the committed upstream evidence matches the pinned toolchain identity", () => {
  const lock = readProjectJson("docs/toolchains/arkts-toolchain.lock.json")
  const report = readProjectJson("docs/reports/ohos-typescript-upstream.json")
  const license = fs.readFileSync(
    path.join(projectRoot, "docs", "toolchains", "ohos-typescript-license.sha256"),
    "utf8",
  )
  assert.equal(report.semanticBackend, lock.semanticBackend)
  assert.equal(report.semanticBackendRepository, lock.semanticBackendRepository)
  assert.equal(report.semanticBackendRevision, lock.semanticBackendRevision)
  assert.equal(report.checkoutRevision, lock.semanticBackendRevision)
  assert.equal(report.sdkApiLevel, lock.sdkApiLevel)
  assert.equal(report.sdkDeclarationDigest, lock.sdkDeclarationDigest)
  assert.equal(report.packageName, lock.packageName)
  assert.equal(report.packageVersion, lock.packageVersion)
  assert.equal(lock.packageName, "ohos-typescript")
  assert.equal(lock.packageVersion, "4.9.5-r4")
  assert.equal(license, report.licenseSha256 + "  LICENSE\n")
  assert.deepEqual(report.buildScript, { name: "build:compiler", command: "hereby local" })
  assert.equal(report.compilerApiIdentity.modulePath, "lib/typescript.js")
  assert.equal(report.compilerApiIdentity.hasCreateLanguageService, true)
  assert.equal(report.compilerApiIdentity.hasCreateDocumentRegistry, true)
  assert.ok(Number.isSafeInteger(report.compilerApiIdentity.scriptKindEts))
  assert.match(report.probeRuntime.nodeVersion, /^v\d+/)
  assert.ok(report.probeRuntime.platform)
  assert.ok(report.probeRuntime.architecture)
})

function createUpstreamFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-upstream-identity-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const checkout = path.join(root, "checkout")
  fs.mkdirSync(path.join(checkout, "lib"), { recursive: true })
  fs.writeFileSync(path.join(checkout, "LICENSE"), "Apache fixture\n")
  fs.writeFileSync(path.join(checkout, "package.json"), JSON.stringify({
    name: "ohos-typescript",
    version: "4.9.5-r4",
    main: "lib/typescript.js",
    scripts: {
      build: "npm run build:compiler && npm run build:tests",
      "build:compiler": "hereby local",
    },
  }, null, 2) + "\n")
  fs.writeFileSync(path.join(checkout, "lib", "typescript.js"), [
    "module.exports = {",
    "  version: '4.9.5',",
    "  ScriptKind: { ETS: 7 },",
    "  createLanguageService() {},",
    "  createDocumentRegistry() {},",
    "}",
    "",
  ].join("\n"))
  runGit(checkout, ["init", "-q"])
  runGit(checkout, ["add", "."])
  runGit(checkout, [
    "-c", "user.name=ArkTS Test",
    "-c", "user.email=arkts-test@example.invalid",
    "commit", "-q", "-m", "fixture",
  ])
  return { root, checkout, revision: runGit(checkout, ["rev-parse", "HEAD"]).stdout.trim() }
}

function writeLock(root, revision) {
  const lock = path.join(root, "lock.json")
  fs.writeFileSync(lock, JSON.stringify({
    schemaVersion: 1,
    semanticBackend: "openharmony/third_party_typescript",
    semanticBackendRevision: revision,
    semanticBackendRepository: "https://github.com/openharmony/third_party_typescript.git",
    sdkApiLevel: 24,
    sdkDeclarationDigest: "b".repeat(64),
    packageName: null,
    packageVersion: null,
  }, null, 2) + "\n")
  return lock
}

function invoke({ checkout, lock, licenseOut, reportOut }) {
  return spawnSync(process.execPath, [
    script,
    "--checkout", checkout,
    "--lock", lock,
    "--license-out", licenseOut,
    "--report-out", reportOut,
  ], { cwd: projectRoot, encoding: "utf8" })
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  return result
}

function readProjectJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, ...relativePath.split("/")), "utf8"))
}
