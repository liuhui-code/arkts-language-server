import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

const sorted = values => values.map(value => JSON.stringify(value)).sort()
test("a complete compiler and search-input receipt caches a project type despite global SDK target partial",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/reference-query-cache-audit.cjs"))}` })
    for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
    const texts = { "Main.ets": 'import { Target } from "./Target"\nexport const view = new Target()\n',
      "Use.ts": 'import { Target } from "./Target"\nexport const second = new Target()\n', "Target.ts": "export class Target {}\n" }
    for (const [file, text] of Object.entries(texts)) fs.writeFileSync(path.join(sourceRoot, file), text)
    fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default", compileSdkVersion: 20, compatibleSdkVersion: 20 }] },
      modules: [{ name: "app", srcPath: "./app", targets: [{ name: "default", applyToProducts: ["default"] }] }] }))
    await initializeReadinessFixture(f, 3)
    assert.equal(f.initialPreparation.semanticState, "partial")
    const uri = f.uri(`${folder}/Main.ets`), text = texts["Main.ets"]
    const params = { textDocument: { uri }, position: positionAt(text, text.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
    const range = (text, start) => ({ start: positionAt(text, start), end: positionAt(text, start + 6) })
    const expected = Object.entries(texts).flatMap(([file, text]) => (file === "Target.ts"
      ? [text.indexOf("Target")] : [text.indexOf("Target"), text.lastIndexOf("Target")])
      .map(start => ({ uri: f.uri(`${folder}/${file}`), range: range(text, start) })))
    const first = await f.session.request("textDocument/references", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    assert.deepEqual(sorted(first.result), sorted(expected))
    const before = f.events().filter(e => e.event === "references.batch.start").length
    const work = () => fs.readFileSync(path.join(f.directory, "reference-query-work.ndjson"), "utf8").trim().split("\n").map(JSON.parse)
    const count = event => work().filter(e => e.event === event).length
    const programs = count("program-created"), workers = count("worker-created")
    assert.ok(programs > 0 && workers > 0)
    const repeat = await f.session.request("textDocument/references", params)
    assert.equal(repeat.error, undefined, JSON.stringify(repeat))
    assert.deepEqual(sorted(repeat.result), sorted(expected))
    assert.equal(count("program-created"), programs)
    assert.equal(count("worker-created"), workers)
    assert.equal(f.events().find(e => e.event === "references.cache.store")?.coverageKind, "full-program")
    assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 1)
    assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
    assert.equal(f.events().filter(e => e.event === "references.batch.start").length, before)
    const readiness = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
    assert.equal(readiness.result.semanticState, "partial")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("a silently replaced SDK dependency cannot reuse the former full-program answer", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const text = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target extends SdkBase {}\n")
  const sdkFile = path.join(f.sdk, "ets/component/common.d.ts")
  const sdkText = "declare class SdkBase {}\n"
  fs.writeFileSync(sdkFile, sdkText)
  await initializeReadinessFixture(f, 2)
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(text, text.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first))
  assert.equal(first.result.length, 3)
  assert.equal((await f.session.request("textDocument/references", params)).error, undefined)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  const before = fs.statSync(sdkFile)
  fs.writeFileSync(sdkFile, sdkText.replace("SdkBase", "OldBase"))
  fs.utimesSync(sdkFile, before.atime, before.mtime)
  const changed = await f.session.request("textDocument/references", params)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1,
    "same-length, restored-mtime SDK replacement must not hit the old result")
  if (changed.error) assert.equal(changed.error.code, -32803, JSON.stringify(changed))
  else assert.equal(changed.result.length, 3)
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("a project declaration cannot certify an unidentified SDK distribution", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const text = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target {}\n")
  fs.unlinkSync(path.join(f.sdk, "ets/oh-uni-package.json"))
  await initializeReadinessFixture(f, 2)
  assert.equal(f.initialPreparation.semanticState, "partial")
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(text, text.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  for (let i = 0; i < 2; i++) {
    const result = await f.session.request("textDocument/references", params)
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.equal(result.result.length, 3)
  }
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 0)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 0)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("full-program receipts bind unsaved overlays and close back to disk authority", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const disk = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  const edited = disk + "export const other = new Target()\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), disk)
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target {}\n")
  await initializeReadinessFixture(f, 2)
  const uri = f.uri(`${folder}/Main.ets`)
  f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: {
    textDocument: { uri, languageId: "arkts", version: 1, text: edited } } })
  const params = { textDocument: { uri }, position: positionAt(disk, disk.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first)); assert.equal(first.result.length, 4)
  const repeat = await f.session.request("textDocument/references", params)
  assert.equal(repeat.error, undefined, JSON.stringify(repeat))
  assert.deepEqual(sorted(repeat.result), sorted(first.result))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
  const closed = await f.session.request("textDocument/references", params)
  assert.equal(closed.error, undefined, JSON.stringify(closed)); assert.equal(closed.result.length, 3)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  assert.equal(fs.readFileSync(path.join(sourceRoot, "Main.ets"), "utf8"), disk)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

for (const batchRoots of [1, 1024]) test(`qualified index coverage caches complete compiler searches smaller than membership (batch roots ${batchRoots})`, { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_DEPENDENCY_PROFILE: "identity", ARKTS_REFERENCES_BATCH_ROOTS: String(batchRoots) })
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const main = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  fs.writeFileSync(path.join(sourceRoot, "Use.ts"), 'import { Target } from "./Target"\nexport const other = new Target()\n')
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target {}\n")
  for (let i = 0; i < 12; i++) fs.writeFileSync(path.join(sourceRoot, `Unrelated${i}.ts`), `export class Other${i} {}\n`)
  await initializeReadinessFixture(f, 15)
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(main, main.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first)); assert.equal(first.result.length, 5)
  const completed = f.events().filter(e => e.event === "references.batch.complete")
  assert.ok(completed.some(e => e.programProjectFiles < e.membershipFiles && e.candidateFiles === 3), JSON.stringify(completed))
  const before = f.events().filter(e => e.event === "references.batch.start").length
  const repeat = await f.session.request("textDocument/references", params)
  assert.equal(repeat.error, undefined, JSON.stringify(repeat)); assert.deepEqual(sorted(repeat.result), sorted(first.result))
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 1)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  assert.equal(f.events().filter(e => e.event === "references.batch.start").length, before)
  assert.equal(f.events().find(e => e.event === "references.cache.store")?.coverageScope, "candidates")
  fs.writeFileSync(path.join(sourceRoot, "NewUse.ts"), 'import { Target } from "./Target"\nexport const late = new Target()\n')
  const changed = await f.session.request("textDocument/references", params)
  assert.equal(changed.error, undefined, JSON.stringify(changed)); assert.equal(changed.result.length, 7)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1,
    "a file absent from the original read set invalidates the qualified coverage")
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("different Programs completing the whole scope can combine original evidence for one cache answer", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_STRATEGY: "batched", ARKTS_REFERENCES_BATCH_ROOTS: "1" })
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const main = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  fs.writeFileSync(path.join(sourceRoot, "Use.ts"), 'import { Target } from "./Target"\nexport const other = new Target()\n')
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target {}\n")
  for (let i = 0; i < 2; i++) fs.writeFileSync(path.join(sourceRoot, `Unrelated${i}.ts`), `export class Other${i} {}\n`)
  await initializeReadinessFixture(f, 5)
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(main, main.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first)); assert.equal(first.result.length, 5)
  const completed = f.events().filter(e => e.event === "references.batch.complete")
  assert.ok(completed.length > 1 && new Set(completed.map(e => e.programProjectFiles)).size > 1, JSON.stringify(completed))
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 1)
  const repeat = await f.session.request("textDocument/references", params)
  assert.equal(repeat.error, undefined, JSON.stringify(repeat)); assert.deepEqual(sorted(repeat.result), sorted(first.result))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  assert.equal(f.events().find(e => e.event === "references.cache.store")?.coverageScope, "workspace")
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("skipLibCheck cannot turn an unresolved SDK type in a queried base into a complete cache receipt", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const main = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target extends SdkBase {}\n")
  fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), "declare class SdkBase { unresolved: MissingSdkType }\n")
  await initializeReadinessFixture(f, 2)
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(main, main.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  for (let i = 0; i < 2; i++) {
    const response = await f.session.request("textDocument/references", params)
    assert.equal(response.error, undefined, JSON.stringify(response)); assert.equal(response.result.length, 3)
  }
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 0)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 0)
  assert.ok(f.events().some(e => e.event === "references.proof.refused" && e.reason === "unresolved-type-inputs"))
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("compiler-owned intrinsic scope bindings are not mistaken for unknown SDK types", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const main = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target extends SdkBase {}\n")
  fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), "type Realm = typeof globalThis\ntype Absent = typeof undefined\ndeclare class SdkBase { realm: Realm; absent: Absent }\n")
  await initializeReadinessFixture(f, 2)
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(main, main.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first)); assert.equal(first.result.length, 3)
  const repeat = await f.session.request("textDocument/references", params)
  assert.equal(repeat.error, undefined, JSON.stringify(repeat)); assert.deepEqual(sorted(repeat.result), sorted(first.result))
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 1)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("valid SDK import types retain cache eligibility while their resolved target is proved", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const main = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target extends SdkBase {}\n")
  fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), 'declare class SdkBase { shape: import("./known").Shape }\n')
  fs.writeFileSync(path.join(f.sdk, "ets/component/known.d.ts"), "export interface Shape { value: number }\n")
  await initializeReadinessFixture(f, 2)
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(main, main.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first)); assert.equal(first.result.length, 3)
  const repeat = await f.session.request("textDocument/references", params)
  assert.equal(repeat.error, undefined, JSON.stringify(repeat)); assert.deepEqual(sorted(repeat.result), sorted(first.result))
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 1)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("unreferenced SDK type failures do not poison an independently bound project declaration", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const main = 'import { Target } from "./Target"\nexport const view = new Target()\n'
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  fs.writeFileSync(path.join(sourceRoot, "Target.ts"), "export class Target {}\n")
  fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), 'type UnusedRequest = import("missing-unrelated-module").Request\n')
  await initializeReadinessFixture(f, 2)
  const params = { textDocument: { uri: f.uri(`${folder}/Main.ets`) },
    position: positionAt(main, main.lastIndexOf("Target") + 1), context: { includeDeclaration: true } }
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first)); assert.equal(first.result.length, 3)
  const repeat = await f.session.request("textDocument/references", params)
  assert.equal(repeat.error, undefined, JSON.stringify(repeat)); assert.deepEqual(sorted(repeat.result), sorted(first.result))
  assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 1)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
  const report = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
  assert.equal(report.result.semanticState, "partial")
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})
