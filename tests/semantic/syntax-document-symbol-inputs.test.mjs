import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"

const observer = { NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/syntax-symbol-input-race.cjs"))}` }
const events = f => fs.readFileSync(path.join(f.directory, "syntax-symbol-events.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
const symbols = (f, uri) => f.session.request("textDocument/documentSymbol", { textDocument: { uri } })

for (const completeSdk of [false, true])
for (const stage of ["after-symbols", "final-entry"])
for (const kind of ["unrelated", "replace", "sdk"])
  test(`syntax symbol input fence ${kind}/${stage} (completeSdk=${completeSdk})`, { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, observer)
    if (completeSdk) {
      const file = path.join(f.workspace, "build-profile.json5"), profile = JSON.parse(fs.readFileSync(file, "utf8"))
      profile.app.products[0].compileSdkVersion = 24
      fs.writeFileSync(file, JSON.stringify(profile))
    }
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    const terminal = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    assert.equal(terminal.params.report.semanticState, completeSdk ? "ready" : "partial")
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text: main })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 1, 10_000)
    const warm = await symbols(f, uri)
    assert.equal(warm.error, undefined, JSON.stringify(warm))
    assert.ok(warm.result.some(item => item.name === "global"))
    const file = kind === "sdk" ? path.join(f.sdk, "ets/oh-uni-package.json")
      : path.join(sourceRoot, kind === "replace" ? "Main.ets" : "Unused80.ts")
    fs.writeFileSync(path.join(f.directory, "arm-syntax-symbol.json"), JSON.stringify({ kind, stage, file }))
    const raced = await symbols(f, uri)
    assert.equal(events(f).filter(row => row.event === "mutated").length, 1)
    if (kind === "unrelated") {
      assert.equal(raced.error, undefined, JSON.stringify(raced))
      assert.deepEqual(raced.result, warm.result, "unconsumed source changes must not reject a syntax-only result")
    } else {
      assert.equal(raced.error?.code, -32803, JSON.stringify(raced))
      assert.equal(raced.result, undefined, "original physical/SDK proof must survive through the final boundary")
    }
    const recovered = await symbols(f, uri)
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, warm.result)
    const observed = events(f)
    t.diagnostic(JSON.stringify({ kind, stage, completeSdk, observed }))
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("syntax cache switches files without retaining historical target proofs and releases its current owner on close",
  { timeout: 40_000 }, async t => {
    const { f, folder, sourceRoot, main } = createSdkPartialScopeFixture(t, undefined, observer)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const first = f.uri(`${folder}/Main.ets`), second = f.uri(`${folder}/Box.ets`)
    for (const [uri, text] of [[first, main], [second, "export class Box {}\n"]]) {
      f.session.openDocument({ uri, version: 1, text })
      await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 1, 10_000)
      const result = await symbols(f, uri)
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.ok(result.result.length > 0)
    }
    fs.unlinkSync(path.join(sourceRoot, "Main.ets"))
    const repeated = await symbols(f, second)
    assert.equal(repeated.error, undefined, JSON.stringify(repeated))
    assert.ok(repeated.result.some(item => item.name === "Box"))
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: first } } })
    assert.equal((await symbols(f, second)).error, undefined)
    const before = events(f).filter(row => row.event === "symbols")
    assert.equal(new Set(before.map(row => row.owner)).size, 1)
    assert.equal(new Set(before.map(row => row.retainedPathFacts)).size, 1,
      "target path proofs belong to requests, not the retained parser configuration")
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: second } } })
    f.session.openDocument({ uri: second, version: 1, text: "export class Box {}\n" })
    assert.equal((await symbols(f, second)).error, undefined)
    const after = events(f), last = after.filter(row => row.event === "symbols").at(-1)
    assert.notEqual(last.owner, before[0].owner)
    assert.ok(after.some(row => row.event === "disposed" && row.owner === before[0].owner))
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("real client cancellation interrupts syntax mapping without publishing a partial tree or retiring the Worker",
  { timeout: 40_000 }, async t => {
    const { f, folder } = createSdkPartialScopeFixture(t, undefined, observer)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, capabilities: {
      ...f.session.capabilities, textDocument: { ...f.session.capabilities.textDocument,
        documentSymbol: { hierarchicalDocumentSymbolSupport: true } } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`)
    const text = Array.from({ length: 400 }, (_, i) => `export class SyntaxItem${i} { value: number = ${i} }`).join("\n")
    f.session.openDocument({ uri, version: 1, text })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 1, 10_000)
    const warm = await symbols(f, uri)
    assert.equal(warm.error, undefined, JSON.stringify(warm))
    assert.equal(warm.result.length, 400)
    for (const [i, item] of warm.result.entries()) {
      assert.equal(item.name, `SyntaxItem${i}`)
      assert.equal(item.children.length, 1)
      assert.equal(item.children[0].name, "value")
    }
    fs.writeFileSync(path.join(f.directory, "arm-syntax-cancel"), "armed")
    const id = f.session.nextRequestId++
    f.session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/documentSymbol", params: { textDocument: { uri } } })
    const deadline = Date.now() + 3000
    while (!fs.existsSync(path.join(f.directory, "syntax-cancel-entered"))) {
      assert.ok(Date.now() < deadline, "actual mapping barrier must be entered")
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await f.session.transport.response(id, 5000)
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    const retry = await symbols(f, uri)
    assert.equal(retry.error, undefined, JSON.stringify(retry))
    assert.deepEqual(retry.result, warm.result)
    assert.equal(f.events().filter(row => row.event === "semantic.worker.started").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })


test("syntax services use the owned official factory without Program roots and settle their registry owner on close",
  { timeout: 40_000 }, async t => {
    const { f, folder, main } = createSdkPartialScopeFixture(t, undefined, observer)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 20_000)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text: main })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === uri && m.params.version === 1, 10_000)
    const warm = await symbols(f, uri)
    assert.equal(warm.error, undefined, JSON.stringify(warm))
    assert.ok(warm.result.some(item => item.name === "global"))
    assert.equal(events(f).filter(row => row.event === "factory" && row.mode === 2).length, 1,
      "syntax-only mode must retain the same official factory and registry lease cleanup boundary")
    assert.deepEqual((await symbols(f, uri)).result, warm.result)
    assert.equal(events(f).filter(row => row.event === "factory" && row.mode === 2).length, 1)
    f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
    f.session.openDocument({ uri, version: 1, text: main })
    assert.deepEqual((await symbols(f, uri)).result, warm.result)
    const observed = events(f)
    assert.equal(observed.filter(row => row.event === "factory" && row.mode === 2).length, 2)
    assert.equal(observed.filter(row => row.event === "syntax-registry-owner-released").length, 1)
    assert.equal(observed.filter(row => row.event === "syntax-root-enumeration").length, 0)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
    assert.equal(events(f).filter(row => row.event === "syntax-registry-owner-released").length, 2)
  })
