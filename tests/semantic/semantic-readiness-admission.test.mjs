import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("a disk definition refreshes its explicit READY session after a watched dependency edit",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, workspace, sources, events } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 } }
    const baseline = await session.request("textDocument/definition", params)
    assert.deepEqual(baseline.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), "// current dependency 👩‍💻\n" + sources["Unopened.ets"])
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    const revoked = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.notEqual(revoked.result?.semanticState, "ready", JSON.stringify(revoked))
    const response = await session.request("textDocument/definition", params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(session.documentVersions.size, 0)
    assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    t.diagnostic(JSON.stringify({ before: prepared.result, revoked: revoked.result, after: current,
      completeLocations: response.result, route: events().filter(event =>
        ["semantic.context.create", "semantic.context.evict", "semantic.prepare.complete"].includes(event.event)) }))
    assert.equal(current.result?.semanticState, "ready", "an ordinary definition must refresh its original explicit-ready session")
    assert.notEqual(current.result.inputIdentity.sourcesSha256, prepared.result.inputIdentity.sourcesSha256)
    assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
    assert.deepEqual(current.result.readyCapabilities, prepared.result.readyCapabilities)
    assert.deepEqual(current.result.coverage, prepared.result.coverage)
  })

test("a diagnostic after a disk edit preserves explicit READY intent for the next ordinary query",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, workspace, sources, events } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const document = { uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] }
    session.openDocument(document)
    const diagnostics = version => session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === document.uri && message.params.version === version, 10_000)
    assert.deepEqual((await diagnostics(1)).params.diagnostics, [])
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    const before = events().length
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), "// current dependency 👩‍💻\n" + sources["Unopened.ets"])
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    session.changeDocument({ ...document, version: 2 })
    assert.deepEqual((await diagnostics(2)).params.diagnostics, [])
    const updating = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.notEqual(updating.result?.semanticState, "ready", "background diagnostics must not certify the root")
    assert.ok(!events().slice(before).some(event => event.event.startsWith("semantic.readiness.input-check.")))
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: document.uri }, position: { line: 1, character: 23 },
    })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(session.documentVersions.has(uri("Unopened.ets")), false)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    t.diagnostic(JSON.stringify({ updating: updating.result, after: current, completeLocations: response.result }))
    assert.equal(current.result?.semanticState, "ready", "diagnostics may not erase the explicit session's future query refresh")
    assert.notEqual(current.result.inputIdentity.sourcesSha256, prepared.result.inputIdentity.sourcesSha256)
    assert.deepEqual(current.result.readyCapabilities, prepared.result.readyCapabilities)
    assert.deepEqual(current.result.coverage, prepared.result.coverage)
  })

for (const opened of [false, true]) {
test(opened ? "an opened caller's unchanged call item refreshes READY after its unopened callee is edited"
  : "an unchanged disk call item refreshes READY after its callee is edited",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, workspace, sources } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const caller = "export function localCaller(): number { return neverQueried() }"
    const main = sources["Main.ets"].split("\n")[0] + "\n" + caller + "\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), main)
    if (opened) {
      session.openDocument({ uri: uri("Main.ets"), version: 1, text: main })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
    }
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    const data = { arktsCallHierarchy: { protocol: 1, rootUri } }
    const item = { name: "localCaller", kind: 12, uri: uri("Main.ets"),
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: caller.length } },
      selectionRange: { start: { line: 1, character: 16 }, end: { line: 1, character: 27 } }, data }
    const hierarchy = await session.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 17 },
    })
    assert.deepEqual(hierarchy.result, [item])
    const offset = caller.indexOf("neverQueried")
    const expected = line => [{ to: { name: "neverQueried", kind: 12, uri: uri("Unopened.ets"),
      range: { start: { line: 0, character: 0 }, end: { line, character: sources["Unopened.ets"].trimEnd().length } },
      selectionRange: { start: { line, character: 16 }, end: { line, character: 28 } }, data },
    fromRanges: [{ start: { line: 1, character: offset }, end: { line: 1, character: offset + 12 } }] }]
    const baseline = await session.request("callHierarchy/outgoingCalls", { item: hierarchy.result[0] })
    assert.deepEqual(baseline.result, expected(0))
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), "// current dependency 👩‍💻\n" + sources["Unopened.ets"])
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    const revoked = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.notEqual(revoked.result?.semanticState, "ready")
    // Independent opened-current control: the compiler's full range includes
    // leading comments while selectionRange starts at the current declaration.
    const control = await startReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0" })
    const currentCallee = "// current dependency 👩‍💻\n" + sources["Unopened.ets"]
    fs.writeFileSync(path.join(control.workspace, "Unopened.ets"), currentCallee)
    control.session.openDocument({ uri: control.uri("Unopened.ets"), version: 1, text: currentCallee })
    const oracle = await control.session.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri: control.uri("Unopened.ets") }, position: { line: 1, character: 17 },
    })
    assert.equal(oracle.error, undefined, JSON.stringify(oracle))
    assert.equal(oracle.result.length, 1)
    const normalized = { ...oracle.result[0], uri: uri("Unopened.ets"), data: { ...oracle.result[0].data,
      arktsCallHierarchy: { ...oracle.result[0].data.arktsCallHierarchy, rootUri } } }
    assert.deepEqual(normalized, expected(1)[0].to)
    assert.deepEqual((await control.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const current = await session.request("callHierarchy/outgoingCalls", { item: hierarchy.result[0] })
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, expected(1), "the unchanged caller item must return the complete current callee")
    const status = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(session.documentVersions.size, opened ? 1 : 0)
    assert.equal(session.documentVersions.has(uri("Unopened.ets")), false)
    if (!opened) assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    t.diagnostic(JSON.stringify({ completeCalls: current.result, status }))
    assert.equal(status.result?.semanticState, "ready", "an ordinary call follow-up must refresh the original explicit READY session")
    assert.notEqual(status.result.inputIdentity.sourcesSha256, prepared.result.inputIdentity.sourcesSha256)
    assert.equal(status.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
    assert.deepEqual(status.result.coverage, prepared.result.coverage)
  })
}

for (const [level, action] of [["level2", "trim"], ["level3", "evict"]]) {
test(`a disk diagnostic's transferred READY intent cannot survive actual ${level} ${action}`,
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, workspace, sources, events } = await startReadinessFixture(t)
    const document = { uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] }
    const diagnostics = version => session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === document.uri && message.params.version === version, 10_000)
    session.openDocument(document)
    assert.deepEqual((await diagnostics(1)).params.diagnostics, [])
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), "// current dependency 👩‍💻\n" + sources["Unopened.ets"])
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    session.changeDocument({ ...document, version: 2 })
    assert.deepEqual((await diagnostics(2)).params.diagnostics, [])
    assert.equal((await session.request("arkts/benchmark/applyMemoryPressure", { level })).error, undefined)
    const pressured = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.notEqual(pressured.result?.semanticState, "ready", JSON.stringify(pressured))
    assert.ok(events().some(event => event.event === `semantic.context.${action}` && event.reason === `memory-${level}`))
    const before = events().length
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: document.uri }, position: { line: 1, character: 23 },
    })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.notEqual(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.ok(!events().slice(before).some(event => event.event.startsWith("semantic.readiness.input-check.")),
      "trim/eviction must clear the transferred intent, not merely hide a newly prepared proof")
    const restored = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(restored.result?.semanticState, "ready", JSON.stringify(restored))
    assert.equal(session.documentVersions.has(uri("Unopened.ets")), false)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

for (const method of ["textDocument/references", "textDocument/definition"]) {
test(method === "textDocument/references"
  ? "cancelling an entered ordinary reference READY refresh interrupts its compiler input check"
  : "cancelling an entered ordinary definition READY refresh interrupts its compiler input check",
  { timeout: 45_000 }, async t => {
    const { session, rootUri, uri, workspace, sources, events } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const heavyPath = path.join(workspace, "Heavy.ets")
    const heavy = Array.from({ length: 5_000 }, (_, i) =>
      `export function checked${i}(value: number): number { return value + ${i} }`).join("\n")
    assert.ok(Buffer.byteLength(heavy) < 2 * 1024 * 1024)
    fs.writeFileSync(heavyPath, heavy)
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    assert.equal(prepared.result.coverage.projectSources, 3)
    fs.writeFileSync(path.join(workspace, "Unopened.ets"),
      sources["Unopened.ets"] + "export const recovered = neverQueried\n")
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    const before = events().length
    const id = session.nextRequestId++
    session.transport.send({ jsonrpc: "2.0", id, method, params: {
      textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration: false },
    } })
    const deadline = Date.now() + 20_000
    while (!events().slice(before).some(event =>
      event.event === "semantic.readiness.input-check.start" && event.sourcePath === heavyPath)) {
      const terminal = session.transport.messages.find(message => message.id === id)
      assert.equal(terminal, undefined, `reference refresh ended before Heavy.ets entered: ${JSON.stringify(terminal)}`)
      assert.ok(Date.now() < deadline, "the ordinary reference must enter the real compiler input check")
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await session.transport.response(id, 20_000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false }, { timeoutMs: 20_000 })
    assert.notEqual(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.equal(current.result.semanticGeneration, null)
    const checks = events().slice(before).filter(event => event.sourcePath === heavyPath
      && event.event.startsWith("semantic.readiness.input-check."))
    assert.ok(checks.some(event => event.event === "semantic.readiness.input-check.interrupted"
      && event.compilerCancelled === true), JSON.stringify(checks))
    assert.ok(!checks.some(event => event.event === "semantic.readiness.input-check.complete"))
    const recovered = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(recovered.result?.semanticState, "ready", JSON.stringify(recovered))
    assert.notEqual(recovered.result.semanticGeneration, prepared.result.semanticGeneration)
    assert.equal(recovered.result.coverage.projectSources, 3)
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => message.id === id), "no duplicate cancelled terminal")
  })
}

test("reference query refresh rejects a missing input and repairs its original explicit READY session",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources, workspace } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const initial = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(initial.result?.semanticState, "ready", JSON.stringify(initial))
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration: false } }
    const uses = [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    ]
    const sorted = locations => [...locations].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    const change = source => {
      fs.writeFileSync(path.join(workspace, "Unopened.ets"), source)
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
        params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    }
    change('import { absent } from "./AbsentInput"\n' + sources["Unopened.ets"])
    const missing = await session.request("textDocument/references", params, { timeoutMs: 20_000 })
    if (missing.error) assert.equal(missing.error.code, -32803, JSON.stringify(missing))
    else assert.deepEqual(sorted(missing.result), sorted(uses))
    const degraded = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(degraded.error, undefined, JSON.stringify(degraded))
    assert.notEqual(degraded.result.semanticState, "ready")
    assert.equal(degraded.result.unavailableInput?.code, 2307, JSON.stringify(degraded))
    assert.deepEqual(degraded.result.readyCapabilities, [])
    change(sources["Unopened.ets"] + "export const recovered = neverQueried\n")
    const recovered = await session.request("textDocument/references", params, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(sorted(recovered.result), sorted([...uses, { uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 25 }, end: { line: 1, character: 37 },
    } }]))
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.notEqual(current.result.inputIdentity.sourcesSha256, initial.result.inputIdentity.sourcesSha256)
    assert.deepEqual(current.result.readyCapabilities, initial.result.readyCapabilities)
    assert.equal(session.documentVersions.size, 0)
    assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("fresh public ready preparation avoids a redundant declaration admission and later status stays fresh",
  { timeout: 30_000 }, async t => {
    const fixture = await startReadinessFixture(t, {
      ARKTS_REFERENCES_TRACE: "0", ARKTS_SEMANTIC_QUEUE_TRACE: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1", ARKTS_BENCHMARK_CONTROL: "0",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/readiness-admission-io.cjs"))}`,
    })
    const { session, rootUri, directory, sdk, uri, sources } = fixture
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    const prepare = () => session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    const initial = await prepare()
    assert.equal(initial.result?.semanticState, "ready", JSON.stringify(initial))
    fs.writeFileSync(path.join(directory, "arm-readiness-admission"), "{}")
    const current = await prepare()
    assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.deepEqual(current.result.readyCapabilities, initial.result.readyCapabilities)
    assert.deepEqual(current.result.coverage, initial.result.coverage)
    assert.deepEqual(current.result.inputIdentity, initial.result.inputIdentity)
    const rows = fs.readFileSync(path.join(directory, "readiness-admission-io.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    t.diagnostic(JSON.stringify({ qualification: "PRIVATE_NATIVE_FS_COUNT_NOT_PRODUCT_TIMING", rows }))
    assert.ok(rows.length > 0 && rows.every(row => row.pid === session.transport.child.pid && row.threadId > 0))
    // Observation retains four native declaration checks; two independent
    // admission fences each retain both configuration and physical identity checks.
    assert.ok(rows.length <= 8,
      `fresh preparation must keep its observation and independent end guards without a redundant return admission: ${rows.length}`)
    fs.appendFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface LateInput {}\n")
    const revoked = await session.request("arkts/semanticReadiness", { rootUri, prepare: false }, { timeoutMs: 5_000 })
    assert.notEqual(revoked.result?.semanticState, "ready")
    assert.deepEqual(revoked.result.readyCapabilities, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("public ready cannot survive a real SDK mutation while its complete identity is constructed",
  { timeout: 30_000 }, async t => {
    const fixture = await startReadinessFixture(t, {
      ARKTS_REFERENCES_TRACE: "0", ARKTS_SEMANTIC_QUEUE_TRACE: "0",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1", ARKTS_BENCHMARK_CONTROL: "0",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/readiness-admission-io.cjs"))}`,
    })
    const { session, rootUri, directory, sdk, uri, sources } = fixture
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    const prepare = () => session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal((await prepare()).result?.semanticState, "ready")
    const declaration = path.join(sdk, "ets", "component", "common.d.ts")
    const original = fs.readFileSync(declaration, "utf8")
    const changed = original.replace("FixtureAmbient", "ChangedAmbient")
    assert.equal(changed.length, original.length)
    assert.notEqual(changed, original)
    fs.writeFileSync(path.join(directory, "mutate-readiness-report-identity"), JSON.stringify({ content: changed }))
    const response = await prepare()
    const witness = JSON.parse(fs.readFileSync(path.join(directory, "readiness-report-identity-mutated.json")))
    assert.equal(witness.pid, session.transport.child.pid)
    assert.ok(witness.threadId > 0)
    assert.equal(witness.boundary, "complete-public-input-identity-hash")
    assert.equal(fs.readFileSync(declaration, "utf8"), changed)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.notEqual(response.result.semanticState, "ready", "the real final guard must follow complete report construction")
    assert.equal(response.result.semanticGeneration, null)
    assert.deepEqual(response.result.readyCapabilities, [])
    fs.writeFileSync(declaration, original)
    const nextSdk = path.join(directory, "sdk-restored")
    fs.cpSync(sdk, nextSdk, { recursive: true })
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: nextSdk } } } } })
    session.changeDocument({ uri: uri("Main.ets"), version: 2, text: sources["Main.ets"] + "// current SDK\n" })
    const recovered = await prepare()
    assert.equal(recovered.result?.semanticState, "ready", JSON.stringify(recovered))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
