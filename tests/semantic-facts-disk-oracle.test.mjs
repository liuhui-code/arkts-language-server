import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { digestSdk } from "../scripts/semantic/lock-toolchain.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = path.join(root, "scripts/semantic/semantic-facts-spike/run.mjs")
const pinCli = path.join(root, "scripts/semantic/semantic-facts-spike/pin-production-workspace.mjs")
const worklistBuilder = path.join(root, "scripts/semantic/semantic-facts-spike/build-worklist-hook.mjs")

test("stock oracle reads pinned source from its original workspace path", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-disk-oracle-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true })
  fs.mkdirSync(sdkRoot)
  const source = "export function target() {}\ntarget()\n"
  fs.writeFileSync(path.join(workspaceRoot, "src/model.ets"), source)
  const listedSourceSha256 = digest(JSON.stringify([
    ["src/model.ets", digest(source)],
  ]))
  const manifest = path.join(temporary, "workspace-input.json")
  const queries = path.join(temporary, "queries.json")
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 2, kind: "disk-workspace", workspaceRoot, sdkRoot,
    listedSourceSha256, files: ["src/model.ets"],
  }))
  fs.writeFileSync(queries, JSON.stringify({
    schemaVersion: 1, queries: [{ id: "target", file: "src/model.ets",
      line: 0, character: 16, includeDeclaration: true }],
  }))

  const result = spawnSync(process.execPath, [cli, "--mode", "oracle", "--input", manifest,
    "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const oracle = JSON.parse(result.stdout)
  assert.equal(oracle.inputSha256, listedSourceSha256)
  assert.equal(oracle.inputMode, "disk-workspace")
  assert.equal(oracle.hostParity, "HOST_PARITY_NOT_MET")
  assert.equal(oracle.productionApproved, false)
  assert.equal(oracle.workspaceRoot, workspaceRoot)
  assert.equal(oracle.sdkRoot, sdkRoot)
  assert.deepEqual(oracle.answers[0].locations, [
    { file: "src/model.ets", start: { line: 0, character: 16 },
      end: { line: 0, character: 22 } },
    { file: "src/model.ets", start: { line: 1, character: 0 },
      end: { line: 1, character: 6 } },
  ])
})

test("stock oracle returns no answer after a listed source changes beyond its pin", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-disk-oracle-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(workspaceRoot)
  fs.mkdirSync(sdkRoot)
  const original = "export function target() {}\ntarget()\n"
  const source = path.join(workspaceRoot, "model.ets")
  fs.writeFileSync(source, original)
  const listedSourceSha256 = digest(JSON.stringify([["model.ets", digest(original)]]))
  const manifest = path.join(temporary, "workspace-input.json")
  const queries = path.join(temporary, "queries.json")
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 2, kind: "disk-workspace", workspaceRoot, sdkRoot,
    listedSourceSha256, files: ["model.ets"],
  }))
  fs.writeFileSync(queries, JSON.stringify({
    schemaVersion: 1, queries: [{ id: "target", file: "model.ets",
      line: 0, character: 16, includeDeclaration: true }],
  }))
  fs.appendFileSync(source, "// changed after pin\n")

  const result = spawnSync(process.execPath, [cli, "--mode", "oracle", "--input", manifest,
    "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 2)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /listed-source digest mismatch/u)
})

test("disk oracle refuses inline source text in its workspace manifest", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-disk-oracle-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(workspaceRoot)
  fs.mkdirSync(sdkRoot)
  const manifest = path.join(temporary, "workspace-input.json")
  const queries = path.join(temporary, "queries.json")
  fs.writeFileSync(manifest, JSON.stringify({
    schemaVersion: 2, kind: "disk-workspace", workspaceRoot, sdkRoot,
    listedSourceSha256: "0".repeat(64), files: { "model.ets": "export class Model {}" },
  }))
  fs.writeFileSync(queries, JSON.stringify({
    schemaVersion: 1, queries: [{ id: "model", file: "model.ets",
      line: 0, character: 13, includeDeclaration: true }],
  }))

  const result = spawnSync(process.execPath, [cli, "--mode", "oracle", "--input", manifest,
    "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 2)
  assert.equal(result.stdout, "")
  assert.match(result.stderr, /no source copies/u)
})

test("production stock oracle uses the original project membership and selected SDK", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-oracle-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "api"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "toolchains"))
  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    "/// <reference path=\"./common.d.ts\" />\n")
  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "common.d.ts"), "interface ArkThing {}\n")
  fs.writeFileSync(path.join(sdkRoot, "ets", "api", "@ohos.fake.d.ts"),
    "export class Fake implements ArkThing {}\n")
  const files = {
    "src/model.ets": "import { Fake } from '@ohos.fake'\nexport function target(): Fake { return new Fake() }\ntarget()\n",
    "src/consumer.ets": "import { target } from './model'\ntarget()\n",
  }
  for (const [name, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(workspaceRoot, name), source)
  }
  fs.writeFileSync(path.join(workspaceRoot, "oh-package.json5"), '{"name":"fixture"}\n')
  const sdkDeclarationDigest = await digestSdk(sdkRoot)
  const manifest = path.join(temporary, "workspace-input.json")
  const queries = path.join(temporary, "queries.json")
  const pinned = spawnSync(process.execPath, [pinCli, "--workspace", workspaceRoot,
    "--sdk", sdkRoot, "--file", "src/model.ets", "--out", manifest],
  { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(pinned.status, 0, pinned.stderr)
  assert.equal(JSON.parse(fs.readFileSync(manifest, "utf8")).sdkDeclarationDigest, sdkDeclarationDigest)
  fs.writeFileSync(queries, JSON.stringify({ schemaVersion: 1, queries: [
    { id: "target", file: "src/model.ets", line: 1, character: 16, includeDeclaration: true },
  ] }))

  const result = spawnSync(process.execPath, [cli, "--mode", "production-oracle", "--input", manifest,
    "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  const oracle = JSON.parse(result.stdout)
  assert.equal(oracle.hostParity, "PRODUCTION_HOST")
  assert.equal(oracle.sdkUsedByHost, true)
  assert.equal(oracle.projectMembershipCount, 2)
  assert.deepEqual(oracle.answers[0].locations, [
    { file: "src/consumer.ets", start: { line: 0, character: 9 },
      end: { line: 0, character: 15 } },
    { file: "src/consumer.ets", start: { line: 1, character: 0 },
      end: { line: 1, character: 6 } },
    { file: "src/model.ets", start: { line: 1, character: 16 },
      end: { line: 1, character: 22 } },
    { file: "src/model.ets", start: { line: 2, character: 0 },
      end: { line: 2, character: 6 } },
  ])

  // The listed-source pin is not a complete workspace pin by itself.
  fs.writeFileSync(path.join(workspaceRoot, "src", "unlisted.ets"), "target()\n")
  const changed = spawnSync(process.execPath, [cli, "--mode", "production-oracle", "--input", manifest,
    "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(changed.status, 2)
  assert.equal(changed.stdout, "")
  assert.match(changed.stderr, /membership mismatch/u)
  fs.rmSync(path.join(workspaceRoot, "src", "unlisted.ets"))

  fs.appendFileSync(path.join(sdkRoot, "ets", "component", "common.d.ts"), "interface Drift {}\n")
  const drifted = spawnSync(process.execPath, [cli, "--mode", "production-oracle", "--input", manifest,
    "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(drifted.status, 2)
  assert.equal(drifted.stdout, "")
  assert.match(drifted.stderr, /SDK declaration digest mismatch/u)

  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "common.d.ts"), "interface ArkThing {}\n")
  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "23", version: "test" }))
  const optionsDrift = spawnSync(process.execPath, [cli, "--mode", "production-oracle",
    "--input", manifest, "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(optionsDrift.status, 2)
  assert.equal(optionsDrift.stdout, "")
  assert.match(optionsDrift.stderr, /SDK compiler-options digest mismatch/u)

  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.mkdirSync(path.join(sdkRoot, "ets", "build-tools", "ets-loader"), { recursive: true })
  fs.writeFileSync(path.join(sdkRoot, "ets", "build-tools", "ets-loader", "tsconfig.json"),
    JSON.stringify({ compilerOptions: { ets: { enableStruct: true } } }))
  const configDrift = spawnSync(process.execPath, [cli, "--mode", "production-oracle",
    "--input", manifest, "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(configDrift.status, 2)
  assert.equal(configDrift.stdout, "")
  assert.match(configDrift.stderr, /SDK compiler-options digest mismatch/u)

  fs.rmSync(path.join(sdkRoot, "ets", "build-tools", "ets-loader", "tsconfig.json"))
  fs.writeFileSync(path.join(workspaceRoot, "oh-package.json5"), '{"name":"changed"}\n')
  const projectDrift = spawnSync(process.execPath, [cli, "--mode", "production-oracle",
    "--input", manifest, "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(projectDrift.status, 2)
  assert.equal(projectDrift.stdout, "")
  assert.match(projectDrift.stderr, /project configuration digest mismatch/u)

  fs.writeFileSync(path.join(workspaceRoot, "oh-package.json5"), '{"name":"fixture"}\n')
  fs.mkdirSync(path.join(workspaceRoot, "oh_modules"))
  const installed = spawnSync(process.execPath, [cli, "--mode", "production-oracle",
    "--input", manifest, "--queries", queries], { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(installed.status, 2)
  assert.equal(installed.stdout, "")
  assert.match(installed.stderr, /installed dependencies are not pinned/u)
})

test("production workspace pin records complete discovered membership without copying source text", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-pin-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "toolchains"))
  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    "interface ArkThing {}\n")
  const source = "export function target() {}\ntarget()\n"
  fs.writeFileSync(path.join(workspaceRoot, "src", "model.ets"), source)
  const output = path.join(temporary, "pinned.json")
  const args = [pinCli, "--workspace", workspaceRoot, "--sdk", sdkRoot,
    "--file", "src/model.ets", "--out", output]
  const first = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(first.status, 0, first.stderr)
  const pinned = JSON.parse(fs.readFileSync(output, "utf8"))
  assert.deepEqual(pinned.files, ["src/model.ets"])
  assert.equal(pinned.listedSourceSha256, digest(JSON.stringify([
    ["src/model.ets", digest(source)],
  ])))
  assert.equal(pinned.sdkDeclarationDigest, await digestSdk(sdkRoot))
  assert.match(pinned.sdkCompilerOptionsDigest, /^[a-f0-9]{64}$/u)
  assert.match(pinned.projectConfigurationDigest, /^[a-f0-9]{64}$/u)
  assert.equal(Object.hasOwn(pinned, "sourceText"), false)
  assert.equal(pinned.kind, "disk-workspace")
  const second = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 30_000 })
  assert.equal(second.status, 2)
  assert.match(second.stderr, /refusing to overwrite/u)
})

test("isolated constructor hook extracts facts using the same pinned production host as stock", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-hook-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "toolchains"))
  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    "interface ArkThing {}\n")
  fs.writeFileSync(path.join(workspaceRoot, "src", "model.ets"),
    "export class Model {\n  constructor() {}\n}\n")
  fs.writeFileSync(path.join(workspaceRoot, "src", "consumer.ets"),
    "import { Model } from './model'\nnew Model()\n")
  const manifest = path.join(temporary, "pinned.json")
  const queries = path.join(temporary, "queries.json")
  const artifact = path.join(temporary, "typescript.cjs")
  const factsPath = path.join(temporary, "facts.json")
  const extractionPath = path.join(temporary, "extraction.json")
  fs.writeFileSync(queries, JSON.stringify({ schemaVersion: 1, queries: [
    { id: "model-constructor", file: "src/model.ets", line: 1, character: 2,
      includeDeclaration: false },
  ] }))
  const invoke = (...args) => spawnSync(process.execPath, args,
    { cwd: root, encoding: "utf8", timeout: 45_000, maxBuffer: 32 * 1024 * 1024 })
  const pinned = invoke(pinCli, "--workspace", workspaceRoot, "--sdk", sdkRoot,
    "--file", "src/model.ets", "--out", manifest)
  assert.equal(pinned.status, 0, `${pinned.stderr}\n${pinned.stdout}`)
  const built = invoke(worklistBuilder, "--variant", "usage-v6", "--out", artifact)
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)
  const stock = invoke(cli, "--mode", "production-oracle", "--input", manifest,
    "--queries", queries)
  assert.equal(stock.status, 0, `${stock.stderr}\n${stock.stdout}`)
  const oracle = JSON.parse(stock.stdout)
  assert.equal(oracle.hostParity, "PRODUCTION_HOST")
  assert.ok(oracle.answers[0].locations.length > 0)

  // No query position or expected answer is passed to the extraction process.
  const extraction = invoke(cli, "--mode", "production-extract", "--input", manifest,
    "--compiler-artifact", artifact, "--out", extractionPath)
  assert.equal(extraction.status, 0, `${extraction.stderr}\n${extraction.stdout}`)
  const summary = JSON.parse(extraction.stdout)
  assert.equal(summary.status, "EXTRACTED")
  assert.equal(summary.artifactPath, extractionPath)
  const extracted = JSON.parse(fs.readFileSync(extractionPath, "utf8"))
  assert.equal(extracted.hostParity, "PRODUCTION_HOST")
  assert.equal(extracted.productionApproved, false)
  assert.equal(extracted.inputSha256, oracle.inputSha256)
  assert.equal(extracted.sdkDeclarationDigest, oracle.sdkDeclarationDigest)
  assert.equal(extracted.sdkCompilerOptionsDigest, oracle.sdkCompilerOptionsDigest)
  assert.deepEqual(extracted.sdkIdentity, oracle.sdkIdentity)
  assert.equal(extracted.projectMembershipCount, oracle.projectMembershipCount)
  for (const field of ["programRootFiles", "programProjectRootFiles", "sdkRootFiles",
    "programSourceFiles", "programProjectFiles", "sdkSourceFiles"]) {
    assert.equal(extracted.metrics[field], oracle.metrics[field], field)
  }
  for (const field of ["programRootsSha256", "compilerOptionsSha256"]) {
    assert.match(oracle.metrics[field], /^[a-f0-9]{64}$/u, field)
    assert.equal(extracted.metrics[field], oracle.metrics[field], field)
  }
  assert.equal(JSON.parse(fs.readFileSync(manifest, "utf8")).membershipSeedFile,
    "src/model.ets")

  fs.writeFileSync(factsPath, JSON.stringify(extracted.facts))
  const factsOnly = invoke(cli, "--mode", "query", "--facts", factsPath,
    "--queries", queries)
  assert.equal(factsOnly.status, 0, `${factsOnly.stderr}\n${factsOnly.stdout}`)
  const answer = JSON.parse(factsOnly.stdout).answers[0]
  assert.equal(answer.status, "HYPOTHESIS")
  assert.deepEqual(answer.locations, oracle.answers[0].locations)
})

test("production extraction explains an SDK constructor origin outside pinned workspace roots", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-origin-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "toolchains"))
  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    "declare class ExternalThing { constructor(); }\n")
  fs.writeFileSync(path.join(workspaceRoot, "src", "consumer.ets"), "new ExternalThing()\n")
  const manifest = path.join(temporary, "pinned.json")
  const artifact = path.join(temporary, "typescript.cjs")
  const extractionPath = path.join(temporary, "extraction.json")
  const invoke = (...args) => spawnSync(process.execPath, args,
    { cwd: root, encoding: "utf8", timeout: 45_000, maxBuffer: 32 * 1024 * 1024 })
  const pinned = invoke(pinCli, "--workspace", workspaceRoot, "--sdk", sdkRoot,
    "--file", "src/consumer.ets", "--out", manifest)
  assert.equal(pinned.status, 0, `${pinned.stderr}\n${pinned.stdout}`)
  const built = invoke(worklistBuilder, "--variant", "usage-v6", "--out", artifact)
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)

  const extraction = invoke(cli, "--mode", "production-extract", "--input", manifest,
    "--compiler-artifact", artifact, "--out", extractionPath)
  assert.equal(extraction.status, 42, `${extraction.stderr}\n${extraction.stdout}`)
  const summary = JSON.parse(extraction.stdout)
  assert.equal(summary.status, "FAIL")
  assert.equal(summary.failureCode, "HOOK_UNSUPPORTED")
  assert.equal(summary.artifactPath, extractionPath)
  assert.equal(Object.hasOwn(summary, "facts"), false)
  const failure = JSON.parse(fs.readFileSync(extractionPath, "utf8"))
  assert.equal(failure.reason, "ORIGIN_WORKLIST_UNSUPPORTED_OUTSIDE_ROOT_OR_SPAN")
  assert.deepEqual(failure.failureDetail, {
    failedPredicate: "OUTSIDE_SEARCH_ROOTS",
    selection: { scope: "workspace", file: "src/consumer.ets",
      span: { start: 4, length: 13 } },
    definition: { scope: "sdk", file: "ets/component/index-full.d.ts",
      span: { start: 30, length: 14 } },
  })
  assert.equal(Object.hasOwn(failure, "facts"), false)
  assert.equal(JSON.stringify(failure).includes(temporary), false)
})

test("production extraction keeps exact local constructor facts while marking built-in Array unknown", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-partial-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "toolchains"))
  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "index-full.d.ts"),
    "interface ArkThing {}\n")
  fs.writeFileSync(path.join(workspaceRoot, "src", "model.ets"),
    "export class Local {\n  constructor() {}\n}\nnew Local()\nnew Array()\n")
  const manifest = path.join(temporary, "pinned.json")
  const artifact = path.join(temporary, "typescript.cjs")
  const extractionPath = path.join(temporary, "extraction.json")
  const factsPath = path.join(temporary, "facts.json")
  const localQueries = path.join(temporary, "local-queries.json")
  const arrayQueries = path.join(temporary, "array-queries.json")
  fs.writeFileSync(localQueries, JSON.stringify({ schemaVersion: 1, queries: [
    { id: "local-no-declaration", file: "src/model.ets", line: 1, character: 2,
      includeDeclaration: false },
    { id: "local-with-declaration", file: "src/model.ets", line: 1, character: 2,
      includeDeclaration: true },
  ] }))
  fs.writeFileSync(arrayQueries, JSON.stringify({ schemaVersion: 1, queries: [
    { id: "array", file: "src/model.ets", line: 4, character: 4,
      includeDeclaration: true },
  ] }))
  const invoke = (...args) => spawnSync(process.execPath, args,
    { cwd: root, encoding: "utf8", timeout: 45_000, maxBuffer: 32 * 1024 * 1024 })
  const pinned = invoke(pinCli, "--workspace", workspaceRoot, "--sdk", sdkRoot,
    "--file", "src/model.ets", "--out", manifest)
  assert.equal(pinned.status, 0, `${pinned.stderr}\n${pinned.stdout}`)
  const built = invoke(worklistBuilder, "--variant", "usage-v6", "--out", artifact)
  assert.equal(built.status, 0, `${built.stderr}\n${built.stdout}`)
  const stock = invoke(cli, "--mode", "production-oracle", "--input", manifest,
    "--queries", localQueries)
  assert.equal(stock.status, 0, `${stock.stderr}\n${stock.stdout}`)
  assert.ok(JSON.parse(stock.stdout).answers.every(({ locations }) => locations.length > 0))

  const extraction = invoke(cli, "--mode", "production-extract", "--input", manifest,
    "--compiler-artifact", artifact, "--out", extractionPath)
  assert.equal(extraction.status, 42, `${extraction.stderr}\n${extraction.stdout}`)
  const extracted = JSON.parse(fs.readFileSync(extractionPath, "utf8"))
  assert.equal(extracted.status, "FAIL")
  assert.equal(extracted.failureCode, "PARTIAL_UNSUPPORTED")
  assert.equal(extracted.coverage, "PARTIAL")
  assert.equal(extracted.productionApproved, false)
  assert.equal(extracted.facts.coverage, "PARTIAL")
  assert.equal(JSON.stringify(extracted.facts).includes(temporary), false)
  assert.equal(JSON.stringify(extracted.failureDetail).includes(temporary), false)
  assert.deepEqual(extracted.failureDetail?.definition?.scope, "external")
  assert.equal(extracted.failureDetail?.definition?.file, null)
  assert.match(extracted.failureDetail?.definition?.identity ?? "", /^[a-f0-9]{16}$/u)
  fs.writeFileSync(factsPath, JSON.stringify(extracted.facts))
  const local = invoke(cli, "--mode", "query", "--facts", factsPath,
    "--queries", localQueries)
  assert.equal(local.status, 0, `${local.stderr}\n${local.stdout}`)
  assert.deepEqual(JSON.parse(local.stdout).answers.map(({ status }) => status),
    ["HYPOTHESIS", "HYPOTHESIS"])
  assert.deepEqual(JSON.parse(local.stdout).answers.map(({ locations }) => locations),
    JSON.parse(stock.stdout).answers.map(({ locations }) => locations))
  const array = invoke(cli, "--mode", "query", "--facts", factsPath,
    "--queries", arrayQueries)
  assert.equal(array.status, 0, `${array.stderr}\n${array.stdout}`)
  assert.deepEqual(JSON.parse(array.stdout).answers[0],
    { id: "array", status: "UNSUPPORTED", locations: [] })
  const arrayOffset = fs.readFileSync(path.join(workspaceRoot, "src", "model.ets"), "utf8")
    .indexOf("Array")
  assert.deepEqual(extracted.facts.selections.find(({ start }) => start === arrayOffset), {
    file: "src/model.ets", start: arrayOffset, length: 5,
    keys: [], unknownReason: "OUTSIDE_SEARCH_ROOTS",
  })
})

test("production extraction optionally reports a sanitized adjusted-branch failure", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-adjusted-branch-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspaceRoot = path.join(temporary, "workspace")
  const sdkRoot = path.join(temporary, "sdk")
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdkRoot, "toolchains"))
  fs.writeFileSync(path.join(sdkRoot, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  fs.writeFileSync(path.join(sdkRoot, "ets", "component", "index-full.d.ts"), "interface ArkThing {}\n")
  const source = "export class Base {\n  constructor() {}\n}\nconst Alias = Base\nnew Alias()\n"
  fs.writeFileSync(path.join(workspaceRoot, "src", "model.ets"), source)
  const manifest = path.join(temporary, "pinned.json")
  const artifact = path.join(temporary, "typescript.cjs")
  const invoke = (script, args, env = process.env) => spawnSync(process.execPath, [script, ...args],
    { cwd: root, encoding: "utf8", timeout: 45_000, maxBuffer: 32 * 1024 * 1024, env })
  assert.equal(invoke(pinCli, ["--workspace", workspaceRoot, "--sdk", sdkRoot,
    "--file", "src/model.ets", "--out", manifest]).status, 0)
  assert.equal(invoke(worklistBuilder, ["--variant", "usage-v6", "--out", artifact]).status, 0)
  for (const enabled of [false, true]) {
    const out = path.join(temporary, enabled ? "on.json" : "off.json")
    const env = { ...process.env, ARKTS_S02_FAILURE_DETAIL: enabled ? "1" : undefined }
    const run = invoke(cli, ["--mode", "production-extract", "--input", manifest,
      "--compiler-artifact", artifact, "--out", out], env)
    assert.equal(run.status, 42, `${run.stderr}\n${run.stdout}`)
    assert.equal(JSON.parse(run.stdout).failureCode, "HOOK_UNSUPPORTED")
    const failure = JSON.parse(fs.readFileSync(out, "utf8"))
    assert.equal(failure.reason, "ORIGIN_WORKLIST_UNSUPPORTED_ADJUSTED_BRANCH")
    assert.equal(Object.hasOwn(failure, "facts"), false)
    if (!enabled) assert.equal(Object.hasOwn(failure, "failureDetail"), false)
    else {
      assert.equal(failure.failureDetail?.failedPredicate, "ADJUSTED_BRANCH")
      assert.deepEqual(failure.failureDetail?.selection?.scope, "workspace")
      assert.deepEqual(failure.failureDetail?.selection?.file, "src/model.ets")
      assert.deepEqual(failure.failureDetail?.selection?.span,
        { start: source.lastIndexOf("Alias"), length: 5 })
      assert.equal(failure.failureDetail?.definition?.scope, "workspace")
      assert.equal(failure.failureDetail?.definition?.file, "src/model.ets")
      assert.ok(Number.isSafeInteger(failure.failureDetail?.definition?.span?.start))
      assert.ok(Number.isSafeInteger(failure.failureDetail?.definition?.span?.length))
      assert.equal(JSON.stringify(failure).includes(temporary), false)
      assert.equal(JSON.stringify(failure).includes(source), false)
    }
  }
})

function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}
