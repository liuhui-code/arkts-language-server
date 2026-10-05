import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const tools = path.join(repository, "scripts/semantic/semantic-facts-spike")
const pinCli = path.join(tools, "pin-production-workspace.mjs")
const runCli = path.join(tools, "run.mjs")
const hookBuilder = path.join(tools, "build-worklist-hook.mjs")

test("pinned installed local package has complete stock and facts-only constructor references", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-installed-scope-"))
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }))
  const workspace = path.join(temporary, "workspace")
  const sdk = path.join(temporary, "sdk")
  const input = path.join(temporary, "pinned.json")
  const queries = path.join(temporary, "queries.json")
  const compiler = path.join(temporary, "typescript.cjs")
  const extraction = path.join(temporary, "extraction.json")
  const facts = path.join(temporary, "facts.json")
  const consumerFile = "entry/src/main/ets/Consumer.ets"
  const packageFile = "local-widget/index.ets"
  const consumer = "import { Widget } from '@fixture/widget'\nconst widget = new Widget()\n"

  write(path.join(sdk, "ets/oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  write(path.join(sdk, "ets/component/index-full.d.ts"), "interface ArkThing {}\n")
  fs.mkdirSync(path.join(sdk, "toolchains"))
  write(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: [{ name: "entry", srcPath: "./entry",
      targets: [{ name: "default", applyToProducts: ["default"] }] }],
  }))
  write(path.join(workspace, "entry/build-profile.json5"),
    JSON.stringify({ targets: [{ name: "default" }] }))
  write(path.join(workspace, "entry/src/main/module.json5"),
    JSON.stringify({ module: { name: "entry", type: "entry", deviceTypes: ["phone"] } }))
  write(path.join(workspace, consumerFile), consumer)
  write(path.join(workspace, "entry/oh-package.json5"), JSON.stringify({
    name: "entry", dependencies: { "@fixture/widget": "file:../local-widget" },
  }))
  write(path.join(workspace, "entry/oh-package-lock.json5"), JSON.stringify({
    lockfileVersion: 3,
    specifiers: { "@fixture/widget@../local-widget": "@fixture/widget@../local-widget" },
    packages: { "@fixture/widget@../local-widget": {
      name: "@fixture/widget", version: "1.0.0", registryType: "local",
      resolved: "../local-widget",
    } },
  }))
  write(path.join(workspace, "local-widget/oh-package.json5"),
    JSON.stringify({ name: "@fixture/widget", version: "1.0.0", main: "index.ets" }))
  write(path.join(workspace, packageFile),
    "export class Widget {\n  constructor() {}\n}\n")
  const packageLink = path.join(workspace, "entry/oh_modules/@fixture/widget")
  fs.mkdirSync(path.dirname(packageLink), { recursive: true })
  fs.symlinkSync(path.relative(path.dirname(packageLink),
    path.join(workspace, "local-widget")), packageLink, "dir")
  write(queries, JSON.stringify({ schemaVersion: 1, queries: [
    { id: "without-declaration", file: consumerFile, line: 1,
      character: "const widget = new ".length + 1, includeDeclaration: false },
    { id: "with-declaration", file: consumerFile, line: 1,
      character: "const widget = new ".length + 1, includeDeclaration: true },
  ] }))

  const pinned = invoke(pinCli, "--workspace", workspace, "--sdk", sdk,
    "--file", consumerFile, "--out", input, "--pin-installed")
  assert.equal(pinned.status, 0, describe(pinned))
  const manifest = JSON.parse(fs.readFileSync(input, "utf8"))
  assert.equal(manifest.schemaVersion, 3)
  assert.deepEqual(manifest.files, [consumerFile],
    "the package is a compiler dependency, not a declared project membership file")

  const stock = invoke(runCli, "--mode", "production-oracle", "--input", input,
    "--queries", queries)
  assert.equal(stock.status, 0, describe(stock))
  const oracle = JSON.parse(stock.stdout)
  assert.equal(oracle.hostParity, "PRODUCTION_HOST")
  assert.deepEqual(oracle.answers.map(({ status }) => status), ["COMPLETE", "COMPLETE"])
  const without = oracle.answers[0].locations
  const withDeclaration = oracle.answers[1].locations
  const usage = { file: consumerFile,
    start: { line: 1, character: "const widget = new ".length },
    end: { line: 1, character: "const widget = new Widget".length } }
  const declaration = { file: packageFile,
    start: { line: 1, character: 2 }, end: { line: 1, character: 13 } }
  assert.ok(without.some((item) => equalLocation(item, usage)),
    "excluding declarations must retain the project usage")
  assert.ok(withDeclaration.some((item) => equalLocation(item, usage)),
    "including declarations must retain the project usage")
  assert.equal(without.some((item) => equalLocation(item, declaration)), false)
  assert.ok(withDeclaration.some((item) => equalLocation(item, declaration)),
    "the pinned package constructor declaration must not be silently omitted")

  const built = invoke(hookBuilder, "--variant", "usage-v6", "--out", compiler)
  assert.equal(built.status, 0, describe(built))
  // Extraction receives no query positions or expected locations.
  const extracted = invoke(runCli, "--mode", "production-extract", "--input", input,
    "--compiler-artifact", compiler, "--out", extraction)
  assert.equal(extracted.status, 0, describe(extracted))
  const artifact = JSON.parse(fs.readFileSync(extraction, "utf8"))
  assert.equal(artifact.hostParity, "PRODUCTION_HOST")
  assert.equal(artifact.projectMembershipCount, manifest.files.length)
  assert.ok(artifact.facts, "complete extraction must produce facts")
  assert.equal(artifact.metrics.selectionSourceFiles, manifest.files.length,
    "only project members may become query-selection roots")
  assert.equal(artifact.metrics.indexedSourceFiles, 2,
    "compiler search must still cover both project and pinned package sources")
  assert.ok(artifact.facts.selections.every((item) => item.file === consumerFile),
    "installed package constructors must not become new query selections")
  assert.ok(Object.hasOwn(artifact.facts.files, packageFile),
    "package source must remain available for exact compiler-proved locations")
  fs.writeFileSync(facts, JSON.stringify(artifact.facts))
  const queried = invoke(runCli, "--mode", "query", "--facts", facts, "--queries", queries)
  assert.equal(queried.status, 0, describe(queried))
  const hypothesis = JSON.parse(queried.stdout)
  assert.deepEqual(hypothesis.answers.map(({ status }) => status), ["HYPOTHESIS", "HYPOTHESIS"])
  assert.deepEqual(hypothesis.answers.map(({ locations }) => locations),
    oracle.answers.map(({ locations }) => locations),
    "facts-only answers must match the stock compiler's URI/UTF-16 result sets exactly")
})

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}

function invoke(cli, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repository, encoding: "utf8", timeout: 45_000, maxBuffer: 32 * 1024 * 1024,
  })
}

function describe(result) {
  return JSON.stringify({ status: result.status, signal: result.signal,
    error: result.error?.message, stdout: result.stdout, stderr: result.stderr })
}

function equalLocation(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}
