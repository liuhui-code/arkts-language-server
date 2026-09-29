import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("one exact full-Program constructor search avoids remaining redundant batches", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const batched = await replay(t, fixture, "batched")
  assert.deepEqual(batched.results, legacy.results)
  assertKnownReferences(fixture, batched.results)
  const plans = batched.events.filter(event => event.event === "references.plan.complete")
  assert.equal(plans.length, 2)
  assert.ok(plans.every(event => event.batchCount > 1), "must plan multiple genuine batches")
  const completed = batched.events.filter(event => event.event === "references.batch.complete")
  assert.equal(completed.length, 2, "one compiler search per declaration policy is sufficient")
  const coverage = batched.events.filter(event => event.event === "references.search-scope.complete")
  assert.equal(coverage.length, 2)
  assert.ok(coverage.every(event => event.skippedBatches > 0))
})

test("an unsearched legal file prevents early completion and keeps inherited alias calls", async (t) => {
  const fixture = createFixture(t, { disconnected: true })
  const legacy = await replay(t, fixture, "legacy")
  const batched = await replay(t, fixture, "batched")
  assert.deepEqual(batched.results, legacy.results)
  assertKnownReferences(fixture, batched.results)
  for (const result of batched.results) {
    assert.ok(result.map(JSON.parse).some(location => location.uri === fixture.uri("ZHidden.ets")
      && location.range.start.line === 1), "do not omit a disconnected inherited constructor call")
  }
  const completed = batched.events.filter(event => event.event === "references.batch.complete")
  const plans = batched.events.filter(event => event.event === "references.plan.complete")
  assert.equal(completed.length, plans.reduce((count, plan) => count + plan.batchCount, 0))
  assert.ok(batched.events.filter(event => event.event === "references.search-scope.complete")
    .every(event => event.skippedBatches === 0))
})

test("a zero-definition response is not proof of a completed full-scope search", async (t) => {
  const fixture = createFixture(t)
  const { results, events } = await replay(t, fixture, "batched", { noAnchor: true })
  assert.deepEqual(results, [[], []])
  assert.ok(!events.some(event => event.event === "references.search-scope.complete"))
  const completed = events.filter(event => event.event === "references.batch.complete")
  const plans = events.filter(event => event.event === "references.plan.complete")
  assert.equal(completed.length, plans.reduce((count, plan) => count + plan.batchCount, 0))
})

test("full-scope completion survives rejected class seeds and does not depend on tracing", async (t) => {
  const fixture = createFixture(t)
  const legacy = await replay(t, fixture, "legacy")
  const seeded = await replay(t, fixture, "indexed-batched", { localSeed: true })
  assert.deepEqual(seeded.results, legacy.results)
  assert.ok(seeded.events.some(event => event.event === "references.anchor.seed.rejected"))
  assert.ok(seeded.events.some(event => event.event === "references.search-scope.complete"
    && event.skippedBatches > 0))
  const untraced = await replay(t, fixture, "batched", { trace: false })
  assert.deepEqual(untraced.results, legacy.results)
  assert.ok(!untraced.events.some(event => event.event === "references.search-scope.complete"))
})

function createFixture(t, { disconnected = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-coverage-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sources = {
    "Target.ets": [
      'import "./Consumer"', 'import "./Derived"', 'import "./SameName"',
      "export class Thing {", "  constructor() {}",
      "  static make() { return new this() }", "}",
      "export const seed = new Thing()", "",
    ].join("\n"),
    "Consumer.ets": 'import { Thing as Maker } from "./Target"\nexport const use = new Maker()\n',
    "Derived.ets": 'import { Thing } from "./Target"\nexport class Child extends Thing {}\nexport const leaf = new Child()\n',
    "SameName.ets": "export class Thing { constructor() {} }\nexport const other = new Thing()\n",
  }
  if (disconnected) sources["ZHidden.ets"] =
    'import { Child as Leaf } from "./Derived"\nexport const hidden = new Leaf()\n'
  for (const [file, text] of Object.entries(sources)) fs.writeFileSync(path.join(root, file), text)
  return { root, sources, uri: file => pathToFileURL(path.join(root, file)).href }
}

async function replay(t, fixture, strategy, { noAnchor = false, localSeed = false, trace = true } = {}) {
  const { root, sources, uri } = fixture
  const runId = `${strategy}-${localSeed}-${trace}`
  const logs = path.join(root, `${runId}-logs`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(root).href,
    capabilities: { window: { workDoneProgress: true } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, `${runId}-cache`),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
      ARKTS_LSP_LOG_DIR: logs, ARKTS_REFERENCES_STRATEGY: strategy,
      ARKTS_REFERENCES_BATCH_ROOTS: "1", ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
      ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: localSeed ? "1" : "0", ARKTS_REFERENCES_ANCHOR_REUSE: "0",
      ARKTS_REFERENCES_CONSERVATIVE_SEMANTIC_UNITS: "0",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: sources["Target.ets"] })
  const overlay = sources["Consumer.ets"] + "export const unsaved = new Maker()\n"
  session.openDocument({ uri: uri("Consumer.ets"), version: 1, text: overlay })
  const results = []
  for (const includeDeclaration of [false, true]) {
    const response = await session.request("textDocument/references", {
      textDocument: { uri: uri("Target.ets") },
      position: positionAt(sources["Target.ets"], noAnchor ? sources["Target.ets"].length
        : sources["Target.ets"].lastIndexOf("Thing") + 1),
      context: { includeDeclaration },
    }, { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    results.push(response.result.map(location => JSON.stringify(location)).sort())
  }
  await session.close({ timeoutMs: 5_000 })
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  return { results, events }
}

function assertKnownReferences(fixture, results) {
  for (const result of results) {
    const locations = result.map(value => JSON.parse(value))
    for (const [file, line] of [["Target.ets", 5], ["Target.ets", 7],
      ["Consumer.ets", 1], ["Consumer.ets", 2], ["Derived.ets", 2]]) {
      assert.ok(locations.some(location => location.uri === fixture.uri(file)
        && location.range.start.line === line), `missing known reference ${file}:${line}`)
    }
    assert.ok(!locations.some(location => location.uri === fixture.uri("SameName.ets")))
  }
}

function positionAt(text, offset) {
  const prefix = text.slice(0, offset).split("\n")
  return { line: prefix.length - 1, character: prefix.at(-1).length }
}
