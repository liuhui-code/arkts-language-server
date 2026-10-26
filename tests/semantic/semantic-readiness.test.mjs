import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createReadinessFixture, startReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

const require = createRequire(import.meta.url)

test("an immediate ordinary body edit query certifies its new overlay without another preparation",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, workspace, sources, uri, events } = await startReadinessFixture(t,
      { ARKTS_SEMANTIC_QUEUE_TRACE: "1" })
    const original = sources["Main.ets"] + "export function count(): number { return 1 }\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), original)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: original })
    const initial = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(initial.result?.semanticState, "ready", JSON.stringify(initial))
    const edited = original.replace("return 1", "return 2")
    session.changeDocument({ uri: uri("Main.ets"), version: 2, text: edited })
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") },
      position: positionAt(edited, edited.lastIndexOf("neverQueried") + 1),
    }, { timeoutMs: 5_000 })
    assert.equal(definition.error, undefined, JSON.stringify(definition))
    assert.deepEqual(definition.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    const certifications = () => events().filter(entry => entry.event === "semantic.readiness.query.certification.complete")
    const queryCertifications = certifications()
    assert.equal(queryCertifications.length, 1, "the original ordinary query must retain its complete certification cost")
    const receipt = queryCertifications[0]
    assert.equal(receipt.uri, uri("Main.ets"))
    assert.equal(receipt.documentVersion, 2)
    assert.equal(receipt.rootUri, rootUri)
    assert.equal(receipt.outcome, "complete")
    assert.equal(receipt.queryScopeSemanticState, "ready")
    assert.equal(Object.hasOwn(receipt, "semanticState"), false, "trace is not the public root-readiness result")
    assert.ok(Number.isFinite(receipt.startedMonotonicMs) && receipt.startedMonotonicMs >= 0)
    assert.ok(receipt.finishedMonotonicMs >= receipt.startedMonotonicMs)
    assert.equal(receipt.certificationDurationMs, receipt.finishedMonotonicMs - receipt.startedMonotonicMs)
    assert.ok(receipt.certificationDurationMs > 0)
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.notEqual(current.result.semanticGeneration, initial.result.semanticGeneration)
    assert.notEqual(current.result.inputIdentity.sha256, initial.result.inputIdentity.sha256)
    assert.notEqual(current.result.inputIdentity.sourcesSha256, initial.result.inputIdentity.sourcesSha256)
    assert.notEqual(current.result.inputIdentity.overlaysSha256, initial.result.inputIdentity.overlaysSha256)
    assert.deepEqual(current.result.coverage, initial.result.coverage)
    assert.deepEqual(current.result.readyCapabilities, initial.result.readyCapabilities)
    const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostics.params.diagnostics, [])
    assert.equal(fs.readFileSync(path.join(workspace, "Main.ets"), "utf8"), original)
    assert.equal(certifications().length, 1, "status and normal diagnostics must not start another query certification")
    t.diagnostic(JSON.stringify({ qualification: "PRIVATE_SDK_ORDINARY_QUERY_FULL_CERTIFICATION_NOT_PRODUCT_SLO",
      receipt, currentReadiness: current.result, definition: definition.result, latestDiagnostics: diagnostics.params }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an edited missing dependency stays degraded and its immediate repaired query recertifies current inputs",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, workspace, sources, uri } = await startReadinessFixture(t)
    const original = sources["Main.ets"] + "export const marker = 1\nexport const selected = marker\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), original)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: original })
    const initial = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(initial.result?.semanticState, "ready", JSON.stringify(initial))
    const missing = original + "import type { Absent } from './AbsentInput'\n"
    session.changeDocument({ uri: uri("Main.ets"), version: 2, text: missing })
    const query = text => session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
      position: positionAt(text, text.lastIndexOf("marker") + 1) }, { timeoutMs: 5_000 })
    const expected = [{ uri: uri("Main.ets"), range: {
      start: { line: 2, character: 13 }, end: { line: 2, character: 19 },
    } }]
    const degradedQuery = await query(missing)
    assert.equal(degradedQuery.error, undefined, JSON.stringify(degradedQuery))
    assert.deepEqual(degradedQuery.result, expected)
    const degraded = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(degraded.result?.semanticState, "degraded", JSON.stringify(degraded))
    assert.equal(degraded.result.semanticGeneration, null)
    assert.deepEqual(degraded.result.readyCapabilities, [])
    assert.equal(degraded.result.unavailableInput?.code, 2307)
    assert.match(degraded.result.unavailableInput.message, /AbsentInput/)
    const missingDiagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 2, 10_000)
    assert.ok(missingDiagnostic.params.diagnostics.some(item => item.code === 2307))
    const repaired = original.replace("marker = 1", "marker = 2")
    session.changeDocument({ uri: uri("Main.ets"), version: 3, text: repaired })
    const startedAt = performance.now()
    const repairedQuery = await query(repaired)
    t.diagnostic(JSON.stringify({ repairedCompleteResponseMs: performance.now() - startedAt }))
    assert.equal(repairedQuery.error, undefined, JSON.stringify(repairedQuery))
    assert.deepEqual(repairedQuery.result, expected)
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.notEqual(current.result.semanticGeneration, initial.result.semanticGeneration)
    assert.notEqual(current.result.inputIdentity.sha256, initial.result.inputIdentity.sha256)
    assert.deepEqual(current.result.coverage, initial.result.coverage)
    const normalDiagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 3, 10_000)
    assert.deepEqual(normalDiagnostic.params.diagnostics, [])
    assert.equal(fs.readFileSync(path.join(workspace, "Main.ets"), "utf8"), original)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L08 complete SDK definitions bound expected missing-path lstat exception allocations",
  { timeout: 30_000 }, async t => {
    const preload = path.join(projectRoot, "tests/fixtures/semantic-lstat-absence-counter.cjs")
    const fixture = createReadinessFixture(t, { NODE_OPTIONS: `--require=${JSON.stringify(preload)}` })
    const { session, sdk, workspace } = fixture
    const api = path.join(sdk, "ets", "api")
    fs.mkdirSync(api)
    const declarations = Array.from({ length: 40 }, (_, index) => `ProbeValue${index}`)
    for (const [index, name] of declarations.entries()) {
      fs.writeFileSync(path.join(api, `@ohos.absence${index}.d.ts`),
        `import type { Aux${index} } from './Aux${index}'\nexport declare class ${name} { value: Aux${index} }\n`)
      fs.writeFileSync(path.join(api, `Aux${index}.d.ts`), `export type Aux${index} = number\n`)
    }
    const source = declarations.map((name, index) =>
      `import { ${name} } from '@ohos.absence${index}'`).join("\n")
      + "\nexport const selected = new ProbeValue39()\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    await session.initialize({ initializationOptions: { sdk: { path: sdk } } })
    const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
    const uri = fixture.uri("Main.ets")
    session.openDocument({ uri, version: 1, text: source })
    const response = await session.request("textDocument/definition", { textDocument: { uri },
      position: positionAt(source, source.lastIndexOf("ProbeValue39") + 1) }, { timeoutMs: 5_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual(response.result, [{ uri: new URL(`file://${path.join(api, "@ohos.absence39.d.ts")}`).href,
      range: { start: { line: 1, character: 21 }, end: { line: 1, character: 33 } } }])
    const counters = fs.readdirSync(fixture.directory).filter(name => /^lstat-absence-\d+\.json$/.test(name))
      .map(name => JSON.parse(fs.readFileSync(path.join(fixture.directory, name), "utf8")))
      .filter(counter => counter.pid === session.transport.child.pid && counter.threadId > 0)
    assert.ok(counters.some(counter => counter.sdkCalls >= 128), "actual semantic Worker must exercise the SDK filesystem")
    const exceptions = counters.reduce((sum, counter) => sum + counter.enoentExceptions, 0)
    assert.ok(exceptions <= 64, `complete SDK query allocated ${exceptions} expected lstat ENOENT errors`)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("the exact missing Settings SDK module resolves when its declaration is actually present, not via a fake ready fallback",
  { timeout: 30_000 }, async t => {
    // Synthetic SDK counterfactual only; never added to the real SDK or product evidence.
    const { session, rootUri, sdk, workspace, uri } = await startReadinessFixture(t)
    const source = "import DataShareResultSet from '@ohos.data.DataShareResultSet'\n"
      + "export function size(result: DataShareResultSet): number { return result.rowCount }\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    const missing = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(missing.result?.semanticState, "partial", JSON.stringify(missing))
    assert.equal(missing.result.unavailableInput?.code, 2307)
    assert.match(missing.result.unavailableInput.message, /@ohos.data.DataShareResultSet/)
    const api = path.join(sdk, "ets", "api")
    fs.mkdirSync(api)
    const declaration = path.join(api, "@ohos.data.DataShareResultSet.d.ts")
    const declarationText = "export default class DataShareResultSet { readonly rowCount: number }\n"
    fs.writeFileSync(declaration, declarationText)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: sdk } } } } })
    const complete = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(complete.result?.semanticState, "ready", JSON.stringify(complete))
    assert.equal(complete.result.unavailableInput, null)
    assert.equal(complete.result.coverage.sdkSources, 2)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: source })
    const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(diagnostics.params.diagnostics, [])
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") }, position: positionAt(source, source.indexOf("rowCount") + 1),
    })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    const offset = declarationText.indexOf("rowCount")
    assert.deepEqual(definition.result, [{ uri: new URL(`file://${declaration}`).href,
      range: { start: positionAt(declarationText, offset), end: positionAt(declarationText, offset + "rowCount".length) } }])
  })

test("malformed, foreign-root and target-bearing readiness requests cannot force preparation and shutdown rejects status",
  { timeout: 20_000 }, async t => {
    const { session, rootUri, events } = await startReadinessFixture(t)
    const preparations = events().filter(e => e.event === "semantic.readiness.input-check.start").length
    for (const params of [null, [], {}, { rootUri, prepare: "true" },
      { rootUri: "file:///unconfigured-workspace", prepare: true },
      { rootUri, prepare: true, symbol: "neverQueried" },
      { rootUri, prepare: true, position: { line: 0, character: 0 } },
      { rootUri, prepare: true, targetPool: ["neverQueried"] }]) {
      const response = await session.request("arkts/semanticReadiness", params)
      assert.equal(response.error?.code, -32602, JSON.stringify(response))
      assert.equal(response.result, undefined)
    }
    assert.equal(events().filter(e => e.event === "semantic.readiness.input-check.start").length, preparations,
      "malformed requests cannot trigger additional preparation")
    assert.equal((await session.request("shutdown", null)).error, undefined)
    const stopped = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(stopped.error?.code, -32600, JSON.stringify(stopped))
    assert.equal(stopped.result, undefined)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an unnotified oversized source makes full membership partial instead of publishing a ready Program",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, workspace } = await startReadinessFixture(t)
    fs.writeFileSync(path.join(workspace, "Oversized.ets"), "//" + "x".repeat(4 * 1024 * 1024))
    const response = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.equal(response.result.semanticState, "degraded", JSON.stringify(response.result))
    assert.equal(response.result.semanticGeneration, null)
    assert.deepEqual(response.result.readyCapabilities, [])
    assert.deepEqual(response.result.unavailableReasons, ["project-membership-incomplete"])
  })

test("SDK identity loss invalidates ready and explicit reconfiguration binds new actual metadata",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, sdk } = await startReadinessFixture(t)
    const initial = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(initial.result?.semanticState, "ready", JSON.stringify(initial))
    const metadata = path.join(sdk, "ets", "oh-uni-package.json")
    fs.writeFileSync(metadata, "{}")
    const invalidated = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.notEqual(invalidated.result?.semanticState, "ready", JSON.stringify(invalidated))
    assert.equal(invalidated.result.semanticGeneration, null)
    const incomplete = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.notEqual(incomplete.result?.semanticState, "ready", JSON.stringify(incomplete))
    fs.writeFileSync(metadata, JSON.stringify({ path: "ets", apiVersion: "24", version: "test-next" }))
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: sdk } } } } })
    const restored = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(restored.result?.semanticState, "ready", JSON.stringify(restored))
    assert.notEqual(restored.result.inputIdentity.sdkSha256, initial.result.inputIdentity.sdkSha256)
    assert.notEqual(restored.result.semanticGeneration, initial.result.semanticGeneration)
  })

for (const [level, action] of [["level2", "trim"], ["level3", "evict"]]) {
test(`actual ${level} ${action} removes the old prepared Program proof and explicit recovery gets a new generation`,
  { timeout: 30_000 }, async t => {
    const { session, rootUri, events } = await startReadinessFixture(t)
    const initial = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(initial.result?.semanticState, "ready", JSON.stringify(initial))
    assert.equal((await session.request("arkts/benchmark/applyMemoryPressure", { level })).error, undefined)
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(current.error, undefined, JSON.stringify(current.error))
    assert.notEqual(current.result.semanticState, "ready")
    assert.equal(current.result.semanticGeneration, null)
    assert.ok(events().some(e => e.event === `semantic.context.${action}` && e.reason === `memory-${level}`),
      "negative status must follow actual compiler state cleanup")
    const restored = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(restored.result?.semanticState, "ready", JSON.stringify(restored))
    assert.notEqual(restored.result.semanticGeneration, initial.result.semanticGeneration)
  })
}

test("early preparation cancellation publishes one terminal error and a new preparation recovers",
  { timeout: 30_000 }, async t => {
    const { session, rootUri } = await startReadinessFixture(t)
    const id = session.nextRequestId++
    session.transport.send({ jsonrpc: "2.0", id, method: "arkts/semanticReadiness", params: { rootUri, prepare: true } })
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await session.transport.response(id, 20_000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    const recovered = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(recovered.result?.semanticState, "ready", JSON.stringify(recovered))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => message.id === id), "no duplicate cancelled terminal")
  })

test("cancelling an entered preparation input check interrupts the compiler and recovery stays exact",
  { timeout: 45_000 }, async t => {
    const fixture = await startReadinessFixture(t)
    const { session, rootUri, workspace, events, sources, uri } = fixture
    const heavyPath = path.join(workspace, "Heavy.ets")
    // A bounded real input with compiler cancellation checkpoints, not a delayed fake query.
    const heavy = Array.from({ length: 5_000 }, (_, i) =>
      `export function checked${i}(value: number): number { return value + ${i} }`).join("\n")
    assert.ok(Buffer.byteLength(heavy) < 2 * 1024 * 1024)
    fs.writeFileSync(heavyPath, heavy)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(heavyPath).href, type: 1 }] } })
    const id = session.nextRequestId++
    session.transport.send({ jsonrpc: "2.0", id, method: "arkts/semanticReadiness", params: { rootUri, prepare: true } })
    const deadline = Date.now() + 20_000
    while (!events().some(e => e.event === "semantic.readiness.input-check.start" && e.sourcePath === heavyPath)) {
      const terminal = session.transport.messages.find(message => message.id === id)
      assert.equal(terminal, undefined, `preparation ended before Heavy.ets entered: ${JSON.stringify(terminal)}`)
      assert.ok(Date.now() < deadline, `the actual Heavy.ets compiler check must start: ${JSON.stringify(events().slice(-4))}`)
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await session.transport.response(id, 20_000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    // A queued status drains the old Worker operation before interpreting its trace.
    const status = await session.request("arkts/semanticReadiness", { rootUri, prepare: false }, { timeoutMs: 20_000 })
    assert.equal(status.error, undefined, JSON.stringify(status.error))
    assert.notEqual(status.result.semanticState, "ready")
    assert.equal(status.result.semanticGeneration, null)
    const checks = events().filter(e => e.sourcePath === heavyPath && e.event.startsWith("semantic.readiness.input-check."))
    assert.ok(checks.some(e => e.event === "semantic.readiness.input-check.interrupted" && e.compilerCancelled === true),
      `cancellation must throw inside Program.getSemanticDiagnostics, not discard a completed check: ${JSON.stringify(checks)}`)
    assert.ok(!checks.some(e => e.event === "semantic.readiness.input-check.complete"))
    const recovered = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(recovered.result?.semanticState, "ready", JSON.stringify(recovered))
    assert.equal(recovered.result.coverage.projectSources, 3)
    const source = sources["Main.ets"] + 'export const ordinaryError: number = "retained diagnostic"\n'
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: source })
    const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.ok(diagnostics.params.diagnostics.some(item => item.code === 2322))
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") }, position: positionAt(source, source.lastIndexOf("neverQueried") + 1),
    })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => message.id === id), "no duplicate cancelled terminal")
  })

test("missing dependency input cannot become ready while ordinary source diagnostics do not erase complete coverage",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, sources, workspace, uri } = await startReadinessFixture(t)
    fs.writeFileSync(path.join(workspace, "Main.ets"), sources["Main.ets"].replace("./Unopened", "./AbsentInput"))
    const missing = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(missing.error, undefined, JSON.stringify(missing.error))
    assert.equal(missing.result.semanticState, "degraded", JSON.stringify(missing.result))
    assert.equal(missing.result.semanticGeneration, null)
    assert.deepEqual(missing.result.readyCapabilities, [])
    assert.ok(missing.result.unavailableReasons.includes("dependency-inputs-incomplete"))
    assert.equal(missing.result.unavailableInput?.uri, uri("Main.ets"))
    assert.equal(missing.result.unavailableInput.code, 2307)
    assert.match(missing.result.unavailableInput.message, /AbsentInput/)
    const source = sources["Main.ets"] + 'export const mistake: number = "ordinary code error"\n'
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: source })
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.ok(diagnostic.params.diagnostics.some(item => item.code === 2322))
    const complete = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(complete.result?.semanticState, "ready", JSON.stringify(complete))
    assert.equal(complete.result.coverage.dependenciesComplete, true)
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") },
      position: positionAt(source, source.lastIndexOf("neverQueried") + 1),
    })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
  })

test("catalog completion cannot certify complete readiness when SDK identity is unproven",
  { timeout: 20_000 }, async t => {
    const fixture = createReadinessFixture(t)
    fs.rmSync(path.join(fixture.sdk, "ets", "oh-uni-package.json"))
    const { session, rootUri, events } = await initializeReadinessFixture(fixture)
    const response = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.equal(response.result.semanticState, "partial")
    assert.equal(response.result.semanticGeneration, null)
    assert.deepEqual(response.result.readyCapabilities, [])
    assert.ok(events().some(e => e.event === "index.catalog.terminal" && e.phase === "ready"))
    assert.deepEqual(response.result.unavailableReasons, ["sdk-inputs-incomplete"])
    assert.deepEqual(response.result.inputIssues, [{ layer: "sdk", reason: "coverage-unproven" }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a process restart with the same validated-ready cache must prepare a new actual Program",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, sdk, events, startSession } = await startReadinessFixture(t)
    const before = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(before.result?.semanticState, "ready", JSON.stringify(before))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const restarted = startSession()
    assert.notEqual(restarted.transport.child.pid, session.transport.child.pid)
    await restarted.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const create = await restarted.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
    restarted.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await restarted.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
    const automatic = await restarted.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
    const status = await restarted.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(status.result?.semanticState, "ready", JSON.stringify(status))
    assert.deepEqual(status.result, automatic.params.report)
    assert.ok(events().some(e => e.pid === restarted.transport.child.pid && e.event === "semantic.readiness.input-check.complete"),
      "the restarted process must actually check compiler inputs, not restore a fake ready proof")
    const restored = await restarted.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(restored.result?.semanticState, "ready", JSON.stringify(restored))
    assert.notEqual(restored.result.semanticGeneration, before.result.semanticGeneration)
    assert.deepEqual(restored.result.inputIdentity, before.result.inputIdentity,
      "unchanged bytes can have the same input identity but must have a distinct process/Program generation")
    assert.deepEqual((await restarted.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an ordinary overlay edit invalidates the old ready proof and refresh binds its current UTF-16 source",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, sources, uri, events } = await startReadinessFixture(t)
    const initial = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(initial.result?.semanticState, "ready", JSON.stringify(initial))
    const targetUri = uri("Unopened.ets")
    session.openDocument({ uri: targetUri, version: 1, text: sources["Unopened.ets"] })
    await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === targetUri && message.params.version === 1, 10_000)
    const current = "/* 😀 */\n" + sources["Unopened.ets"].replace("return 1", "return 4")
    session.changeDocument({ uri: targetUri, version: 2, text: current })
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === targetUri && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    const admissions = events().filter(e => e.event === "semantic.prepare.script-admission").length
    const stale = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(stale.error, undefined, JSON.stringify(stale.error))
    assert.notEqual(stale.result.semanticState, "ready")
    assert.equal(stale.result.semanticGeneration, null)
    assert.deepEqual(stale.result.readyCapabilities, [])
    assert.equal(events().filter(e => e.event === "semantic.prepare.script-admission").length, admissions)
    const refreshed = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(refreshed.result?.semanticState, "ready", JSON.stringify(refreshed))
    assert.notEqual(refreshed.result.semanticGeneration, initial.result.semanticGeneration)
    assert.notEqual(refreshed.result.inputIdentity.sha256, initial.result.inputIdentity.sha256)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    const callerDiagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(callerDiagnostic.params.diagnostics, [])
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") },
      position: positionAt(sources["Main.ets"], sources["Main.ets"].lastIndexOf("neverQueried") + 1),
    })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [{ uri: targetUri, range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
  })

test("target-independent preparation binds a complete current official Program before unseen-module navigation",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, events, sources, uri } = await startReadinessFixture(t)
    const beforePrepare = events().length
    const response = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const ready = response.result
    assert.equal(ready.semanticState, "ready", JSON.stringify(ready))
    assert.equal(typeof ready.semanticGeneration, "string")
    assert.match(ready.inputIdentity.sha256, /^[a-f0-9]{64}$/)
    assert.equal(ready.inputIdentity.backend.packageVersion, require("typescript/package.json").version)
    assert.equal(ready.inputIdentity.backend.compilerSha256,
      createHash("sha256").update(fs.readFileSync(require.resolve("typescript"))).digest("hex"))
    assert.deepEqual(ready.readyCapabilities,
      JSON.parse(fs.readFileSync(path.join(projectRoot, "config/semantic-release-matrix.json"), "utf8")).capabilities)
    assert.equal(ready.coverage.projectSources, 2)
    assert.equal(ready.coverage.sdkSources, 1)
    assert.ok(ready.coverage.standardLibrarySources > 0)
    assert.equal(ready.coverage.dependenciesComplete, true)
    const checks = events().slice(beforePrepare).filter(e => e.event === "semantic.readiness.input-check.start")
    assert.equal(checks.length, ready.coverage.programSources,
      "every actual Program input must enter dependency checking before readiness")
    assert.deepEqual(events().slice(beforePrepare).filter(e => e.event === "semantic.readiness.input-check.complete")
      .map(e => e.sourcePath), checks.map(e => e.sourcePath))
    assert.ok(checks.some(e => e.sourcePath === path.join(fileURLToPath(rootUri), "Unopened.ets")))
    assert.ok(!events().some(e => e.event.endsWith("compiler-query.start")),
      "preparation must not prequery target answers")
    const beforeStatus = events().filter(e => e.event === "semantic.prepare.script-admission").length
    const status = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(status.error, undefined, JSON.stringify(status.error))
    assert.deepEqual(status.result, ready)
    assert.equal(events().filter(e => e.event === "semantic.prepare.script-admission").length, beforeStatus,
      "status must consume the prepared proof without preparing another Program")
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(diagnostics.params.diagnostics, [])
    const offset = sources["Main.ets"].lastIndexOf("neverQueried")
    const definition = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") }, position: positionAt(sources["Main.ets"], offset + 1),
    })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
