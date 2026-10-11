import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { selectedL03Policy } from "../support/resident-interactive-lsp.mjs"

test("promoted call hierarchy preserves complete directions, unopened alias callers and UTF-16 call ranges",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const observations = []
    for (const enabled of [false, true]) {
      const session = await startSession(t, fixture, enabled)
      await warmAndPromote(session, fixture)
      observations.push(await assertCalls(session, fixture))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      if (enabled) {
        const admissions = readEvents(fixture).filter(event => event.event === "semantic.prepare.script-admission"
          && event.promotedWithMatchingFingerprint > 0)
        assert.ok(admissions.length > 0)
        assert.ok(admissions.every(event => event.generationAfter === event.generationBefore))
      }
    }
    assert.deepEqual(observations[1], observations[0])
  })

test("call hierarchy preserves a genuine whole-module top-level caller and follows its outgoing edge",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const top = 'import { work } from "./ZCallee"\n/* 😀 */ work()\n'
    fs.writeFileSync(path.join(fixture.workspace, "ZTop.ets"), top)
    for (const enabled of [false, true]) {
      const session = await startSession(t, fixture, enabled, selectedL03Policy)
      await warmAndPromote(session, fixture)
      const callee = fixture.sources["ZCallee.ets"]
      session.openDocument({ uri: fixture.uri("ZCallee.ets"), version: 1, text: callee })
      assert.deepEqual((await diagnostic(session, fixture.uri("ZCallee.ets"), 1)).params.diagnostics, [])
      const prepared = await session.request("textDocument/prepareCallHierarchy", {
        textDocument: { uri: fixture.uri("ZCallee.ets") },
        position: positionAt(callee, callee.indexOf("function work") + "function ".length + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
      const target = item(fixture, "ZCallee.ets", callee, "work")
      assert.deepEqual(prepared.result, [target])
      const incoming = await session.request("callHierarchy/incomingCalls", { item: prepared.result[0] },
        { timeoutMs: 20_000 })
      assert.equal(incoming.error, undefined, JSON.stringify(incoming.error))
      const moduleItem = { name: path.join(fixture.workspace, "ZTop.ets"), kind: 2,
        uri: fixture.uri("ZTop.ets"), range: { start: positionAt(top, 0), end: positionAt(top, top.length) },
        selectionRange: { start: positionAt(top, 0), end: positionAt(top, 0) },
        data: { arktsCallHierarchy: { protocol: 1, rootUri: pathToFileURL(fixture.workspace).href } } }
      const caller = fixture.sources["ZCaller.ets"], hidden = fixture.sources["ZHidden.ets"]
      assert.deepEqual(incoming.result, [
        { from: item(fixture, "ZCaller.ets", caller, "caller"),
          fromRanges: [...caller.matchAll(/doWork/g)].slice(1).map(match => rangeAt(caller, match.index, "doWork")) },
        { from: item(fixture, "ZHidden.ets", hidden, "hidden"),
          fromRanges: [rangeAt(hidden, hidden.lastIndexOf("work"), "work")] },
        { from: moduleItem, fromRanges: [rangeAt(top, top.lastIndexOf("work"), "work")] },
      ])
      const outgoing = await session.request("callHierarchy/outgoingCalls", { item: incoming.result[2].from },
        { timeoutMs: 20_000 })
      assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
      assert.deepEqual(outgoing.result, [{ to: target,
        fromRanges: [rangeAt(top, top.lastIndexOf("work"), "work")] }])
      for (const altered of [{ ...moduleItem, name: "not-the-current-file" },
        { ...moduleItem, kind: 6 },
        { ...moduleItem, range: { ...moduleItem.range, end: positionAt(top, top.length - 1) } }]) {
        const rejected = await session.request("callHierarchy/outgoingCalls", { item: altered },
          { timeoutMs: 20_000 })
        assert.equal(rejected.error?.code, -32801, JSON.stringify(rejected))
        assert.equal(rejected.result, undefined)
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("promoted call hierarchy refreshes overlay call sites and detects an unnotified unopened caller removal",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true)
    await warmAndPromote(session, fixture)
    const before = await assertCalls(session, fixture)
    const caller = `// changed caller 😀\n${fixture.sources["ZCaller.ets"]}`
      .replace("doWork() + doWork()", "doWork() + doWork() + doWork()")
    session.changeDocument({ uri: fixture.uri("ZCaller.ets"), version: 2, text: caller })
    const stale = await session.request("callHierarchy/outgoingCalls", { item: before.prepared[0] },
      { timeoutMs: 20_000 })
    assert.equal(stale.error?.code, -32801, JSON.stringify(stale))
    assert.equal(stale.result, undefined)
    await assertCalls(session, fixture, { caller })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZCaller.ets"), 2)).params.diagnostics, [])
    fs.writeFileSync(path.join(fixture.workspace, "ZHidden.ets"), "export function hidden(): number { return 0 }\n")
    await assertCalls(session, fixture, { caller, hidden: null })
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("call hierarchy restores the latest overlay after an actual post-L3 Worker replacement",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, { ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1" })
    await warmAndPromote(session, fixture)
    await assertCalls(session, fixture)
    const caller = `// changed caller before recycle 😀\n${fixture.sources["ZCaller.ets"]}`
      .replace("doWork() + doWork()", "doWork() + doWork() + doWork()")
    session.changeDocument({ uri: fixture.uri("ZCaller.ets"), version: 2, text: caller })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZCaller.ets"), 2)).params.diagnostics, [])
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(fixture, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    const recycle = await session.request("arkts/benchmark/recycleSemanticWorker", {}, { timeoutMs: 20_000 })
    assert.equal(recycle.error, undefined, JSON.stringify(recycle.error))
    assert.equal(recycle.result.recycled, true)
    assert.ok(recycle.result.oldThreadId > 0 && recycle.result.newThreadId > 0)
    assert.notEqual(recycle.result.newThreadId, recycle.result.oldThreadId)
    await assertCalls(session, fixture, { caller })
    const restored = `// changed caller after recycle 😀\n${fixture.sources["ZCaller.ets"]}`
    session.changeDocument({ uri: fixture.uri("ZCaller.ets"), version: 3, text: restored })
    await assertCalls(session, fixture, { caller: restored })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZCaller.ets"), 3)).params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

test("early call-hierarchy cancellations publish one terminal error per direction and recover complete results",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true)
    await warmAndPromote(session, fixture)
    const before = await assertCalls(session, fixture)
    const caller = fixture.sources["ZCaller.ets"]
    const ids = new Set()
    for (const [method, params] of [
      ["textDocument/prepareCallHierarchy", { textDocument: { uri: fixture.uri("ZCaller.ets") },
        position: positionAt(caller, caller.indexOf("function caller") + "function ".length + 1) }],
      ["callHierarchy/outgoingCalls", { item: before.prepared[0] }],
      ["callHierarchy/incomingCalls", { item: before.outgoing[0].to }],
    ]) {
      const id = session.nextRequestId
      ids.add(id)
      const pending = session.request(method, params, { timeoutMs: 20_000 })
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
      const response = await pending
      assert.equal(response.error?.code, -32800, `${method}: ${JSON.stringify(response)}`)
      assert.equal(response.result, undefined)
    }
    assert.deepEqual(await assertCalls(session, fixture), before)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => ids.has(message.id)), "no duplicate terminal response")
  })

test("an unopened call-hierarchy follow-up preserves the current overlay diagnostic publication",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, {
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "500",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/ZHidden.ets",
    })
    await warmAndPromote(session, fixture)
    const before = await assertCalls(session, fixture)
    const eventIndex = readEvents(fixture).length
    const hidden = `// hidden overlay during diagnosis 😀\n${fixture.sources["ZHidden.ets"]}`
      + 'export const broken: number = "wrong"\n'
    session.openDocument({ uri: fixture.uri("ZHidden.ets"), version: 1, text: fixture.sources["ZHidden.ets"] })
    session.changeDocument({ uri: fixture.uri("ZHidden.ets"), version: 2, text: hidden })
    await waitForEvent(fixture, event => event.event === "semantic.test.diagnose.hold.start"
      && event.uri === fixture.uri("ZHidden.ets"), eventIndex)
    const response = await session.request("callHierarchy/outgoingCalls", { item: before.outgoing[0].to },
      { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const leaf = fixture.sources["ZLeaf.ets"]
    const callee = fixture.sources["ZCallee.ets"]
    assert.deepEqual(response.result, [{ to: item(fixture, "ZLeaf.ets", leaf, "leaf"),
      fromRanges: [rangeAt(callee, callee.lastIndexOf("leaf"), "leaf")] }])
    assert.deepEqual((await diagnostic(session, fixture.uri("ZHidden.ets"), 2)).params.diagnostics
      .map(({ code, range }) => ({ code, range })), [{ code: 2322,
      range: rangeAt(hidden, hidden.indexOf("broken"), "broken") }])
    await assertCalls(session, fixture, { hidden })
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 selected budget, trace OFF and default full-safe calls preserve every current directional range",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t), observations = []
    for (const [enabled, env] of [[true, selectedL03Policy], [false, selectedL03Policy],
      [true, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }],
      [false, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
        ARKTS_REFERENCES_TRACE: "0", ARKTS_L03_COST_AWARE_EVICTION: "0",
        ARKTS_L01_PRESSURE_ADMISSION: "0", ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0" }]]) {
      const session = await startSession(t, fixture, enabled, env)
      await warmAndPromote(session, fixture)
      const first = await assertCalls(session, fixture)
      assert.deepEqual(await assertCalls(session, fixture), first)
      const caller = `// selected policy latest caller 😀\n${fixture.sources["ZCaller.ets"]}`
        .replace("doWork() + doWork()", "doWork() + doWork() + doWork()")
      session.changeDocument({ uri: fixture.uri("ZCaller.ets"), version: 2, text: caller })
      const stale = await session.request("callHierarchy/outgoingCalls", { item: first.prepared[0] }, { timeoutMs: 20_000 })
      assert.equal(stale.error?.code, -32801, JSON.stringify(stale))
      assert.equal(stale.result, undefined)
      const current = await assertCalls(session, fixture, { caller })
      const publication = (await diagnostic(session, fixture.uri("ZCaller.ets"), 2)).params
      assert.deepEqual(publication.diagnostics, [])
      observations.push({ first, current, publication })
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      if (env.ARKTS_REFERENCES_TRACE === "0") {
        assert.ok(!readEvents(fixture).some(event => ["semantic.prepareCallHierarchy.complete",
          "semantic.incomingCalls.complete", "semantic.outgoingCalls.complete"].includes(event.event)))
      }
    }
    for (const observation of observations.slice(1)) assert.deepEqual(observation, observations[0])
  })

test("L07 selected policy physically replaces the Worker and restores the complete latest call graph",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, { ...selectedL03Policy,
      ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1", ARKTS_MEMORY_BUDGET_MB: "64" })
    await warmAndPromote(session, fixture)
    const caller = `// qualified low-budget recovery 😀\n${fixture.sources["ZCaller.ets"]}`
      .replace("doWork() + doWork()", "doWork() + doWork() + doWork()")
    session.changeDocument({ uri: fixture.uri("ZCaller.ets"), version: 2, text: caller })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZCaller.ets"), 2)).params.diagnostics, [])
    const before = await assertCalls(session, fixture, { caller })
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(fixture, event => event.event === "semantic.context.evict" && event.reason === "memory-level3")
    const recycle = await session.request("arkts/benchmark/recycleSemanticWorker", {}, { timeoutMs: 20_000 })
    assert.equal(recycle.error, undefined, JSON.stringify(recycle.error))
    assert.equal(recycle.result.recycled, true)
    assert.ok(recycle.result.oldThreadId > 0 && recycle.result.newThreadId > 0)
    assert.notEqual(recycle.result.oldThreadId, recycle.result.newThreadId)
    assert.deepEqual(await assertCalls(session, fixture, { caller }), before)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resident-calls-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  const sources = {
    "AWarm.ets": "export interface WarmContract { value: number }\n"
      + "export class WarmImplementation implements WarmContract { value = 1 }\n",
    "ZLeaf.ets": "export function leaf(): number { return 1 }\n",
    "ZCallee.ets": 'import { leaf } from "./ZLeaf"\nexport function work(): number { return leaf() }\n',
    "ZCaller.ets": 'import { work as doWork } from "./ZCallee"\n'
      + "export function caller(): number {\n  /* 😀 */ return doWork() + doWork()\n}\n",
    "ZHidden.ets": 'import { work } from "./ZCallee"\nexport function hidden(): number { return work() }\n',
    "ZHomonym.ets": "export function work(): number { return 0 }\n"
      + "export function unrelated(): number { return work() }\n",
  }
  for (let index = 0; index < 270; index++) {
    sources[`Filler${String(index).padStart(3, "0")}.ets`] = `export const filler${index} = ${index}\n`
  }
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), source)
  return { directory, workspace, sdk, sources, uri: name => pathToFileURL(path.join(workspace, name)).href }
}

async function startSession(t, fixture, enabled, env = {}) {
  fixture.runCount = (fixture.runCount ?? 0) + 1
  fixture.logs = path.join(fixture.directory, `logs-${fixture.runCount}`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(fixture.workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true }, callHierarchy: {} } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: fixture.sdk, DEVECO_SDK_HOME: fixture.sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, `cache-${fixture.runCount}`), ARKTS_LSP_LOG_DIR: fixture.logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched", ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1", ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L02_SAME_CONTENT_PROMOTION: enabled ? "1" : "0", ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
      ARKTS_MEMORY_BUDGET_MB: "1024", ...env,
    },
  })
  t.after(() => session.close().catch(() => {}))
  const initialized = await session.initialize({ timeoutMs: 10_000,
    initializationOptions: { sdk: { path: fixture.sdk } } })
  assert.equal(initialized.result.capabilities.callHierarchyProvider, true)
  return session
}

async function warmAndPromote(session, fixture) {
  const warm = fixture.sources["AWarm.ets"]
  session.openDocument({ uri: fixture.uri("AWarm.ets"), version: 1, text: warm })
  assert.deepEqual((await diagnostic(session, fixture.uri("AWarm.ets"), 1)).params.diagnostics, [])
  const implementation = await session.request("textDocument/implementation", {
    textDocument: { uri: fixture.uri("AWarm.ets") }, position: positionAt(warm, warm.indexOf("WarmContract") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(implementation.error, undefined, JSON.stringify(implementation.error))
  assert.deepEqual(implementation.result, [{ uri: fixture.uri("AWarm.ets"),
    range: rangeAt(warm, warm.indexOf("WarmImplementation"), "WarmImplementation") }])
  session.openDocument({ uri: fixture.uri("ZCaller.ets"), version: 1, text: fixture.sources["ZCaller.ets"] })
  assert.deepEqual((await diagnostic(session, fixture.uri("ZCaller.ets"), 1)).params.diagnostics, [])
}

async function assertCalls(session, fixture, { caller = fixture.sources["ZCaller.ets"],
  hidden = fixture.sources["ZHidden.ets"] } = {}) {
  const call = async (method, params) => {
    const response = await session.request(method, params, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return response.result
  }
  const prepared = await call("textDocument/prepareCallHierarchy", {
    textDocument: { uri: fixture.uri("ZCaller.ets") },
    position: positionAt(caller, caller.indexOf("function caller") + "function ".length + 1),
  })
  const callerItem = item(fixture, "ZCaller.ets", caller, "caller")
  assert.deepEqual(prepared, [callerItem])
  const callee = fixture.sources["ZCallee.ets"]
  const target = item(fixture, "ZCallee.ets", callee, "work")
  const ranges = [...caller.matchAll(/doWork/g)].slice(1).map(match => rangeAt(caller, match.index, "doWork"))
  const outgoing = await call("callHierarchy/outgoingCalls", { item: prepared[0] })
  assert.deepEqual(outgoing, [{ to: target, fromRanges: ranges }])
  const incoming = await call("callHierarchy/incomingCalls", { item: target })
  const expected = [{ from: callerItem, fromRanges: ranges }]
  if (hidden !== null) expected.push({ from: item(fixture, "ZHidden.ets", hidden, "hidden"),
    fromRanges: [rangeAt(hidden, hidden.lastIndexOf("work"), "work")] })
  assert.deepEqual(incoming, expected)
  const leaf = fixture.sources["ZLeaf.ets"]
  const followed = await call("callHierarchy/outgoingCalls", { item: target })
  assert.deepEqual(followed, [{ to: item(fixture, "ZLeaf.ets", leaf, "leaf"),
    fromRanges: [rangeAt(callee, callee.lastIndexOf("leaf"), "leaf")] }])
  return { prepared, outgoing, incoming, followed }
}

function item(fixture, name, source, symbol) {
  return { name: symbol, kind: 12, uri: fixture.uri(name),
    range: { start: positionAt(source, source.indexOf("export function")),
      end: positionAt(source, source.lastIndexOf("}") + 1) },
    selectionRange: rangeAt(source, source.indexOf(`function ${symbol}`) + "function ".length, symbol),
    data: { arktsCallHierarchy: { protocol: 1, rootUri: pathToFileURL(fixture.workspace).href } } }
}

function diagnostic(session, uri, version) {
  return session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 20_000)
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset).split("\n")
  return { line: prefix.length - 1, character: prefix.at(-1).length }
}

function rangeAt(source, offset, symbol) {
  return { start: positionAt(source, offset), end: positionAt(source, offset + symbol.length) }
}

function readEvents(fixture) {
  return fs.readFileSync(path.join(fixture.logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
}

async function waitForEvent(fixture, predicate, afterIndex = 0) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const event = readEvents(fixture).slice(afterIndex).find(predicate)
    if (event) return event
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail("timed out waiting for call-hierarchy lifecycle witness")
}
