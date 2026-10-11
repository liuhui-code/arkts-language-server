import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { createEditCallFixture, diagnostic, packageCallerItem, packageWorkItem, positionAt, readEvents, startEditCallSession,
  warmEditCallSession } from "../support/resident-edit-call-lsp.mjs"

test("L07 unnotified package retarget cannot publish prepareRename from old loaded inputs",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t)
    const session = await startEditCallSession(t, fixture)
    await warmEditCallSession(session, fixture)
    const offset = fixture.caller.lastIndexOf("PackageTarget")
    const params = { textDocument: { uri: fixture.uri("ZPackageCaller.ets") },
      position: positionAt(fixture.caller, offset + 1) }
    const before = await session.request("textDocument/prepareRename", params, { timeoutMs: 20_000 })
    assert.equal(before.error, undefined, JSON.stringify(before.error))
    assert.deepEqual(before.result, { placeholder: "PackageTarget", range: {
      start: positionAt(fixture.caller, offset), end: positionAt(fixture.caller, offset + "PackageTarget".length) } })
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const after = await session.request("textDocument/prepareRename", params, { timeoutMs: 20_000 })
    assert.equal(after.error?.code, -32803, JSON.stringify(after))
    assert.equal(after.result, undefined)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(fixture.manifest).href, type: 2 }] } })
    const overlay = `// current renamed input 😀\n${fixture.caller}`
    const uri = fixture.uri("ZPackageCaller.ets")
    session.changeDocument({ uri, version: 2, text: overlay })
    const currentOffset = overlay.lastIndexOf("PackageTarget")
    const recovered = await session.request("textDocument/prepareRename", {
      textDocument: { uri }, position: positionAt(overlay, currentOffset + 1),
    }, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result, { placeholder: "PackageTarget", range: {
      start: positionAt(overlay, currentOffset), end: positionAt(overlay, currentOffset + "PackageTarget".length) } })
    assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics.map(({ code, range }) => ({ code, range })),
      [{ code: 2322, range: { start: positionAt(overlay, overlay.indexOf("broken")),
        end: positionAt(overlay, overlay.indexOf("broken") + "broken".length) } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 selected policy early cancellations never leak partial edits or calls and every capability recovers",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t), session = await startEditCallSession(t, fixture)
    await warmEditCallSession(session, fixture)
    const uri = fixture.uri("ZPackageCaller.ets")
    const prepareParams = { textDocument: { uri },
      position: positionAt(fixture.caller, fixture.caller.indexOf("function caller") + "function ".length + 1) }
    const prepared = await session.request("textDocument/prepareCallHierarchy", prepareParams, { timeoutMs: 20_000 })
    assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
    assert.deepEqual(prepared.result, [packageCallerItem(fixture)])
    const outgoing = await session.request("callHierarchy/outgoingCalls", { item: prepared.result[0] }, { timeoutMs: 20_000 })
    assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
    assert.equal(outgoing.result.length, 1)
    assert.deepEqual(outgoing.result[0].to, packageWorkItem(fixture, 0))
    const renameParams = { textDocument: { uri }, position: positionAt(fixture.caller, fixture.caller.lastIndexOf("PackageTarget") + 1) }
    const ids = new Set()
    for (const [method, params] of [["textDocument/prepareRename", renameParams],
      ["textDocument/rename", { ...renameParams, newName: "LocalTarget" }],
      ["textDocument/prepareCallHierarchy", prepareParams],
      ["callHierarchy/outgoingCalls", { item: prepared.result[0] }],
      ["callHierarchy/incomingCalls", { item: outgoing.result[0].to }]]) {
      const id = session.nextRequestId
      ids.add(id)
      const pending = session.request(method, params, { timeoutMs: 20_000 })
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
      const cancelled = await pending
      assert.equal(cancelled.error?.code, -32800, `${method}: ${JSON.stringify(cancelled)}`)
      assert.equal(cancelled.result, undefined)
      const recovered = await session.request(method, params, { timeoutMs: 20_000 })
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      assert.notEqual(recovered.result, undefined)
      if (method === "textDocument/rename") assert.deepEqual(recovered.result, { documentChanges: [{
        textDocument: { uri, version: 1 }, edits: [...fixture.caller.matchAll(/PackageTarget/g)].map((match, index) => ({
          newText: index === 0 ? "PackageTarget as LocalTarget" : "LocalTarget", range: {
            start: positionAt(fixture.caller, match.index), end: positionAt(fixture.caller, match.index + "PackageTarget".length) } })) }] })
      if (method === "textDocument/prepareCallHierarchy") assert.deepEqual(recovered.result, prepared.result)
      if (method === "callHierarchy/outgoingCalls") assert.deepEqual(recovered.result, outgoing.result)
      if (method === "callHierarchy/incomingCalls") assert.deepEqual(recovered.result, [{
        from: prepared.result[0], fromRanges: outgoing.result[0].fromRanges }])
    }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => ids.has(message.id)), "one terminal response per cancelled request")
  })

test("L07 SDK configuration switches reject every old edit/call proof and recover complete latest payloads and diagnostics",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t), nextSdk = path.join(fixture.directory, "sdk-next")
    fs.mkdirSync(path.join(nextSdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(nextSdk, "toolchains"))
    fs.writeFileSync(path.join(nextSdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
    for (const [sdk, type] of [[fixture.sdk, "number"], [nextSdk, "string"]]) {
      fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"),
        `interface FixtureAmbient {}\ndeclare const sdkValue: ${type}\n`)
    }
    fixture.caller += "export const sdkBroken: number = sdkValue\n"
    fs.writeFileSync(path.join(fixture.workspace, "ZPackageCaller.ets"), fixture.caller)
    const configuration = path.join(fixture.workspace, "local.properties")
    const overlay = `// current SDK-bound caller 😀\n${fixture.caller}`, uri = fixture.uri("ZPackageCaller.ets")
    const queryAll = async (session, source) => {
      const ask = async (method, params) => {
        const result = await session.request(method, params, { timeoutMs: 20_000 })
        assert.equal(result.error, undefined, JSON.stringify(result.error))
        return result.result
      }
      const offset = source.lastIndexOf("PackageTarget")
      const params = { textDocument: { uri }, position: positionAt(source, offset + 1) }
      const prepareRename = await ask("textDocument/prepareRename", params)
      assert.deepEqual(prepareRename, { placeholder: "PackageTarget", range: {
        start: positionAt(source, offset), end: positionAt(source, offset + "PackageTarget".length) } })
      const rename = await ask("textDocument/rename", { ...params, newName: "LocalTarget" })
      assert.deepEqual(rename, { documentChanges: [{ textDocument: { uri, version: session.documentVersions.get(uri) },
        edits: [...source.matchAll(/PackageTarget/g)].map((match, index) => ({
          newText: index === 0 ? "PackageTarget as LocalTarget" : "LocalTarget", range: {
          start: positionAt(source, match.index), end: positionAt(source, match.index + "PackageTarget".length) } })) }] })
      const prepared = await ask("textDocument/prepareCallHierarchy", { textDocument: { uri },
        position: positionAt(source, source.indexOf("function caller") + "function ".length + 1) })
      assert.deepEqual(prepared, [packageCallerItem(fixture, source)])
      const callRange = { start: positionAt(source, source.lastIndexOf("work()")),
        end: positionAt(source, source.lastIndexOf("work()") + "work".length) }
      const outgoing = await ask("callHierarchy/outgoingCalls", { item: prepared[0] })
      assert.deepEqual(outgoing, [{ to: packageWorkItem(fixture, 0), fromRanges: [callRange] }])
      const incoming = await ask("callHierarchy/incomingCalls", { item: outgoing[0].to })
      assert.deepEqual(incoming, [{ from: prepared[0], fromRanges: [callRange] }])
      return { prepareRename, rename, prepared, outgoing, incoming }
    }
    fs.writeFileSync(configuration, `sdk.dir=${nextSdk}\n`)
    const cold = await startEditCallSession(t, fixture, false, {}, {})
    cold.openDocument({ uri, version: 1, text: fixture.caller })
    cold.changeDocument({ uri, version: 2, text: overlay })
    const oracle = await queryAll(cold, overlay)
    const coldDiagnostics = (await diagnostic(cold, uri, 2)).params.diagnostics
    assert.deepEqual(coldDiagnostics.map(({ code, range }) => ({ code, range })), [{ code: 2322, range: {
      start: positionAt(overlay, overlay.indexOf("sdkBroken")), end: positionAt(overlay, overlay.indexOf("sdkBroken") + "sdkBroken".length) } }])
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fs.writeFileSync(configuration, `sdk.dir=${fixture.sdk}\n`)
    const session = await startEditCallSession(t, fixture, true, {}, {})
    await warmEditCallSession(session, fixture)
    const before = await queryAll(session, fixture.caller)
    fs.writeFileSync(configuration, `sdk.dir=${nextSdk}\n`)
    const params = { textDocument: { uri }, position: positionAt(fixture.caller, fixture.caller.lastIndexOf("PackageTarget") + 1) }
    for (const [method, request] of [["textDocument/prepareRename", params],
      ["textDocument/rename", { ...params, newName: "LocalTarget" }],
      ["textDocument/prepareCallHierarchy", { textDocument: { uri },
        position: positionAt(fixture.caller, fixture.caller.indexOf("function caller") + "function ".length + 1) }],
      ["callHierarchy/outgoingCalls", { item: before.prepared[0] }],
      ["callHierarchy/incomingCalls", { item: before.outgoing[0].to }]]) {
      const rejected = await session.request(method, request, { timeoutMs: 20_000 })
      assert.equal(rejected.error?.code, -32803, `${method}: ${JSON.stringify(rejected)}`)
      assert.equal(rejected.result, undefined)
    }
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(configuration).href, type: 2 }] } })
    session.changeDocument({ uri, version: 2, text: overlay })
    assert.deepEqual(await queryAll(session, overlay), oracle)
    assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics, coldDiagnostics)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 selected policy witnesses actual unqueried rename and call preparation Program reuse",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t), session = await startEditCallSession(t, fixture)
    await warmEditCallSession(session, fixture)
    const uri = fixture.uri("ZPackageCaller.ets")
    const query = async (method, params) => {
      const result = await session.request(method, params, { timeoutMs: 20_000 })
      assert.equal(result.error, undefined, JSON.stringify(result.error))
      return result.result
    }
    const renamePosition = positionAt(fixture.caller, fixture.caller.lastIndexOf("PackageTarget") + 1)
    const renameParams = { textDocument: { uri }, position: renamePosition }
    await query("textDocument/prepareRename", renameParams)
    const rename = await query("textDocument/rename", { ...renameParams, newName: "LocalTarget" })
    assert.deepEqual(rename.documentChanges.map(change => change.textDocument), [{ uri, version: 1 }])
    const items = await query("textDocument/prepareCallHierarchy", { textDocument: { uri },
      position: positionAt(fixture.caller, fixture.caller.indexOf("function caller") + "function ".length + 1) })
    assert.deepEqual(items, [packageCallerItem(fixture)])
    const outgoing = await query("callHierarchy/outgoingCalls", { item: items[0] })
    assert.equal(outgoing.length, 1)
    assert.deepEqual(outgoing[0].to, packageWorkItem(fixture, 0))
    const incoming = await query("callHierarchy/incomingCalls", { item: outgoing[0].to })
    assert.equal(incoming.length, 1)
    assert.deepEqual(incoming[0].from, packageCallerItem(fixture))
    const events = readEvents(fixture)
    const warm = events.find(event => event.event === "semantic.implementation.complete")
    assert.ok(warm?.programSequence > 0 && warm.programProjectFiles >= 279)
    for (const kind of ["prepareRename", "rename", "prepareCallHierarchy", "outgoingCalls", "incomingCalls"]) {
      const traces = events.filter(event => event.event === `semantic.${kind}.complete`)
      assert.equal(traces.length, 1, `${kind} has one actual post-query Program observation`)
      assert.ok(traces[0].collectorAvailable && traces[0].programProjectFiles >= 279)
      if (kind === "prepareRename" || kind === "prepareCallHierarchy") {
        assert.equal(traces[0].programSequence, warm.programSequence, kind)
        assert.equal(traces[0].createProgramEvents, 0, kind)
        assert.equal(traces[0].createProgramMs, 0, kind)
      }
    }
    assert.ok(!events.some(event => event.event === "references.cache.hit" || event.event === "references.batch.start"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 unnotified package retarget cannot retain stale incoming callers on an unchanged declaration",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t), uri = fixture.uri("shared/First.ets")
    const source = fixture.entries[0]
    const prepare = async session => {
      session.openDocument({ uri, version: 1, text: source })
      const response = await session.request("textDocument/prepareCallHierarchy", { textDocument: { uri },
        position: positionAt(source, source.indexOf("function work") + "function ".length + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [packageWorkItem(fixture, 0)])
      return response.result[0]
    }
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const cold = await startEditCallSession(t, fixture, false)
    const oracle = await cold.request("callHierarchy/incomingCalls", { item: await prepare(cold) }, { timeoutMs: 20_000 })
    assert.equal(oracle.error, undefined, JSON.stringify(oracle.error))
    assert.deepEqual(oracle.result, [])
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fs.writeFileSync(fixture.manifest, "{ main: 'First.ets' }")
    const session = await startEditCallSession(t, fixture)
    await warmEditCallSession(session, fixture)
    const item = await prepare(session)
    const before = await session.request("callHierarchy/incomingCalls", { item }, { timeoutMs: 20_000 })
    assert.equal(before.error, undefined, JSON.stringify(before.error))
    assert.deepEqual(before.result, [{ from: packageCallerItem(fixture), fromRanges: [{
      start: positionAt(fixture.caller, fixture.caller.lastIndexOf("work()")),
      end: positionAt(fixture.caller, fixture.caller.lastIndexOf("work()") + "work".length) }] }])
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const stale = await session.request("callHierarchy/incomingCalls", { item }, { timeoutMs: 20_000 })
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    assert.equal(stale.result, undefined)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(fixture.manifest).href, type: 2 }] } })
    const recovered = await session.request("callHierarchy/incomingCalls", { item }, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result, oracle.result)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 unnotified package retarget cannot publish an old outgoing edge from a genuine caller item",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t), uri = fixture.uri("ZPackageCaller.ets")
    const prepare = async session => {
      const response = await session.request("textDocument/prepareCallHierarchy", { textDocument: { uri },
        position: positionAt(fixture.caller, fixture.caller.indexOf("function caller") + "function ".length + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [packageCallerItem(fixture)])
      return response.result[0]
    }
    const callRange = { start: positionAt(fixture.caller, fixture.caller.lastIndexOf("work()")),
      end: positionAt(fixture.caller, fixture.caller.lastIndexOf("work()") + "work".length) }
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const cold = await startEditCallSession(t, fixture, false)
    cold.openDocument({ uri, version: 1, text: fixture.caller })
    const coldItem = await prepare(cold)
    const oracle = await cold.request("callHierarchy/outgoingCalls", { item: coldItem }, { timeoutMs: 20_000 })
    assert.equal(oracle.error, undefined, JSON.stringify(oracle.error))
    assert.deepEqual(oracle.result, [{ to: packageWorkItem(fixture, 1), fromRanges: [callRange] }])
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fs.writeFileSync(fixture.manifest, "{ main: 'First.ets' }")
    const session = await startEditCallSession(t, fixture)
    await warmEditCallSession(session, fixture)
    const item = await prepare(session)
    const before = await session.request("callHierarchy/outgoingCalls", { item }, { timeoutMs: 20_000 })
    assert.equal(before.error, undefined, JSON.stringify(before.error))
    assert.deepEqual(before.result, [{ to: packageWorkItem(fixture, 0), fromRanges: [callRange] }])
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const stale = await session.request("callHierarchy/outgoingCalls", { item }, { timeoutMs: 20_000 })
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    assert.equal(stale.result, undefined)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(fixture.manifest).href, type: 2 }] } })
    const recovered = await session.request("callHierarchy/outgoingCalls", { item: await prepare(session) },
      { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result, oracle.result)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 unnotified package retarget cannot publish a stale prepareCallHierarchy item",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t), uri = fixture.uri("ZPackageCaller.ets")
    const params = { textDocument: { uri }, position: positionAt(fixture.caller, fixture.caller.lastIndexOf("work()") + 1) }
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const cold = await startEditCallSession(t, fixture, false)
    cold.openDocument({ uri, version: 1, text: fixture.caller })
    const oracle = await cold.request("textDocument/prepareCallHierarchy", params, { timeoutMs: 20_000 })
    assert.equal(oracle.error, undefined, JSON.stringify(oracle.error))
    assert.deepEqual(oracle.result, [packageWorkItem(fixture, 1)])
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fs.writeFileSync(fixture.manifest, "{ main: 'First.ets' }")
    const session = await startEditCallSession(t, fixture)
    await warmEditCallSession(session, fixture)
    const before = await session.request("textDocument/prepareCallHierarchy", params, { timeoutMs: 20_000 })
    assert.equal(before.error, undefined, JSON.stringify(before.error))
    assert.deepEqual(before.result, [packageWorkItem(fixture, 0)])
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const stale = await session.request("textDocument/prepareCallHierarchy", params, { timeoutMs: 20_000 })
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    assert.equal(stale.result, undefined)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(fixture.manifest).href, type: 2 }] } })
    const recovered = await session.request("textDocument/prepareCallHierarchy", params, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result, oracle.result)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 unnotified package retarget rejects stale rename edits and recovers the complete current set",
  { timeout: 60_000 }, async t => {
    const fixture = createEditCallFixture(t)
    const origin = fixture.entries[0], uri = fixture.uri("shared/First.ets")
    const offset = origin.indexOf("PackageTarget")
    const params = { textDocument: { uri }, position: positionAt(origin, offset + 1), newName: "UpdatedTarget" }
    const expected = { documentChanges: [{ textDocument: { uri, version: 1 }, edits: [{
      range: { start: positionAt(origin, offset), end: positionAt(origin, offset + "PackageTarget".length) },
      newText: "UpdatedTarget" }] }] }
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const cold = await startEditCallSession(t, fixture, false)
    cold.openDocument({ uri, version: 1, text: origin })
    const oracle = await cold.request("textDocument/rename", params, { timeoutMs: 20_000 })
    assert.equal(oracle.error, undefined, JSON.stringify(oracle.error))
    assert.deepEqual(oracle.result, expected)
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    fs.writeFileSync(fixture.manifest, "{ main: 'First.ets' }")
    const session = await startEditCallSession(t, fixture)
    await warmEditCallSession(session, fixture)
    session.openDocument({ uri, version: 1, text: origin })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    const before = await session.request("textDocument/rename", params, { timeoutMs: 20_000 })
    assert.equal(before.error, undefined, JSON.stringify(before.error))
    assert.ok(before.result.documentChanges.some(change => change.textDocument.uri === fixture.uri("ZPackageCaller.ets")))
    fs.writeFileSync(fixture.manifest, "{ main: 'Second.ets' }")
    const stale = await session.request("textDocument/rename", params, { timeoutMs: 20_000 })
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    assert.equal(stale.result, undefined)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(fixture.manifest).href, type: 2 }] } })
    const recovered = await session.request("textDocument/rename", params, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result, oracle.result)
    session.changeDocument({ uri: fixture.uri("ZPackageCaller.ets"), version: 2, text: fixture.caller })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZPackageCaller.ets"), 2)).params.diagnostics
      .map(({ code, range }) => ({ code, range })), [{ code: 2322, range: {
        start: positionAt(fixture.caller, fixture.caller.indexOf("broken")),
        end: positionAt(fixture.caller, fixture.caller.indexOf("broken") + "broken".length) } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
