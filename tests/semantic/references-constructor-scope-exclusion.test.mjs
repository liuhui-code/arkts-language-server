import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("an empty external module permits fewer constructor batches without losing exact references", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const control = await replay(t, fixture, "batched")
  assert.deepEqual(control.results, legacy.results)
  const enabled = await replay(t, fixture, "batched", { exclusion: true })
  assert.deepEqual(enabled.results, legacy.results)
  for (const result of enabled.results) {
    const locations = result.map(JSON.parse)
    for (const [file, line] of [["Target.ets", 5], ["Target.ets", 7],
      ["Consumer.ets", 1], ["Consumer.ets", 2], ["Derived.ets", 2]]) {
      assert.ok(locations.some(location => location.uri === fixture.uri(file)
        && location.range.start.line === line), `missing known constructor reference ${file}:${line}`)
    }
    assert.ok(!locations.some(location => location.uri === fixture.uri("SameName.ets")))
  }
  const planned = control.events.filter(event => event.event === "references.plan.complete")
    .reduce((total, event) => total + event.batchCount, 0)
  const completed = run => run.events.filter(event => event.event === "references.batch.complete").length
  assert.equal(completed(control), planned)
  assert.equal(completed(enabled), 2,
    "one constructor search per declaration policy must skip the otherwise redundant batches")
  assert.ok(completed(enabled) < completed(control))
  const proofs = enabled.events.filter(event => event.event === "references.constructor-scope.complete")
  assert.equal(proofs.length, 2)
  assert.ok(proofs.every(event => event.excludedFiles === 1 && event.skippedBatches > 0))
})

test("literal-only candidate roots can be omitted while unknown inherited callers still receive exact verification", async (t) => {
  const fixture = createFixture(t)
  fixture.sources["ZData.ets"] = "/* ordinary copyright comment */\n"
    + 'export const label = "new Thing and super are only text";\nexport const count = 42;\n'
  fixture.sources["ZHidden.ets"] = 'import { Child as OtherName } from "./Derived"\n'
    + 'import { count } from "./ZData"\nexport const hidden = new OtherName()\n'
    + "export const observed = count\n"
  for (const file of ["ZData.ets", "ZHidden.ets"]) {
    fs.writeFileSync(path.join(fixture.root, file), fixture.sources[file])
  }
  const legacy = await replay(t, fixture, "legacy")
  const control = await replay(t, fixture, "batched")
  const enabled = await replay(t, fixture, "batched", { exclusion: true })
  assert.deepEqual(control.results, legacy.results)
  assert.deepEqual(enabled.results, legacy.results)
  assert.ok(enabled.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("ZHidden.ets") && location.range.start.line === 2)))
  const completed = run => run.events.filter(event => event.event === "references.batch.complete").length
  assert.equal(completed(control), 10)
  assert.equal(completed(enabled), 6,
    "two source-local negative proofs must remove roots without hiding the unknown caller")
  const replans = enabled.events.filter(event => event.event === "references.constructor-roots.replanned")
  assert.equal(replans.length, 2)
  assert.ok(replans.every(event => event.excludedFiles === 2))
  assert.equal(enabled.events.filter(event => event.event === "references.batch.complete"
    && event.programProjectFiles === 6).length, 2,
  "the excluded literal root remains available as the unknown caller's imported dependency")
})

test("class references cannot reuse a constructor-only negative source proof", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy", { classQuery: true })
  const enabled = await replay(t, fixture, "batched", { exclusion: true, classQuery: true })
  assert.deepEqual(enabled.results, legacy.results)
  assertCompleteBatches(enabled)
})

test("a literal root changed after replanning discards exclusions and restores complete verification", async (t) => {
  const fixture = createFixture(t)
  fixture.sources["ZData.ets"] = "export const value = 42;\n"
  fixture.sources["ZHidden.ets"] = 'import { Child as OtherName } from "./Derived"\n'
    + "export const hidden = new OtherName()\n"
  for (const file of ["ZData.ets", "ZHidden.ets"]) {
    fs.writeFileSync(path.join(fixture.root, file), fixture.sources[file])
  }
  const before = await replay(t, fixture, "legacy", { policies: [false] })
  const { session, logs } = await openFixture(t, fixture, "batched", { exclusion: true, delay: 750 })
  const pending = session.request("textDocument/references", referenceParams(fixture, false), { timeoutMs: 30_000 })
  const replan = await waitForBatch(logs, "references.constructor-roots.replanned")
  assert.equal(replan.excludedFiles, 2)
  fixture.sources["ZData.ets"] = 'import { Child as Leaf } from "./Derived"\n'
    + "export const changed = new Leaf()\n"
  fs.writeFileSync(path.join(fixture.root, "ZData.ets"), fixture.sources["ZData.ets"])
  const response = await pending
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result.map(location => JSON.stringify(location)).sort(), before.results[0])
  await session.close({ timeoutMs: 5_000 })
  const events = readEvents(logs)
  const fallback = events.find(event => event.event === "references.constructor-roots.fallback")
  assert.equal(fallback?.reason, "source-changed")
  const recovery = events.filter(event => event.event === "references.plan.complete").at(-1)
  assert.notEqual(recovery.referenceSession, replan.referenceSession)
  assert.equal(recovery.candidateMode, "conservative")
  const recovered = events.filter(event => event.referenceSession === recovery.referenceSession)
  assert.equal(recovered.filter(event => event.event === "references.batch.complete").length, recovery.batchCount)
  assert.ok(!recovered.some(event => event.event === "references.constructor-roots.replanned"
    || event.event === "references.constructor-scope.complete"))
  const fresh = await replay(t, fixture, "legacy", { policies: [false] })
  assert.ok(fresh.results[0].map(JSON.parse).some(location => location.uri === fixture.uri("ZData.ets")
    && location.range.start.line === 1))
})

test("unsupported empty-module text stays responsive and preserves complete constructor scope", async (t) => {
  const fixture = createFixture(t)
  fixture.sources["ZEmpty.ets"] = `export {}${" ".repeat(262_144)}// unknown trailing syntax\n`
  fs.writeFileSync(path.join(fixture.root, "ZEmpty.ets"), fixture.sources["ZEmpty.ets"])
  const legacy = await replay(t, fixture, "legacy")
  const enabled = await replay(t, fixture, "batched", { exclusion: true })
  assert.deepEqual(enabled.results, legacy.results)
  assertCompleteBatches(enabled)
})

for (const [kind, text] of [
  ["alias-only re-export", 'export { Thing as Alias } from "./Target"\n'],
  ["identifier initializer", 'import { Thing } from "./Target"\nexport const ctor = Thing\n'],
  ["parser recovery", "export const broken = ;\nexport const label = 42;\n"],
  ["JSDoc", "/** @type {Thing} */\nexport const label = 42;\n"],
  ["triple-slash directive", '/// <reference path="./Target.ets" />\nexport const label = 42;\n'],
]) {
  test(`${kind} cannot authorize a constructor root exclusion`, async (t) => {
    const fixture = createFixture(t)
    fixture.sources["ZEmpty.ets"] = text
    fs.writeFileSync(path.join(fixture.root, "ZEmpty.ets"), text)
    const legacy = await replay(t, fixture, "legacy")
    const enabled = await replay(t, fixture, "batched", { exclusion: true })
    assert.deepEqual(enabled.results, legacy.results)
    assertCompleteBatches(enabled)
    assert.ok(!enabled.events.some(event => event.event === "references.constructor-roots.replanned"))
  })
}

test("an unsearched inherited alias call remains inside the complete constructor search", async (t) => {
  const fixture = createFixture(t)
  fixture.sources["ZEmpty.ets"] = 'import { Child as Leaf } from "./Derived"\nexport const hidden = new Leaf()\n'
  fs.writeFileSync(path.join(fixture.root, "ZEmpty.ets"), fixture.sources["ZEmpty.ets"])
  const legacy = await replay(t, fixture, "legacy")
  const enabled = await replay(t, fixture, "batched", { exclusion: true })
  assert.deepEqual(enabled.results, legacy.results)
  assertCompleteBatches(enabled)
  assert.ok(enabled.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("ZEmpty.ets") && location.range.start.line === 1)))
})

test("a new unsaved caller invalidates the previous constructor result without trusting empty disk text", async (t) => {
  const fixture = createFixture(t)
  const afterFirst = session => {
    session.openDocument({ uri: fixture.uri("ZEmpty.ets"), version: 1,
      text: 'import { Child as Leaf } from "./Derived"\nexport const unsaved = new Leaf()\n' })
    session.changeDocument({ uri: fixture.uri("Target.ets"), version: 2,
      text: fixture.sources["Target.ets"] + "// unsaved query comment\n" })
  }
  const legacy = await replay(t, fixture, "legacy", { afterFirst, policies: [false, false, true] })
  const enabled = await replay(t, fixture, "batched", { exclusion: true, afterFirst, policies: [false, false, true] })
  assert.deepEqual(enabled.results, legacy.results)
  assert.ok(!enabled.results[0].map(JSON.parse).some(location => location.uri === fixture.uri("ZEmpty.ets")))
  assert.ok(enabled.results.slice(1).every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("ZEmpty.ets") && location.range.start.line === 1)))
  assert.equal(enabled.events.filter(event => event.event === "references.constructor-scope.complete").length, 1)
  assert.ok(!enabled.events.some(event => event.event === "references.cache.hit"))
})

test("a source changed after scope capture cannot publish a constructor exclusion", async (t) => {
  const fixture = createFixture(t)
  const before = await replay(t, fixture, "legacy")
  const { session, logs } = await openFixture(t, fixture, "batched", { exclusion: true, delay: 750 })
  const pending = session.request("textDocument/references", referenceParams(fixture, false), { timeoutMs: 30_000 })
  await waitForBatch(logs)
  fixture.sources["ZEmpty.ets"] = 'import { Child as Leaf } from "./Derived"\nexport const changed = new Leaf()\n'
  fs.writeFileSync(path.join(fixture.root, "ZEmpty.ets"), fixture.sources["ZEmpty.ets"])
  const response = await pending
  // An unnotified disk edit does not advance DocumentAuthority's revision.
  // Complete fallback may still answer its captured text, but cannot exclude it.
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result.map(location => JSON.stringify(location)).sort(), before.results[0])
  await session.close({ timeoutMs: 5_000 })
  assertCompleteBatches({ events: readEvents(logs) })
  const fresh = await replay(t, fixture, "legacy")
  assert.ok(fresh.results.every(result => result.map(JSON.parse)
    .some(location => location.uri === fixture.uri("ZEmpty.ets") && location.range.start.line === 1)))
})

test("a watched source mutation cancels the captured constructor request instead of publishing old results", async (t) => {
  const fixture = createFixture(t)
  const { session, logs } = await openFixture(t, fixture, "batched", { exclusion: true, delay: 750 })
  const pending = session.request("textDocument/references", referenceParams(fixture, false), { timeoutMs: 30_000 })
  await waitForBatch(logs)
  fixture.sources["ZEmpty.ets"] = 'import { Child as Leaf } from "./Derived"\nexport const changed = new Leaf()\n'
  fs.writeFileSync(path.join(fixture.root, "ZEmpty.ets"), fixture.sources["ZEmpty.ets"])
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: fixture.uri("ZEmpty.ets"), type: 2 }] } })
  const response = await pending
  assert.equal(response.error?.code, -32801, JSON.stringify(response))
  assert.equal(response.result, undefined)
  await session.close({ timeoutMs: 5_000 })
  assert.ok(!readEvents(logs).some(event => event.event === "references.constructor-scope.complete"))
})

test("cancelled constructor verification publishes no partial result and complete recovery stays exact", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const { session, logs } = await openFixture(t, fixture, "batched", { exclusion: true, delay: 750 })
  session.transport.send({ jsonrpc: "2.0", id: 900, method: "textDocument/references",
    params: referenceParams(fixture, false) })
  const batch = await waitForBatch(logs)
  session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 900 } })
  const cancelled = await session.transport.response(900, 10_000)
  assert.equal(cancelled.error?.code, -32800)
  assert.equal(cancelled.result, undefined)
  const results = []
  for (const includeDeclaration of [false, true]) {
    const response = await session.request("textDocument/references", referenceParams(fixture, includeDeclaration),
      { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    results.push(response.result.map(location => JSON.stringify(location)).sort())
  }
  assert.deepEqual(results, legacy.results)
  await session.close({ timeoutMs: 5_000 })
  assert.ok(!readEvents(logs).some(event => event.event === "references.constructor-scope.complete"
    && event.traceId === batch.traceId))
})

test("constructor exclusion remains exact when phase tracing is disabled", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const untraced = await replay(t, fixture, "batched", { exclusion: true, trace: false })
  assert.deepEqual(untraced.results, legacy.results)
  assert.ok(!untraced.events.some(event => event.event === "references.constructor-scope.complete"))
})

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-constructor-scope-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": [
      'import "./Consumer"', 'import "./Derived"', 'import "./SameName"',
      "export class Thing {", "  constructor() {}",
      "  static make() { return new this() }", "}", "export const seed = new Thing()", "",
    ].join("\n"),
    "Consumer.ets": 'import { Thing as Maker } from "./Target"\nexport const use = new Maker()\n',
    "Derived.ets": 'import { Thing } from "./Target"\nexport class Child extends Thing {}\nexport const leaf = new Child()\n',
    "SameName.ets": "export class Thing { constructor() {} }\nexport const other = new Thing()\n",
    "ZEmpty.ets": " \t export { } ;\r\n",
  }
  for (const [file, text] of Object.entries(sources)) fs.writeFileSync(path.join(root, file), text)
  return { root, sources, uri: file => pathToFileURL(path.join(root, file)).href, run: 0 }
}

async function replay(t, fixture, strategy, {
  exclusion = false, classQuery = false, afterFirst, policies = [false, true], trace = true,
} = {}) {
  const { session, logs } = await openFixture(t, fixture, strategy, { exclusion, trace })
  const results = []
  for (const includeDeclaration of policies) {
    const params = referenceParams(fixture, includeDeclaration)
    if (classQuery) params.position = { line: 3, character: 14 }
    const response = await session.request("textDocument/references", params, { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    results.push(response.result.map(location => JSON.stringify(location)).sort())
    if (results.length === 1) await afterFirst?.(session)
  }
  await session.close({ timeoutMs: 5_000 })
  return { results, events: readEvents(logs) }
}

async function openFixture(t, fixture, strategy, { exclusion = false, trace = true, delay = 0 } = {}) {
  const { root, sources, uri } = fixture
  const run = `${strategy}-${exclusion}-${++fixture.run}`
  const logs = path.join(root, `${run}-logs`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(root).href,
    capabilities: { window: { workDoneProgress: true } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, `${run}-cache`),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
      ARKTS_LSP_LOG_DIR: logs, ARKTS_REFERENCES_STRATEGY: strategy,
      ARKTS_REFERENCES_BATCH_ROOTS: "1", ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
      ARKTS_REFERENCES_CONSTRUCTOR_SCOPE: exclusion ? "1" : "0",
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: String(delay),
      ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "0", ARKTS_REFERENCES_ANCHOR_REUSE: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS: "0",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: sources["Target.ets"] })
  session.openDocument({ uri: uri("Consumer.ets"), version: 1,
    text: sources["Consumer.ets"] + "export const unsaved = new Maker()\n" })
  return { session, logs }
}

function referenceParams(fixture, includeDeclaration) {
  return { textDocument: { uri: fixture.uri("Target.ets") }, position: { line: 7, character: 27 },
    context: { includeDeclaration } }
}

function readEvents(logs) {
  return fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
}

async function waitForBatch(logs, eventName = "references.batch.start") {
  const deadline = performance.now() + 10_000
  while (performance.now() < deadline) {
    if (fs.existsSync(path.join(logs, "server.log"))) {
      const batch = readEvents(logs).find(event => event.event === eventName)
      if (batch) return batch
    }
    await new Promise(resolve => setTimeout(resolve, 2))
  }
  throw new Error(`references did not emit ${eventName}`)
}

function assertCompleteBatches(run) {
  assert.ok(!run.events.some(event => event.event === "references.constructor-scope.complete"))
  const planned = run.events.filter(event => event.event === "references.plan.complete")
    .reduce((count, event) => count + event.batchCount, 0)
  assert.equal(run.events.filter(event => event.event === "references.batch.complete").length, planned)
}
