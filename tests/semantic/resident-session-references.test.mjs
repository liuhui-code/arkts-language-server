import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

const selectedL03Policy = {
  ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware",
  ARKTS_L03_COST_AWARE_EVICTION: "1",
  ARKTS_L01_PRESSURE_ADMISSION: "1",
  ARKTS_L01_TRANSIENT_DIAGNOSTICS: "1",
  ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0",
  ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
}

test("default optimization policy reuses complete references without benchmark opt-in",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, {
      ARKTS_BENCHMARK_CONTROL: "0",
      ARKTS_REFERENCES_CONTEXT_RETENTION: undefined,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
      ARKTS_L02_SAME_CONTENT_PROMOTION: undefined,
      ARKTS_L01_PRESSURE_ADMISSION: undefined,
      ARKTS_L03_COST_AWARE_EVICTION: undefined,
      ARKTS_L01_TRANSIENT_DIAGNOSTICS: undefined,
    })
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const events = readEvents(fixture)
    const hits = events.filter(event => event.event === "references.resident.hit")
    assert.equal(hits.length, 2, "both declaration policies must use complete resident coverage by default")
    assert.ok(hits.every(event => event.sameProgram && event.completeScope
      && event.programBuilds === 0 && event.verifierWorkerStarts === 0))
    const promotions = events.filter(event => event.event === "semantic.prepare.script-admission"
      && event.promotedWithMatchingFingerprint > 0)
    assert.ok(promotions.length > 0)
    assert.ok(promotions.every(event => event.generationAfter === event.generationBefore))
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.equal(pressure.error?.code, -32601, "production defaults must not expose benchmark controls")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("explicit optimization opt-out preserves complete indexed fallback without benchmark controls",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_CONTEXT_RETENTION: "dispose",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_L02_SAME_CONTENT_PROMOTION: "0",
      ARKTS_L01_PRESSURE_ADMISSION: "0", ARKTS_L03_COST_AWARE_EVICTION: "0",
      ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0",
    })
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const events = readEvents(fixture)
    assert.ok(!events.some(event => event.event === "references.resident.hit"))
    assert.ok(events.some(event => event.event === "references.batch.start"))
    const promotions = events.filter(event => event.event === "semantic.prepare.script-admission"
      && event.promotedWithMatchingFingerprint > 0)
    assert.ok(promotions.some(event => event.generationAfter > event.generationBefore))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L04 selected L03 policy keeps new references, edits and eviction fallback exact",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, selectedL03Policy)
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const initial = readEvents(fixture)
    const hits = initial.filter(event => event.event === "references.resident.hit")
    assert.equal(hits.length, 2)
    assert.ok(hits.every(event => event.sameProgram && event.completeScope
      && event.programBuilds === 0 && event.verifierWorkerStarts === 0))
    assert.ok(!initial.some(event => event.event === "references.cache.hit"
      || event.event === "references.batch.start"))
    for (const [version, text, codes] of [
      [2, `// edited 😀\n${fixture.sources["Use.ets"]}`
        + 'export const again = new TargetThing()\nexport const broken: number = "wrong"\n', [2322]],
      [3, `// removed 😀\n${fixture.sources["Use.ets"]}`, []],
    ]) {
      session.changeDocument({ uri: fixture.uri("Use.ets"), version, text })
      await assertReferences(session, fixture, text)
      const diagnostics = (await diagnostic(session, fixture.uri("Use.ets"), version)).params.diagnostics
      assert.deepEqual(diagnostics.map(item => item.code), codes)
      if (codes.length) assert.deepEqual(diagnostics[0].range,
        location(fixture, "Use.ets", text, text.indexOf("broken"), "broken").range)
    }
    const before = readEvents(fixture).length
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(fixture, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    await assertReferences(session, fixture, `// removed 😀\n${fixture.sources["Use.ets"]}`)
    const recovery = readEvents(fixture).slice(before)
    assert.ok(recovery.some(event => event.event === "references.resident.miss"))
    assert.ok(recovery.some(event => event.event === "references.batch.start"))
    assert.ok(!recovery.some(event => event.event === "references.cache.hit"
      || event.event === "semantic.worker.pressure-recycle.complete"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

for (const [name, options] of [["alias/re-export", { aliases: true }],
  ["unopened native struct", { nativeStruct: true }]]) {
  test(`L04 selected policy preserves ${name} references against a complete legacy oracle`,
    { timeout: 60_000 }, async t => {
      const fixture = createFixture(t, options)
      const legacy = await startSession(t, fixture, {
        ...selectedL03Policy, ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      })
      await warmAndPromote(legacy, fixture)
      const expected = await referenceResults(legacy, fixture)
      assert.deepEqual((await legacy.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      const resident = await startSession(t, fixture, selectedL03Policy)
      await warmAndPromote(resident, fixture)
      assert.deepEqual(await referenceResults(resident, fixture), expected)
      assert.deepEqual((await resident.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      const events = readEvents(fixture)
      assert.equal(events.filter(event => event.event === "references.resident.hit").length, 2)
      assert.ok(!events.some(event => event.event === "references.batch.start"
        || event.event === "references.cache.hit"))
    })
}

test("L04 selected policy keeps references and latest diagnostics exact with compiler tracing disabled",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" })
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const text = fixture.sources["Use.ets"]
      + 'export const again = new TargetThing()\nexport const broken: number = "wrong"\n'
    session.changeDocument({ uri: fixture.uri("Use.ets"), version: 2, text })
    await assertReferences(session, fixture, text)
    const diagnostics = (await diagnostic(session, fixture.uri("Use.ets"), 2)).params.diagnostics
    assert.deepEqual(diagnostics.map(item => item.code), [2322])
    assert.deepEqual(diagnostics[0].range,
      location(fixture, "Use.ets", text, text.indexOf("broken"), "broken").range)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a promoted full resident session answers a new reference symbol with both declaration policies",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture)
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    const events = readEvents(fixture)
    const promotions = events.filter(event => event.event === "semantic.prepare.script-admission"
      && event.promotedWithMatchingFingerprint > 0)
    assert.ok(promotions.length > 0, "actually exercise lazy-to-resident promotion")
    assert.ok(promotions.every(event => event.generationAfter === event.generationBefore))
    const definitions = events.filter(event => event.event === "semantic.definition.complete")
    assert.equal(definitions.length, 2)
    assert.equal(definitions[1].programSequence, definitions[0].programSequence)
    const hits = events.filter(event => event.event === "references.resident.hit")
    assert.equal(hits.length, 2, JSON.stringify(events.filter(event => /resident|batch.start/.test(event.event))))
    assert.ok(hits.every(event => event.sameProgram && event.completeScope
      && event.programBuilds === 0 && event.verifierWorkerStarts === 0))
    assert.ok(!events.some(event => event.event === "references.batch.start"))
    assert.equal(events.filter(event => event.event === "references.cache.miss").length, 2)
    assert.ok(!events.some(event => event.event === "references.cache.hit"))
  })

test("references after promoted unsaved edits keep new calls, removed calls and current diagnostics exact",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture)
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    for (const [version, source, codes] of [
      [2, `// edited 😀\n${fixture.sources["Use.ets"]}`
        + 'export const again = new TargetThing()\nexport const broken: number = "wrong"\n', [2322]],
      [3, `// removed 😀\n${fixture.sources["Use.ets"]}`, []],
    ]) {
      session.changeDocument({ uri: fixture.uri("Use.ets"), version, text: source })
      await assertReferences(session, fixture, source)
      const diagnostics = (await diagnostic(session, fixture.uri("Use.ets"), version)).params.diagnostics
      assert.deepEqual(diagnostics.map(item => item.code), codes)
      if (codes.length) {
        assert.deepEqual(diagnostics[0].range,
          location(fixture, "Use.ets", source, source.indexOf("broken"), "broken").range)
      }
    }
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    const events = readEvents(fixture)
    assert.ok(events.some(event => event.event === "references.resident.hit"))
    assert.equal(events.filter(event => event.event === "references.cache.miss").length, 6)
    assert.ok(!events.some(event => event.event === "references.cache.hit"))
  })

test("pressure invalidates a promoted resident proof and complete fallback preserves both reference policies",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, { ARKTS_L03_PRESSURE_WORKER_RECYCLE: "1" })
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const baselineHits = readEvents(fixture).filter(event => event.event === "references.resident.hit").length
    assert.equal(baselineHits, 2)
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(fixture, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    const before = readEvents(fixture).length
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const after = readEvents(fixture).slice(before)
    assert.ok(after.some(event => event.event === "references.resident.miss"))
    assert.ok(after.some(event => event.event === "references.batch.start"))
    assert.ok(!after.some(event => event.event === "references.cache.hit"))
    assert.ok(!after.some(event => event.event === "semantic.worker.pressure-recycle.complete"),
      "explicit pressure alone must not activate the natural-pressure entry")
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
  })

test("automatic Worker retirement keeps indexed fallback exact after a promoted overlay changes",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, {
      ARKTS_L03_PRESSURE_WORKER_RECYCLE: "1", ARKTS_MEMORY_BUDGET_MB: "64",
    })
    await warmAndPromote(session, fixture)
    await waitForEvent(fixture, event => event.event === "semantic.worker.pressure-recycle.complete")
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    const source = `// recovered 😀\n${fixture.sources["Use.ets"]}`
      + 'export const again = new TargetThing()\nexport const broken: number = "wrong"\n'
    session.changeDocument({ uri: fixture.uri("Use.ets"), version: 2, text: source })
    await assertReferences(session, fixture, source)
    const diagnostics = (await diagnostic(session, fixture.uri("Use.ets"), 2)).params.diagnostics
    assert.deepEqual(diagnostics.map(item => item.code), [2322])
    assert.deepEqual(diagnostics[0].range,
      location(fixture, "Use.ets", source, source.indexOf("broken"), "broken").range)
    const closed = await session.close({ timeoutMs: 5_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
    const events = readEvents(fixture)
    assert.ok(events.some(event => event.event === "references.resident.miss"))
    assert.ok(events.some(event => event.event === "references.batch.start"))
    assert.ok(events.filter(event => event.event === "semantic.worker.started").length >= 2)
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

test("promoted alias and re-export references match an independent complete legacy process",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t, { aliases: true })
    const legacy = await startSession(t, fixture, {
      ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
    })
    await warmAndPromote(legacy, fixture)
    const expected = await referenceResults(legacy, fixture)
    assert.deepEqual((await legacy.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const resident = await startSession(t, fixture)
    await warmAndPromote(resident, fixture)
    const actual = await referenceResults(resident, fixture)
    assert.deepEqual(actual, expected)
    for (const result of actual) {
      const locations = result.map(JSON.parse)
      for (const [name, alias] of [["Use.ets", "Maker"], ["ZHidden.ets", "HiddenMaker"]]) {
        const source = fixture.sources[name]
        assert.ok(locations.some(item => JSON.stringify(item) === JSON.stringify(
          location(fixture, name, source, source.lastIndexOf(alias), alias))))
      }
      assert.ok(!locations.some(item => item.uri === fixture.uri("SameName.ets")))
    }
    assert.deepEqual((await resident.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const events = readEvents(fixture)
    assert.equal(events.filter(event => event.event === "references.resident.hit").length, 2)
    assert.ok(!events.some(event => event.event === "references.batch.start"))
  })

test("complete resident coverage includes an unopened native ArkTS struct caller after promotion",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t, { nativeStruct: true })
    const session = await startSession(t, fixture)
    await warmAndPromote(session, fixture)
    await assertReferences(session, fixture, fixture.sources["Use.ets"])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const events = readEvents(fixture)
    assert.equal(events.filter(event => event.event === "references.resident.hit").length, 2)
    assert.ok(!events.some(event => event.event === "references.batch.start"))
  })

function createFixture(t, { aliases = false, nativeStruct = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resident-session-references-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ apiVersion: "24", version: "test" }))
  const sources = {
    "Target.ets": "/* 😀 */ export class TargetThing { value = 1 }\n",
    "Warm.ets": "export interface WarmContract { value: number }\n"
      + "export class WarmImplementation implements WarmContract { value = 1 }\n"
      + "export const warm = new WarmImplementation()\n",
    "Use.ets": 'import { TargetThing } from "./Target"\n'
      + 'import { WarmImplementation } from "./Warm"\n'
      + "export const selected = new TargetThing()\n"
      + "export const warmAgain = new WarmImplementation()\n",
    "SameName.ets": "export class TargetThing {}\nexport const other = new TargetThing()\n",
    "ZHidden.ets": 'import { TargetThing } from "./Target"\nexport const hidden = new TargetThing()\n',
  }
  if (aliases) {
    sources["Barrel.ets"] = 'export { TargetThing as PublicThing } from "./Target"\n'
    sources["Use.ets"] = 'import { PublicThing as Maker } from "./Barrel"\n'
      + 'import { WarmImplementation } from "./Warm"\n'
      + "export const selected = new Maker()\nexport const warmAgain = new WarmImplementation()\n"
    sources["ZHidden.ets"] = 'import { PublicThing as HiddenMaker } from "./Barrel"\n'
      + "export const hidden = new HiddenMaker()\n"
  }
  for (let index = 0; index < 270; index++) {
    sources[`Filler${String(index).padStart(3, "0")}.ets`] = `export const filler${index} = ${index}\n`
  }
  if (nativeStruct) {
    sources["Filler000.ets"] = 'import { TargetThing } from "./Target"\n'
      + "export struct NativeFixture { target = new TargetThing() }\n"
  }
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), source)
  return { directory, workspace, sdk, sources, logs: path.join(directory, "logs"),
    uri: name => pathToFileURL(path.join(workspace, name)).href }
}

async function startSession(t, fixture, env = {}) {
  fixture.runCount = (fixture.runCount ?? 0) + 1
  fixture.logs = path.join(fixture.directory, `logs-${fixture.runCount}`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(fixture.workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: fixture.sdk, DEVECO_SDK_HOME: fixture.sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, `cache-${fixture.runCount}`),
      ARKTS_LSP_LOG_DIR: fixture.logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L02_SAME_CONTENT_PROMOTION: "1",
      ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
      ARKTS_MEMORY_BUDGET_MB: "1024",
      ...env,
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000,
    initializationOptions: { sdk: { path: fixture.sdk } } })
  return session
}

async function warmAndPromote(session, fixture) {
  for (const name of ["Target.ets", "Warm.ets"]) {
    session.openDocument({ uri: fixture.uri(name), version: 1, text: fixture.sources[name] })
    assert.deepEqual((await diagnostic(session, fixture.uri(name), 1)).params.diagnostics, [])
  }
  const warm = fixture.sources["Warm.ets"]
  const implementation = await session.request("textDocument/implementation", {
    textDocument: { uri: fixture.uri("Warm.ets") },
    position: positionAt(warm, warm.indexOf("WarmContract") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(implementation.error, undefined, JSON.stringify(implementation.error))
  assert.deepEqual(implementation.result, [location(fixture, "Warm.ets", warm,
    warm.indexOf("WarmImplementation"), "WarmImplementation")])
  await warmDefinition(session, fixture, "Warm.ets")
  session.openDocument({ uri: fixture.uri("Use.ets"), version: 1, text: fixture.sources["Use.ets"] })
  assert.deepEqual((await diagnostic(session, fixture.uri("Use.ets"), 1)).params.diagnostics, [])
  await warmDefinition(session, fixture, "Use.ets")
}

async function warmDefinition(session, fixture, name) {
  const source = fixture.sources[name]
  const response = await session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri(name) },
    position: positionAt(source, source.lastIndexOf("WarmImplementation") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const warm = fixture.sources["Warm.ets"]
  assert.deepEqual(response.result, [location(fixture, "Warm.ets", warm,
    warm.indexOf("WarmImplementation"), "WarmImplementation")])
}

async function assertReferences(session, fixture, useText) {
  const target = fixture.sources["Target.ets"]
  for (const includeDeclaration of [false, true]) {
    const response = await session.request("textDocument/references", {
      textDocument: { uri: fixture.uri("Target.ets") },
      position: positionAt(target, target.indexOf("TargetThing") + 1),
      context: { includeDeclaration },
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const expected = includeDeclaration
      ? [location(fixture, "Target.ets", target, target.indexOf("TargetThing"), "TargetThing")] : []
    for (const [name, source] of [["Use.ets", useText], ["ZHidden.ets", fixture.sources["ZHidden.ets"]],
      ...(fixture.sources["Filler000.ets"].includes("TargetThing")
        ? [["Filler000.ets", fixture.sources["Filler000.ets"]]] : [])]) {
      expected.push(...[...source.matchAll(/TargetThing/g)].map(match =>
        location(fixture, name, source, match.index, "TargetThing")))
    }
    assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
  }
}

async function referenceResults(session, fixture) {
  const source = fixture.sources["Target.ets"]
  const results = []
  for (const includeDeclaration of [false, true]) {
    const response = await session.request("textDocument/references", {
      textDocument: { uri: fixture.uri("Target.ets") },
      position: positionAt(source, source.indexOf("TargetThing") + 1),
      context: { includeDeclaration },
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    results.push(response.result.map(JSON.stringify).sort())
  }
  return results
}

function diagnostic(session, uri, version) {
  return session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 20_000)
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset).split("\n")
  return { line: prefix.length - 1, character: prefix.at(-1).length }
}

function location(fixture, name, source, offset, symbol) {
  return { uri: fixture.uri(name), range: {
    start: positionAt(source, offset), end: positionAt(source, offset + symbol.length),
  } }
}

function readEvents(fixture) {
  return fs.readFileSync(path.join(fixture.logs, "server.log"), "utf8")
    .trim().split("\n").map(JSON.parse)
}

async function waitForEvent(fixture, predicate) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const event = readEvents(fixture).find(predicate)
    if (event) return event
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail("timed out waiting for semantic lifecycle event")
}
