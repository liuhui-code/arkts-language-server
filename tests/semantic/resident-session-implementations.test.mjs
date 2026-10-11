import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import {
  assertGenericImplementations, createFixture, diagnostic, location,
  positionAt, readEvents, startSession, waitForEvent, warmAndPromote,
} from "../support/resident-implementation-lsp.mjs"

const selectedL03Policy = {
  ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware",
  ARKTS_L03_COST_AWARE_EVICTION: "1",
  ARKTS_L01_PRESSURE_ADMISSION: "1",
  ARKTS_L01_TRANSIENT_DIAGNOSTICS: "1",
  ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "0",
  ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
}

test("L05 selected policy witnesses complete new-symbol implementation reuse without rebuilding",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    await assertGenericImplementations(session, fixture)
    const events = readEvents(fixture)
    const complete = events.filter(event => event.event === "semantic.implementation.complete")
    assert.equal(complete.length, 2, "observe the warm and previously unqueried implementation callbacks")
    assert.ok(complete.every(event => event.collectorAvailable && event.programProjectFiles >= 277))
    assert.equal(complete[1].programSequence, complete[0].programSequence)
    assert.equal(complete[1].createProgramEvents, 0)
    assert.equal(complete[1].createProgramMs, 0)
    assert.equal(complete[1].implementations, 3, "preserve the compiler-owned alias link")
    assert.ok(!events.some(event => event.event === "references.cache.hit"
      || event.event === "references.batch.start"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L05 cancels an executing compiler implementation call and recovers every complete location",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t, { manyImplementations: 4000 })
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    const afterEntry = readEvents(fixture).length
    const id = session.nextRequestId
    const source = fixture.sources["ZContracts.ets"]
    const pending = session.request("textDocument/implementation", {
      textDocument: { uri: fixture.uri("ZContracts.ets") },
      position: positionAt(source, source.indexOf("GenericContract") + 1),
    }, { timeoutMs: 30_000 })
    pending.catch(() => {})
    const started = await waitForEvent(fixture,
      event => event.event === "implementations.compiler-call.start", afterEntry)
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await pending
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    const thrown = await waitForEvent(fixture, event => event.event === "implementations.compiler-call.throw"
      && event.queryIndex === started.queryIndex, afterEntry)
    assert.equal(thrown.cancelled, true, "the compiler call itself observes the live cancellation cell")
    await assertGenericImplementations(session, fixture)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => message.id === id), "no second terminal or partial success")
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

test("complete implementations after lazy promotion preserve compiler-owned generic aliases and exclude homonyms",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    for (const enabled of [false, true]) {
      const session = await startSession(t, fixture, enabled)
      await warmAndPromote(session, fixture)
      await assertGenericImplementations(session, fixture)
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      if (enabled) {
        const admissions = readEvents(fixture).filter(event => event.event === "semantic.prepare.script-admission"
          && event.promotedWithMatchingFingerprint > 0)
        assert.ok(admissions.length > 0, "actually exercise matching lazy-to-resident admission")
        assert.ok(admissions.every(event => event.generationAfter === event.generationBefore))
      }
    }
  })

for (const [prefix, env] of [["", {}], ["L05 selected policy: ", selectedL03Policy],
  ["L05 trace OFF: ", { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }]]) {
test(`${prefix}implementation edits immediately remove and restore classes with current UTF-16 ranges and diagnostics`,
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, env)
    await warmAndPromote(session, fixture)
    await assertGenericImplementations(session, fixture)
    session.openDocument({ uri: fixture.uri("ZText.ets"), version: 1, text: fixture.sources["ZText.ets"] })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZText.ets"), 1)).params.diagnostics, [])
    const removed = '// removed implementation 😀\nexport class ReplacementWorker { value = 1 }\n'
      + 'export const broken: number = "wrong"\n'
    session.changeDocument({ uri: fixture.uri("ZText.ets"), version: 2, text: removed })
    await assertGenericImplementations(session, fixture, { textSource: null })
    const errors = (await diagnostic(session, fixture.uri("ZText.ets"), 2)).params.diagnostics
    assert.deepEqual(errors.map(item => item.code), [2322])
    assert.deepEqual(errors[0].range,
      location(fixture, "ZText.ets", removed, removed.indexOf("broken"), "broken").range)
    const restored = `// restored implementation 😀\n${fixture.sources["ZText.ets"]}`
    session.changeDocument({ uri: fixture.uri("ZText.ets"), version: 3, text: restored })
    await assertGenericImplementations(session, fixture, { textSource: restored })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZText.ets"), 3)).params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    if (env.ARKTS_REFERENCES_TRACE === "0") assert.ok(!readEvents(fixture).some(event =>
      event.event === "semantic.implementation.complete" || event.event.startsWith("implementations.compiler-call.")))
  })
}

for (const [prefix, env] of [["", { ARKTS_MEMORY_BUDGET_MB: "64" }],
  ["L05 selected policy: ", { ...selectedL03Policy, ARKTS_MEMORY_BUDGET_MB: "64" }]]) {
test(`${prefix}implementations recover authoritative overlays after a witnessed post-L3 Worker replacement`,
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true,
      { ...env, ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1" })
    await warmAndPromote(session, fixture)
    await assertGenericImplementations(session, fixture)
    session.openDocument({ uri: fixture.uri("ZText.ets"), version: 1, text: fixture.sources["ZText.ets"] })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZText.ets"), 1)).params.diagnostics, [])
    const changed = '// replaced before recycle 😀\nexport class ReplacementWorker { value = 1 }\n'
      + 'export const broken: number = "wrong"\n'
    session.changeDocument({ uri: fixture.uri("ZText.ets"), version: 2, text: changed })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZText.ets"), 2)).params.diagnostics
      .map(item => item.code), [2322])
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(fixture, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    const recycled = await session.request("arkts/benchmark/recycleSemanticWorker", {}, { timeoutMs: 20_000 })
    assert.equal(recycled.error, undefined, JSON.stringify(recycled.error))
    assert.equal(recycled.result.recycled, true)
    assert.ok(recycled.result.oldThreadId > 0 && recycled.result.newThreadId > 0)
    assert.notEqual(recycled.result.newThreadId, recycled.result.oldThreadId)
    await assertGenericImplementations(session, fixture, { textSource: null })
    const restored = `// restored after recycle 😀\n${fixture.sources["ZText.ets"]}`
    session.changeDocument({ uri: fixture.uri("ZText.ets"), version: 3, text: restored })
    await assertGenericImplementations(session, fixture, { textSource: restored })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZText.ets"), 3)).params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })
}

test("cancelled implementations publish one terminal error and a fresh query recovers the complete set",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true)
    await warmAndPromote(session, fixture)
    const source = fixture.sources["ZContracts.ets"]
    const id = session.nextRequestId
    const pending = session.request("textDocument/implementation", {
      textDocument: { uri: fixture.uri("ZContracts.ets") },
      position: positionAt(source, source.indexOf("GenericContract") + 1),
    }, { timeoutMs: 20_000 })
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await pending
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    await assertGenericImplementations(session, fixture)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => message.id === id),
      "no second terminal or partial response remains after cancellation and recovery")
  })

for (const [prefix, env] of [["", {}], ["L05 selected policy: ", selectedL03Policy]]) {
test(`${prefix}promoted implementations distinguish inherited classes, overrides and generic members`,
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, env)
    await warmAndPromote(session, fixture)
    const source = fixture.sources["ZContracts.ets"]
    for (const [querySymbol, expectedNames] of [
      ["AbstractTask", [["ZConcrete.ets", "ConcreteTask"], ["ZDerived.ets", "DerivedTask"]]],
      ["execute", [["ZConcrete.ets", "execute"], ["ZDerived.ets", "execute"]]],
      ["run", [["ZNumber.ets", "run"], ["ZText.ets", "run"]]],
    ]) {
      const response = await session.request("textDocument/implementation", {
        textDocument: { uri: fixture.uri("ZContracts.ets") },
        position: positionAt(source, source.indexOf(querySymbol) + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const expected = expectedNames.map(([name, symbol]) => location(fixture, name,
        fixture.sources[name], fixture.sources[name].indexOf(symbol), symbol))
      assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())
    }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

for (const fillerCount of [0, 270]) {
test(`L05 minimal source switching preserves earlier complete implementation queries without SDK changes (${fillerCount})`,
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t, { fillerCount })
    const source = "export interface OtherContract { value: number }\n"
      + "export class OtherWorker implements OtherContract { value = 1 }\n"
    fs.writeFileSync(path.join(fixture.workspace, "Other.ets"), source)
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    await assertGenericImplementations(session, fixture)
    session.openDocument({ uri: fixture.uri("Other.ets"), version: 1, text: source })
    assert.deepEqual((await diagnostic(session, fixture.uri("Other.ets"), 1)).params.diagnostics, [])
    const result = await session.request("textDocument/implementation", {
      textDocument: { uri: fixture.uri("Other.ets") },
      position: positionAt(source, source.indexOf("OtherContract") + 1),
    }, { timeoutMs: 20_000 })
    assert.deepEqual(result.result, [location(fixture, "Other.ets", source, source.indexOf("OtherWorker"), "OtherWorker")])
    await assertGenericImplementations(session, fixture)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

for (const promotion of [false, true]) {
test(`L05 root configuration invalidation preserves complete implementations beyond the preload window (promotion ${promotion})`,
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, promotion, selectedL03Policy)
    await warmAndPromote(session, fixture)
    await assertGenericImplementations(session, fixture)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { project: {} } } } })
    await assertGenericImplementations(session, fixture)
    assert.equal(readEvents(fixture).findLast(event => event.event === "semantic.implementation.complete")
      ?.programProjectRootFiles, 277, "complete membership must survive root invalidation, not just the preload window")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

test("L05 selected policy refreshes SDK-bound implementations and current diagnostics after configuration switches",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const source = 'import { SdkContract } from "@ohos.impl"\n'
      + "export class SdkWorker implements SdkContract { value: number = 1 }\n"
    fs.writeFileSync(path.join(fixture.workspace, "ZSdk.ets"), source)
    const nextSdk = path.join(fixture.directory, "sdk-second")
    for (const [sdk, type] of [[fixture.sdk, "number"], [nextSdk, "string"]]) {
      fs.mkdirSync(path.join(sdk, "ets", "api"), { recursive: true })
      if (sdk === nextSdk) {
        fs.mkdirSync(path.join(sdk, "toolchains"))
        fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
          JSON.stringify({ apiVersion: "24", version: "test" }))
      }
      fs.writeFileSync(path.join(sdk, "ets", "api", "@ohos.impl.d.ts"),
        `export interface SdkContract { value: ${type} }\n`)
    }
    const uri = fixture.uri("ZSdk.ets")
    const coldFixture = { ...fixture, sdk: nextSdk }
    const cold = await startSession(t, coldFixture, false)
    cold.openDocument({ uri, version: 1, text: source })
    const coldErrors = (await diagnostic(cold, uri, 1)).params.diagnostics
    assert.deepEqual(coldErrors.map(item => item.code), [2416])
    assert.deepEqual(coldErrors[0].range, location(fixture, "ZSdk.ets", source, source.indexOf("value:"), "value").range)
    const coldResult = await cold.request("textDocument/implementation", { textDocument: { uri },
      position: positionAt(source, source.lastIndexOf("SdkContract") + 1) }, { timeoutMs: 20_000 })
    assert.deepEqual(coldResult.result, [location(fixture, "ZSdk.ets", source, source.indexOf("SdkWorker"), "SdkWorker")])
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fixture.runCount = coldFixture.runCount
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    const query = { textDocument: { uri }, position: positionAt(source, source.lastIndexOf("SdkContract") + 1) }
    const expected = [location(fixture, "ZSdk.ets", source, source.indexOf("SdkWorker"), "SdkWorker")]
    assert.deepEqual((await session.request("textDocument/implementation", query, { timeoutMs: 20_000 })).result, expected)
    for (const [version, sdk, codes] of [[2, nextSdk, [2416]], [3, fixture.sdk, []]]) {
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: sdk } } } } })
      const overlay = `// SDK switch ${version} 😀\n${source}`
      session.changeDocument({ uri, version, text: overlay })
      const result = await session.request("textDocument/implementation", {
        ...query, position: positionAt(overlay, overlay.lastIndexOf("SdkContract") + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(result.error, undefined, JSON.stringify(result.error))
      assert.deepEqual(result.result, [location(fixture, "ZSdk.ets", overlay, overlay.indexOf("SdkWorker"), "SdkWorker")])
      const diagnostics = (await diagnostic(session, uri, version)).params.diagnostics
      assert.deepEqual(diagnostics.map(item => item.code), codes)
      if (codes.length) assert.deepEqual(diagnostics[0].range,
        location(fixture, "ZSdk.ets", overlay, overlay.indexOf("value:"), "value").range)
    }
    await assertGenericImplementations(session, fixture)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

for (const [notified, residentFastPath] of [[true, "1"], [false, "1"], [false, "0"]]) {
test(`L05 package entry changes refresh the complete implementation set and preserve authoritative overlays (notified ${notified}, R09 ${residentFastPath})`,
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const root = path.join(fixture.workspace, "shared")
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(fixture.workspace, "oh-package.json5"), "{ dependencies: { shared: 'file:./shared' } }")
    const manifest = path.join(root, "oh-package.json5")
    const texts = ["number", "string"].map((type, index) =>
      `export interface PackageContract { value: ${type} }\n`
      + `export class Peer${index} implements PackageContract { value: ${type} = ${index ? '"updated"' : "1"} }\n`)
    for (const [index, name] of ["First.ets", "Second.ets"].entries()) fs.writeFileSync(path.join(root, name), texts[index])
    const source = 'import { PackageContract } from "shared"\n'
      + 'export class PackageClient implements PackageContract { value: number = 1 }\n'
    fs.writeFileSync(path.join(fixture.workspace, "ZPackage.ets"), source)
    const overlay = `// authoritative package switch 😀\n${source}`
    const uri = fixture.uri("ZPackage.ets")
    const query = text => ({ textDocument: { uri }, position: positionAt(text, text.indexOf("PackageContract") + 1) })
    const expected = (index, text) => [location(fixture, "ZPackage.ets", text, text.indexOf("PackageClient"), "PackageClient"),
      location(fixture, `shared/${index ? "Second" : "First"}.ets`, texts[index], texts[index].indexOf(`Peer${index}`), `Peer${index}`)]
    fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
    const coldFixture = { ...fixture }
    const cold = await startSession(t, coldFixture, false)
    cold.openDocument({ uri, version: 1, text: overlay })
    const coldErrors = (await diagnostic(cold, uri, 1)).params.diagnostics
    assert.deepEqual(coldErrors.map(item => item.code), [2416])
    const coldResult = await cold.request("textDocument/implementation", query(overlay), { timeoutMs: 20_000 })
    assert.equal(coldResult.error, undefined, JSON.stringify(coldResult.error))
    assert.deepEqual(coldResult.result.map(JSON.stringify).sort(), expected(1, overlay).map(JSON.stringify).sort())
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fixture.runCount = coldFixture.runCount
    fs.writeFileSync(manifest, "{ main: 'First.ets' }")
    const session = await startSession(t, fixture, true, { ...selectedL03Policy,
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: residentFastPath })
    await warmAndPromote(session, fixture)
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    const first = await session.request("textDocument/implementation", query(source), { timeoutMs: 20_000 })
    assert.equal(first.error, undefined, JSON.stringify(first.error))
    assert.deepEqual(first.result.map(JSON.stringify).sort(), expected(0, source).map(JSON.stringify).sort())
    fs.writeFileSync(path.join(fixture.workspace, "ZPackage.ets"), "export const diskOnly = 1\n")
    fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
    const notify = () => session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(manifest).href, type: 2 }] } })
    if (notified) notify()
    session.changeDocument({ uri, version: 2, text: overlay })
    let refreshed = await session.request("textDocument/implementation", query(overlay), { timeoutMs: 20_000 })
    let version = 2
    if (!notified && refreshed.error) {
      assert.equal(refreshed.error.code, -32803, JSON.stringify(refreshed.error))
      assert.equal(refreshed.result, undefined, "unknown inputs cannot return a successful old subset")
      notify()
      session.changeDocument({ uri, version: ++version, text: overlay })
      refreshed = await session.request("textDocument/implementation", query(overlay), { timeoutMs: 20_000 })
    }
    assert.equal(refreshed.error, undefined, JSON.stringify(refreshed.error))
    assert.deepEqual(refreshed.result.map(JSON.stringify).sort(), coldResult.result.map(JSON.stringify).sort())
    assert.deepEqual((await diagnostic(session, uri, version)).params.diagnostics, coldErrors)
    await assertGenericImplementations(session, fixture)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

test("L05 unknown project membership rejects partial implementations and recovers a complete snapshot",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    await assertGenericImplementations(session, fixture)
    const unavailable = path.join(fixture.workspace, "ZUnavailable.ets")
    fs.writeFileSync(unavailable, "//" + "x".repeat(4 * 1024 * 1024) + '\n'
      + 'import { GenericContract } from "./ZContracts"\n'
      + 'export class UnavailableWorker implements GenericContract<number> { run(value: number) { return value } }\n')
    const notify = type => session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: fixture.uri("ZUnavailable.ets"), type }] } })
    notify(1)
    const contracts = fixture.sources["ZContracts.ets"]
    const query = { textDocument: { uri: fixture.uri("ZContracts.ets") },
      position: positionAt(contracts, contracts.indexOf("GenericContract") + 1) }
    const rejected = await session.request("textDocument/implementation", query, { timeoutMs: 20_000 })
    assert.equal(rejected.error?.code, -32803, JSON.stringify(rejected))
    assert.equal(rejected.result, undefined, "an incomplete workspace is not a complete subset or empty answer")
    const available = "export interface NoImplementation { missing(): void }\n"
    fs.writeFileSync(unavailable, available)
    notify(2)
    await assertGenericImplementations(session, fixture)
    session.openDocument({ uri: fixture.uri("ZUnavailable.ets"), version: 1, text: available })
    const empty = await session.request("textDocument/implementation", {
      textDocument: { uri: fixture.uri("ZUnavailable.ets") },
      position: positionAt(available, available.indexOf("NoImplementation") + 1),
    }, { timeoutMs: 20_000 })
    assert.equal(empty.error, undefined, JSON.stringify(empty.error))
    assert.deepEqual(empty.result, [], "a proven complete empty answer remains valid")
    const overlay = '// current diagnostic after unknown scope 😀\n'
      + 'export class ReplacementWorker {}\nexport const broken: number = "wrong"\n'
    session.openDocument({ uri: fixture.uri("ZText.ets"), version: 1, text: fixture.sources["ZText.ets"] })
    session.changeDocument({ uri: fixture.uri("ZText.ets"), version: 2, text: overlay })
    await assertGenericImplementations(session, fixture, { textSource: null })
    const errors = (await diagnostic(session, fixture.uri("ZText.ets"), 2)).params.diagnostics
    assert.deepEqual(errors.map(item => item.code), [2322])
    assert.deepEqual(errors[0].range, location(fixture, "ZText.ets", overlay, overlay.indexOf("broken"), "broken").range)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L05 two roots keep same-named implementations isolated through pressure and close-reopen recovery",
  { timeout: 60_000 }, async t => {
    const first = createFixture(t), second = createFixture(t)
    const session = await startSession(t, first, true, selectedL03Policy, [first, second])
    for (const fixture of [first, second]) {
      await warmAndPromote(session, fixture)
      await assertGenericImplementations(session, fixture)
    }
    const uri = second.uri("ZText.ets")
    const removed = '// second root only 😀\nexport class ReplacementWorker {}\n'
      + 'export const broken: number = "wrong"\n'
    session.openDocument({ uri, version: 1, text: second.sources["ZText.ets"] })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    session.changeDocument({ uri, version: 2, text: removed })
    await assertGenericImplementations(session, second, { textSource: null })
    await assertGenericImplementations(session, first)
    const errors = (await diagnostic(session, uri, 2)).params.diagnostics
    assert.deepEqual(errors.map(item => item.code), [2322])
    assert.deepEqual(errors[0].range, location(second, "ZText.ets", removed, removed.indexOf("broken"), "broken").range)
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" })
    await waitForEvent(first, event => event.event === "semantic.context.evict" && event.reason === "memory-level3")
    await assertGenericImplementations(session, first)
    await assertGenericImplementations(session, second, { textSource: null })
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
    await assertGenericImplementations(session, second)
    const restored = `// reopened second root 😀\n${second.sources["ZText.ets"]}`
    session.openDocument({ uri, version: 3, text: restored })
    await assertGenericImplementations(session, second, { textSource: restored })
    assert.deepEqual((await diagnostic(session, uri, 3)).params.diagnostics, [])
    await assertGenericImplementations(session, first)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

for (const budget of ["1024", "1"]) {
  test(`L05 selected policy preserves complete implementations and releases pressure contexts at ${budget} MiB`,
    { timeout: 60_000 }, async t => {
      const fixture = createFixture(t)
      const metricsPath = path.join(fixture.directory, "memory.jsonl")
      const session = await startSession(t, fixture, true, { ...selectedL03Policy,
        ARKTS_MEMORY_BUDGET_MB: budget, ARKTS_MEMORY_METRICS_FILE: metricsPath })
      await warmAndPromote(session, fixture)
      await assertGenericImplementations(session, fixture)
      const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
      await waitForEvent(fixture, event => event.event === "semantic.context.evict"
        && event.reason === "memory-level3")
      await assertGenericImplementations(session, fixture)
      const changed = 'export class ReplacementWorker {}\nexport const broken: number = "wrong"\n'
      session.openDocument({ uri: fixture.uri("ZText.ets"), version: 1, text: fixture.sources["ZText.ets"] })
      session.changeDocument({ uri: fixture.uri("ZText.ets"), version: 2, text: changed })
      await assertGenericImplementations(session, fixture, { textSource: null })
      const errors = (await diagnostic(session, fixture.uri("ZText.ets"), 2)).params.diagnostics
      assert.deepEqual(errors.map(item => item.code), [2322])
      assert.deepEqual(errors[0].range,
        location(fixture, "ZText.ets", changed, changed.indexOf("broken"), "broken").range)
      const pressureAt = Date.now()
      await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      const samples = await quiescentMetrics(metricsPath, pressureAt)
      assert.ok(samples.every(sample => sample.processId === session.transport.child.pid
        && sample.rssScope === "node-process" && sample.semanticWorkerCount === 1
        && sample.residentContextCount <= 2 && sample.leaseCount >= 0))
      if (budget === "1") assert.ok(samples.some(sample => sample.rss > 1024 * 1024),
        "actual aggregate RSS exceeds the functional budget, not a fabricated Worker sum")
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
    })
}

async function quiescentMetrics(file, afterTime) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const samples = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse) : []
    const last = samples.at(-1)
    if (last?.epochMs >= afterTime && last.residentContextCount === 0
      && last.leaseCount === 0 && last.transientVerifierCount === 0) return samples
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail("pressure cleanup must leave no resident context, lease or transient verifier")
}
