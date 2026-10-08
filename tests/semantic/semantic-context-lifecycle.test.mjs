import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { runInNewContext } from "node:vm"
import { transformSync } from "esbuild"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("compiler trace collector failure preserves a completed semantic result", () => {
  const sourcePath = path.join(projectRoot, "src/core/types/compiler-query-timing.ts")
  const compiled = transformSync(fs.readFileSync(sourcePath, "utf8"),
    { loader: "ts", format: "cjs", target: "node20" }).code
  const module = { exports: {} }
  const require = createRequire(sourcePath)
  runInNewContext(compiled, { module, exports: module.exports, require, performance, process })
  const dotting = require("typescript").PerformanceDotting
  const original = dotting.getEventData
  try {
    dotting.getEventData = () => { throw new Error("collector failed after query") }
    let queries = 0
    const observed = module.exports.traceCompilerQuery(() => { queries++; return "exact" }, true)
    assert.equal(observed.result, "exact")
    assert.equal(queries, 1)
    assert.equal(observed.timing.collectorAvailable, false)
    assert.equal(observed.timing.createProgramMs, null)
    assert.equal(observed.timing.createProgramEvents, null)
  } finally {
    dotting.getEventData = original
  }
  const originalClear = dotting.clearEvent
  try {
    dotting.clearEvent = () => { throw new Error("collector setup or cleanup failed") }
    const observed = module.exports.traceCompilerQuery(() => "exact", true)
    assert.equal(observed.result, "exact")
    assert.equal(observed.timing.collectorAvailable, false)
    assert.equal(observed.timing.createProgramMs, null)
    assert.throws(() => module.exports.traceCompilerQuery(() => {
      throw new Error("semantic query failed")
    }, true), /semantic query failed/)
  } finally {
    dotting.clearEvent = originalClear
  }
})

test("interactive definitions stay exact across overlays, disk changes, SDK change and eviction", async t => {
  const run = await replay(t, { trace: true })
  assert.equal(run.results.length, 7)
  assert.ok(run.diagnostics.every(message => message.params.diagnostics.length === 0))
})

test("opt-in context trace distinguishes local LS reuse from conservative resets and pressure eviction", async t => {
  const run = await replay(t, { trace: true })
  const lifecycle = run.events.filter(entry => entry.event.startsWith("semantic.context."))
  const creates = lifecycle.filter(entry => entry.event === "semantic.context.create")
  assert.equal(creates.length, 4, "trace must identify each actual context/LS construction")
  assert.equal(new Set(creates.map(entry => entry.contextSequence)).size, 4)
  const firstSequence = creates[0].contextSequence
  for (const step of ["first", "unchanged", "overlay-comment"]) {
    const checkpoint = run.checkpoints.find(entry => entry.step === step)
    const active = checkpoint.events.filter(entry => entry.event === "semantic.context.reuse").at(-1)
    assert.equal(active?.contextSequence, firstSequence, `${step} should keep the existing LS`)
  }
  const evictions = lifecycle.filter(entry => entry.event === "semantic.context.evict")
  assert.deepEqual(evictions.map(entry => entry.reason), [
    "content-revision-change", "sdk-configuration", "memory-level3",
  ])
  assert.equal(run.events.filter(entry => entry.event === "sdk.selected").length, creates.length)
  assert.ok(evictions.every(entry => entry.leaseCount === 0 && entry.residentContextCount === 0))
  assert.ok(lifecycle.every(entry => Number.isSafeInteger(entry.rss) && entry.rss > 0
    && Number.isSafeInteger(entry.heapUsed) && entry.heapUsed > 0
    && /^\d+$/.test(entry.monotonicNs)))
  assert.ok(!lifecycle.some(entry => "source" in entry || "contextId" in entry || "programReused" in entry))
})

test("the reference dispose profile has its own observable reason without changing exact results", async t => {
  const run = await replay(t, { trace: true, global: true })
  assert.ok(run.events.some(entry => entry.event === "semantic.context.evict"
    && entry.reason === "reference-dispose" && entry.leaseCount === 0))
  assert.ok(run.events.some(entry => entry.event === "references.batch.complete"
    && entry.verifierIsolation === "transient-worker"))
})

test("disabled lifecycle tracing preserves exact navigation without lifecycle observations", async t => {
  const traced = await replay(t, { trace: true, global: true })
  const plain = await replay(t, { trace: false, global: true })
  assert.deepEqual(plain.normalizedResults, traced.normalizedResults)
  assert.ok(traced.events.some(entry => entry.event === "semantic.prepare.complete"
    && Number.isFinite(entry.durationMs) && entry.durationMs >= 0))
  assert.equal(plain.events.some(entry => entry.event === "semantic.prepare.complete"), false)
  assert.ok(traced.events.some(entry => entry.event === "semantic.definition.complete"
    && Number.isFinite(entry.durationMs) && entry.programSourceFiles > 0))
  assert.ok(traced.events.filter(entry => entry.event === "semantic.definition.complete")
    .every(entry => Number.isFinite(entry.createProgramMs) && entry.createProgramMs >= 0
      && Number.isSafeInteger(entry.createProgramEvents) && entry.createProgramEvents >= 0
      && Number.isFinite(entry.otherDefinitionMs) && entry.otherDefinitionMs >= 0))
  assert.ok(traced.events.some(entry => entry.event === "semantic.definition.complete"
    && entry.createProgramEvents > 0 && entry.createProgramMs > 0))
  assert.equal(plain.events.some(entry => entry.event === "semantic.definition.complete"), false)
  assert.equal(plain.events.some(entry => entry.event.startsWith("semantic.context.")), false)
  assert.equal(plain.events.filter(entry => entry.event === "sdk.selected").length,
    traced.events.filter(entry => entry.event === "sdk.selected").length)
  assert.ok(plain.diagnostics.every(message => message.params.diagnostics.length === 0))
})

test("legacy references trace post-query Program identity for a new symbol without changing results", async t => {
  const traced = await replay(t, { trace: true, global: true, referenceTraceProbe: true })
  const plain = await replay(t, { trace: false, global: true, referenceTraceProbe: true })
  assert.deepEqual(plain.referenceResults, traced.referenceResults)
  const observed = traced.events.filter(entry => entry.event === "semantic.references.complete")
  assert.equal(observed.length, 2)
  assert.ok(observed.every(entry => entry.programSequence > 0
    && entry.programSourceFiles > 0 && entry.programProjectFiles > 0
    && Number.isFinite(entry.durationMs) && entry.durationMs >= 0
    && Number.isFinite(entry.createProgramMs) && entry.createProgramMs >= 0
    && Number.isSafeInteger(entry.createProgramEvents) && entry.createProgramEvents >= 0
    && Number.isFinite(entry.otherReferenceMs) && entry.otherReferenceMs >= 0))
  assert.equal(observed[1].programSequence, observed[0].programSequence)
  assert.ok(observed.every(entry => Number.isSafeInteger(entry.checkerSequence) && entry.checkerSequence > 0))
  // The real Settings trace shows distinct post-query checkers for one Program.
  assert.equal(plain.events.some(entry => entry.event === "semantic.references.complete"), false)
  assert.ok(plain.diagnostics.every(message => message.params.diagnostics.length === 0))
})

test("experimental disk deltas keep a compatible LS while definitions move to the new UTF-16 range", async t => {
  const run = await replay(t, { trace: true, sessionReuse: "experimental", diskIterations: 100 })
  const creates = run.events.filter(entry => entry.event === "semantic.context.create")
  assert.equal(creates.length, 3, "a complete ordinary disk delta must not reconstruct the LS")
  const first = run.checkpoints.find(entry => entry.step === "first").events
    .filter(entry => entry.event === "semantic.context.reuse").at(-1)
  const edited = run.checkpoints.find(entry => entry.step === "disk-comment").events
    .filter(entry => entry.event === "semantic.context.reuse").at(-1)
  assert.equal(edited?.contextSequence, first?.contextSequence)
  const programAt = step => run.checkpoints.find(entry => entry.step === step).events
    .find(entry => entry.event === "semantic.definition.complete")?.programSequence
  assert.ok(Number.isSafeInteger(programAt("first")) && programAt("first") > 0)
  assert.equal(programAt("unchanged"), programAt("first"),
    "an unchanged request should observe the same compiler Program")
  assert.notEqual(programAt("disk-comment"), programAt("first"),
    "retaining a Language Service after a disk edit must not be mislabeled Program reuse")
  assert.deepEqual(run.events.filter(entry => entry.event === "semantic.context.evict")
    .map(entry => entry.reason), ["sdk-configuration", "memory-level3"])
  assert.ok(run.diagnostics.every(message => message.params.diagnostics.length === 0))
})

test("traced definitions expose compiler SourceFile identity reuse across an ordinary disk edit", async t => {
  const run = await replay(t, { trace: true, sessionReuse: "experimental" })
  const observed = step => run.checkpoints.find(entry => entry.step === step).events
    .find(entry => entry.event === "semantic.definition.complete")
  const unchanged = observed("unchanged"), edited = observed("disk-comment")
  for (const entry of [unchanged, edited]) {
    assert.ok(entry.sdkSourceFiles > 0 && entry.programProjectFiles > 0)
    assert.equal(entry.sdkSourceFilesReused + entry.sdkSourceFilesFirstObserved,
      entry.sdkSourceFiles)
    assert.equal(entry.projectSourceFilesReused + entry.projectSourceFilesFirstObserved,
      entry.programProjectFiles)
  }
  assert.equal(unchanged.sdkSourceFilesReused, unchanged.sdkSourceFiles)
  assert.equal(unchanged.projectSourceFilesReused, unchanged.programProjectFiles)
  assert.equal(edited.sdkSourceFilesReused, edited.sdkSourceFiles)
  assert.ok(edited.projectSourceFilesReused > 0,
    "an ordinary disk edit should not require every project SourceFile to be replaced")
  assert.ok(edited.projectSourceFilesFirstObserved > 0,
    "the edited SourceFile must be observed under a new compiler identity")
})

test("compatible disk reuse refreshes compiler types and normal versioned diagnostics", async t => {
  const reused = await replay(t, { trace: true, sessionReuse: "experimental", typeEdits: true })
  const baseline = await replay(t, { trace: true, sessionReuse: "off", typeEdits: true })
  assert.deepEqual(reused.normalizedResults, baseline.normalizedResults)
  for (const run of [reused, baseline]) {
    assert.ok(run.diagnostics.find(message => message.params.version === 3)
      .params.diagnostics.some(diagnostic => diagnostic.code === 2322))
    assert.deepEqual(run.diagnostics.find(message => message.params.version === 4).params.diagnostics, [])
  }
  assert.equal(reused.events.filter(entry => entry.event === "semantic.context.create").length, 3)
  assert.equal(baseline.events.filter(entry => entry.event === "semantic.context.create").length, 6)
})

test("an undelivered compiler dependency must reset rather than reuse a stale source version", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-session-undelivered-"))
  const workspace = path.join(root, "workspace"), sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  const targetPath = path.join(workspace, "Types.d.ts"), targetUri = pathToFileURL(targetPath).href
  let target = "interface KnownThing { value: number }\n"
  let query = '/// <reference path="./Types.d.ts" />\nexport const value: KnownThing = { value: 1 }\n'
  const queryPath = path.join(workspace, "Query.ts"), queryUri = pathToFileURL(queryPath).href
  fs.writeFileSync(targetPath, target)
  fs.writeFileSync(queryPath, query)
  const logs = path.join(root, "logs")
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"), ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_STRATEGY: "batched",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "dispose", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_REFERENCES_ANCHOR_REUSE: "0", ARKTS_SEMANTIC_SESSION_REUSE: "experimental",
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
  const catalog = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: catalog.id, result: null })
  await session.transport.progress(catalog.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: queryUri, languageId: "typescript", version: 1, text: query })
  assert.deepEqual((await diagnostic(1)).params.diagnostics, [])
  const references = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position: rangeOf(query, "KnownThing").start,
    context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  assert.equal(references.error, undefined, JSON.stringify(references.error))
  assert.deepEqual(references.result.map(value => JSON.stringify(value)).sort(), [
    { uri: targetUri, range: rangeOf(target, "KnownThing") },
    { uri: queryUri, range: rangeOf(query, "KnownThing") },
  ].map(value => JSON.stringify(value)).sort())
  await define()
  const before = events().length
  target = "// changed dependency 😀\n" + target
  fs.writeFileSync(targetPath, target)
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: targetUri, type: 2 }] } })
  await define()
  assert.ok(events().slice(before).some(entry => entry.event === "semantic.context.evict"
    && entry.reason === "content-revision-change"), "undelivered source text cannot certify reuse")
  query = "// normal diagnostic publication 😀\n" + query
  session.changeDocument({ uri: queryUri, version: 2, text: query })
  assert.deepEqual((await diagnostic(2)).params.diagnostics, [])
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })

  async function define() {
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: queryUri }, position: rangeOf(query, "KnownThing").start,
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual(response.result, [{ uri: targetUri, range: rangeOf(target, "KnownThing") }])
  }
  function diagnostic(version) {
    return session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === queryUri && message.params.version === version, 20_000)
  }
  function events() {
    return fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
  }
})

for (const sessionReuse of ["off", "experimental"]) {
  for (const order of ["known-first", "deleted-first", "deleted-consumed-first", "deleted-only"]) {
    test(`unknown deletion fences disk reuse: ${sessionReuse}/${order}`,
      async t => replayUnknownDeletion(t, sessionReuse, order))
  }
}

async function replayUnknownDeletion(t, sessionReuse, order) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-session-combined-delta-"))
  const workspace = path.join(root, "workspace"), sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  const targetPath = path.join(workspace, "Types.d.ts"), targetUri = pathToFileURL(targetPath).href
  const target = "interface KnownThing { value: number }\n"
  const otherPath = path.join(workspace, "Other.ts"), otherUri = pathToFileURL(otherPath).href
  const queryPath = path.join(workspace, "Query.ts"), queryUri = pathToFileURL(queryPath).href
  let query = '/// <reference path="./Types.d.ts" />\nimport { other } from "./Other"\n'
    + "export const value: KnownThing = { value: other }\n"
  fs.writeFileSync(targetPath, target)
  fs.writeFileSync(otherPath, "export const other = 1\n")
  fs.writeFileSync(queryPath, query)
  const logs = path.join(root, "logs")
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"), ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "dispose", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_REFERENCES_ANCHOR_REUSE: "0", ARKTS_SEMANTIC_SESSION_REUSE: sessionReuse,
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
  const catalog = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: catalog.id, result: null })
  await session.transport.progress(catalog.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: queryUri, languageId: "typescript", version: 1, text: query })
  assert.deepEqual((await diagnostic(1)).params.diagnostics, [])
  assert.deepEqual(await define(), [{ uri: targetUri, range: rangeOf(target, "KnownThing") }])
  const before = events().length
  if (order === "known-first") changeKnown()
  fs.unlinkSync(targetPath)
  watched(targetUri, 3)
  if (order === "deleted-consumed-first") {
    assert.deepEqual(await define(), [])
    assertReset()
  }
  if (order === "deleted-first" || order === "deleted-consumed-first") changeKnown()
  assert.deepEqual(await define(), [], "deletion cannot retain the compiler-only declaration")
  assertReset()
  query = "// publish current missing type 😀\n" + query
  session.changeDocument({ uri: queryUri, version: 2, text: query })
  const missing = await diagnostic(2)
  assert.deepEqual(missing.params.diagnostics.filter(value => value.code === 2304)
    .map(value => value.range), [rangeOf(query, "KnownThing")])
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })

  async function define() {
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: queryUri }, position: rangeOf(query, "KnownThing").start,
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return response.result ?? []
  }
  function watched(uri, type) {
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri, type }] } })
  }
  function changeKnown() {
    fs.writeFileSync(otherPath, "export const other = 2\n")
    watched(otherUri, 2)
  }
  function assertReset() {
    assert.ok(events().slice(before).some(entry => entry.event === "semantic.context.evict"
      && entry.reason === "content-revision-change"), "unsupported batch must durably fence reuse")
  }
  function diagnostic(version) {
    return session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === queryUri && message.params.version === version, 20_000)
  }
  function events() {
    return fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
  }
}

async function replay(t, { trace, global = false, referenceTraceProbe = false,
  sessionReuse = "off", typeEdits = false, diskIterations = 1 }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-context-lifecycle-"))
  const workspace = path.join(root, "workspace")
  fs.mkdirSync(workspace)
  const sdk = name => {
    const directory = path.join(root, name)
    fs.mkdirSync(path.join(directory, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(directory, "toolchains"))
    fs.writeFileSync(path.join(directory, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    return directory
  }
  const sdkA = sdk("sdk-a"), sdkB = sdk("sdk-b")
  const targetPath = path.join(workspace, "Target.ets")
  const targetUri = pathToFileURL(targetPath).href
  let target = "const face = '😀'\nexport class ObservedThing {}\n"
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  let query = 'import { ObservedThing } from "./Target"\nexport const value = new ObservedThing()\n'
  fs.writeFileSync(targetPath, target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  const logs = path.join(root, "logs")
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdkA, DEVECO_SDK_HOME: sdkA,
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"), ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: trace ? "1" : "0",
      ARKTS_REFERENCES_STRATEGY: referenceTraceProbe ? "legacy" : "indexed-batched",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "dispose", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_REFERENCES_ANCHOR_REUSE: "0", ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_SEMANTIC_SESSION_REUSE: sessionReuse,
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdkA } } })
  const catalog = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: catalog.id, result: null })
  await session.transport.progress(catalog.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: queryUri, version: 1, text: query })
  const diagnostics = [await diagnostic(1)]
  const results = [], checkpoints = [], referenceResults = []
  async function define(step) {
    const before = events().length
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: queryUri }, position: positionAt(query, query.lastIndexOf("ObservedThing") + 1),
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual(response.result, [{ uri: targetUri, range: rangeOf(target, "ObservedThing") }])
    results.push(response.result)
    checkpoints.push({ step, events: events().slice(before) })
  }
  function events() {
    return fs.readFileSync(path.join(logs, "server.log"), "utf8").split("\n").filter(Boolean).map(JSON.parse)
  }
  function diagnostic(version) {
    return session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === queryUri && message.params.version === version, 20_000)
  }
  await define("first")
  await define("unchanged")
  query = "// unsaved comment 😀\n" + query
  session.changeDocument({ uri: queryUri, version: 2, text: query })
  await define("overlay-comment")
  diagnostics.push(await diagnostic(2))
  if (global) {
    const references = await session.request("textDocument/references", {
      textDocument: { uri: queryUri }, position: positionAt(query, query.lastIndexOf("ObservedThing") + 1),
      context: { includeDeclaration: true },
    }, { timeoutMs: 20_000 })
    assert.equal(references.error, undefined, JSON.stringify(references.error))
    const expected = [{ uri: targetUri, range: rangeOf(target, "ObservedThing") },
      ...[query.indexOf("ObservedThing"), query.lastIndexOf("ObservedThing")].map(offset => ({
        uri: queryUri, range: { start: positionAt(query, offset), end: positionAt(query, offset + 13) },
      }))]
    assert.deepEqual(references.result.map(value => JSON.stringify(value)).sort(),
      expected.map(value => JSON.stringify(value)).sort())
    referenceResults.push(references.result)
    if (referenceTraceProbe) {
      const next = await session.request("textDocument/references", {
        textDocument: { uri: queryUri }, position: positionAt(query, query.indexOf("value") + 1),
        context: { includeDeclaration: true },
      }, { timeoutMs: 20_000 })
      assert.equal(next.error, undefined, JSON.stringify(next.error))
      assert.deepEqual(next.result, [{ uri: queryUri, range: rangeOf(query, "value") }])
      referenceResults.push(next.result)
    }
    await define("after-references")
  }
  for (let index = 0; index < diskIterations; index++) {
    target = `// disk comment ${index} 😀\n` + target
    fs.writeFileSync(targetPath, target)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: targetUri, type: 2 }] } })
    await define(index === 0 ? "disk-comment" : `disk-comment-${index}`)
  }
  if (typeEdits) {
    target = target.replace("ObservedThing {}", 'ObservedThing { value: string = "changed" }')
    fs.writeFileSync(targetPath, target)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: targetUri, type: 2 }] } })
    query = 'import { ObservedThing } from "./Target"\nexport const mismatch: number = new ObservedThing().value\n'
    session.changeDocument({ uri: queryUri, version: 3, text: query })
    await define("disk-type-error")
    diagnostics.push(await diagnostic(3))
    target = target.replace('value: string = "changed"', "value: number = 1")
    fs.writeFileSync(targetPath, target)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: targetUri, type: 2 }] } })
    query = "// diagnostics after repair 😀\n" + query
    session.changeDocument({ uri: queryUri, version: 4, text: query })
    await define("disk-type-repaired")
    diagnostics.push(await diagnostic(4))
  }
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: sdkB } } } } })
  await define("sdk-change")
  const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
  assert.deepEqual(pressure.result, { applied: "level3" })
  await define("after-eviction")
  await define("unchanged-after-eviction")
  await session.close({ timeoutMs: 5_000 })
  const normalize = locations => locations.map(location => ({
    ...location, uri: path.relative(workspace, fileURLToPath(location.uri)).split(path.sep).join("/"),
  }))
  return { results, normalizedResults: results.map(normalize),
    referenceResults: referenceResults.map(normalize), diagnostics, checkpoints, events: events() }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1, character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeOf(source, name) {
  const start = source.indexOf(name)
  return { start: positionAt(source, start), end: positionAt(source, start + name.length) }
}
