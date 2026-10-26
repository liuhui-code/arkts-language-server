import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { canonicalCompletion } from "../support/resident-interactive-lsp.mjs"

test("a ready workspace answers an exact definition from a never-opened source without creating an overlay",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0",
      ARKTS_SEMANTIC_QUEUE_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const prepared = await session.request("arkts/semanticReadiness",
      { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    assert.equal(session.documentVersions.size, 0, "neither source may be opened before the measured request")
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 },
    }, { timeoutMs: 5_000 })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256,
      "a disk query must not silently install an overlay")
    assert.equal(session.documentVersions.size, 0)
    assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"),
      "querying a disk source is not a synthetic didOpen")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a genuine version-zero caller preserves complete outgoing calls instead of taking a disk path",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const caller = "export function localCaller(): number { return neverQueried() }"
    const text = sources["Main.ets"].split("\n")[0] + "\n" + caller + "\n"
    session.openDocument({ uri: uri("Main.ets"), version: 0, text })
    const prepared = await session.request("textDocument/prepareCallHierarchy", {
      textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 17 },
    })
    assert.equal(prepared.error, undefined, JSON.stringify(prepared))
    const data = { arktsCallHierarchy: { protocol: 1, rootUri } }
    assert.deepEqual(prepared.result, [{ name: "localCaller", kind: 12, uri: uri("Main.ets"),
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: caller.length } },
      selectionRange: { start: { line: 1, character: 16 }, end: { line: 1, character: 27 } }, data }])
    const calls = await session.request("callHierarchy/outgoingCalls", { item: prepared.result[0] })
    assert.equal(calls.error, undefined, JSON.stringify(calls))
    const offset = caller.indexOf("neverQueried")
    assert.deepEqual(calls.result, [{ to: { name: "neverQueried", kind: 12, uri: uri("Unopened.ets"),
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: sources["Unopened.ets"].trimEnd().length } },
      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } }, data },
    fromRanges: [{ start: { line: 1, character: offset }, end: { line: 1, character: offset + 12 } }] }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("never-opened call preparation and both follow-ups preserve complete opened-caller results",
  { timeout: 30_000 }, async t => {
    for (const opened of [true, false]) {
      const { session, rootUri, uri, sources, workspace } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const caller = "export function localCaller(): number { return neverQueried() }"
      const text = sources["Main.ets"].split("\n")[0] + "\n" + caller + "\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      const ready = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const prepared = await session.request("textDocument/prepareCallHierarchy", {
        textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 17 },
      })
      assert.equal(prepared.error, undefined, JSON.stringify(prepared))
      const data = { arktsCallHierarchy: { protocol: 1, rootUri } }
      const from = { name: "localCaller", kind: 12, uri: uri("Main.ets"),
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: caller.length } },
        selectionRange: { start: { line: 1, character: 16 }, end: { line: 1, character: 27 } }, data }
      assert.deepEqual(prepared.result, [from])
      const outgoing = await session.request("callHierarchy/outgoingCalls", { item: prepared.result[0] })
      assert.equal(outgoing.error, undefined, JSON.stringify(outgoing))
      const to = { name: "neverQueried", kind: 12, uri: uri("Unopened.ets"),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: sources["Unopened.ets"].trimEnd().length } },
        selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } }, data }
      const offset = caller.indexOf("neverQueried")
      const fromRanges = [{ start: { line: 1, character: offset }, end: { line: 1, character: offset + 12 } }]
      assert.deepEqual(outgoing.result, [{ to, fromRanges }])
      const incoming = await session.request("callHierarchy/incomingCalls", { item: outgoing.result[0].to })
      assert.equal(incoming.error, undefined, JSON.stringify(incoming))
      assert.deepEqual(incoming.result, [{ from, fromRanges }])
      if (!opened) {
        const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
        assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.inputIdentity.overlaysSha256, ready.result.inputIdentity.overlaysSha256)
        assert.equal(session.documentVersions.size, 0)
        assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a real version-zero overlay is not a disk marker and closes back to current disk content",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources, workspace } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    fs.appendFileSync(path.join(workspace, "Unopened.ets"), "export function freshlyBound(): number { return 2 }\n")
    assert.equal((await session.request("arkts/semanticReadiness",
      { rootUri, prepare: true }, { timeoutMs: 20_000 })).result?.semanticState, "ready")
    session.openDocument({ uri: uri("Main.ets"), version: 0,
      text: sources["Main.ets"].replaceAll("neverQueried", "freshlyBound") })
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 } }
    const opened = await session.request("textDocument/definition", params)
    assert.equal(opened.error, undefined, JSON.stringify(opened))
    assert.deepEqual(opened.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: uri("Main.ets") } } })
    session.documentVersions.delete(uri("Main.ets"))
    const closed = await session.request("textDocument/definition", params)
    assert.equal(closed.error, undefined, JSON.stringify(closed))
    assert.deepEqual(closed.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a never-opened hover preserves the complete opened-caller payload and source range",
  { timeout: 30_000 }, async t => {
    let oracle
    for (const opened of [true, false]) {
      const { session, rootUri, uri, sources, workspace } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      fs.writeFileSync(path.join(workspace, "Unopened.ets"),
        "/** Stable disk documentation 😀 */\n" + sources["Unopened.ets"])
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
      const response = await session.request("textDocument/hover", {
        textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      })
      assert.equal(response.error, undefined, JSON.stringify(response))
      if (opened) {
        oracle = response.result
        assert.equal(oracle.contents.kind, "markdown")
        assert.match(oracle.contents.value, /neverQueried/u)
        assert.match(oracle.contents.value, /Stable disk documentation 😀/u)
        assert.deepEqual(oracle.range, { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } })
      } else {
        assert.deepEqual(response.result, oracle, "preserve every hover field from the independent opened-caller oracle")
        const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
        assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
        assert.equal(session.documentVersions.size, 0)
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a never-opened signature preserves the complete opened-caller overload and active parameter",
  { timeout: 30_000 }, async t => {
    let oracle
    for (const opened of [true, false]) {
      const { session, rootUri, uri, workspace } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const line = 'export const result = neverQueried(1, "label")'
      const text = 'import { neverQueried } from "./Unopened"\n' + line + "\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      fs.writeFileSync(path.join(workspace, "Unopened.ets"), "/** Disk signature documentation 😀 */\n"
        + "export function neverQueried(count: number, label: string): number { return count }\n")
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const response = await session.request("textDocument/signatureHelp", {
        textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: line.indexOf(",") + 1 },
        context: { triggerKind: 2, triggerCharacter: ",", isRetrigger: false },
      })
      assert.equal(response.error, undefined, JSON.stringify(response))
      if (opened) {
        oracle = response.result
        assert.equal(oracle.signatures.length, 1)
        assert.equal(oracle.activeSignature, 0)
        assert.equal(oracle.activeParameter, 1)
        assert.match(oracle.signatures[0].label, /neverQueried\(count: number, label: string\): number/u)
        assert.equal(oracle.signatures[0].parameters.length, 2)
        assert.match(JSON.stringify(oracle.signatures[0].documentation), /Disk signature documentation 😀/u)
      } else {
        assert.deepEqual(response.result, oracle, "preserve every signature field from an independent opened caller")
        const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
        assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
        assert.equal(session.documentVersions.size, 0)
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("never-opened member completion preserves every opened-caller item and opaque resolution handle",
  { timeout: 30_000 }, async t => {
    let oracle
    for (const opened of [true, false]) {
      const { session, rootUri, uri, workspace } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const line = 'export const result = instance.run(1, "label")'
      const text = 'import { Widget } from "./Unopened"\nconst instance = new Widget()\n' + line + "\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      fs.writeFileSync(path.join(workspace, "Unopened.ets"), "export class Widget {\n  value: number = 1\n"
        + "  run(count: number, label: string): number { return count + this.value }\n}\n")
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const response = await session.request("textDocument/completion", {
        textDocument: { uri: uri("Main.ets") }, position: { line: 2, character: line.indexOf(".run") + 1 },
      })
      assert.equal(response.error, undefined, JSON.stringify(response))
      const normalized = { ...response.result, items: response.result.items.map(canonicalCompletion) }
      if (opened) {
        oracle = normalized
        assert.equal(oracle.isIncomplete, false)
        assert.deepEqual(oracle.items.map(item => item.label).sort(), ["run", "value"])
      } else {
        assert.deepEqual(normalized, oracle, "only independently validated opaque UUIDs may differ between sessions")
        assert.equal(new Set(response.result.items.map(item => item.data.arktsCompletionId)).size, oracle.items.length)
        const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
        assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
        assert.equal(session.documentVersions.size, 0)
        assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("never-opened completion resolution preserves the opened oracle and binds exact disk source bytes",
  { timeout: 30_000 }, async t => {
    let oracle
    for (const opened of [true, false]) {
      const { session, rootUri, uri, workspace } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const line = "export const result = instance.value"
      const text = 'import { Widget } from "./Unopened"\nconst instance = new Widget()\n' + line + "\n// source alpha\n"
      const file = path.join(workspace, "Main.ets")
      fs.writeFileSync(file, text)
      fs.writeFileSync(path.join(workspace, "Unopened.ets"), "export class Widget {\n"
        + "  /** Disk resolution documentation 😀 */\n  value: number = 1\n}\n")
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 2, character: line.indexOf(".value") + 1 } }
      const list = await session.request("textDocument/completion", params)
      assert.equal(list.error, undefined, JSON.stringify(list))
      assert.deepEqual(list.result.items.map(item => item.label), ["value"])
      const item = list.result.items[0]
      canonicalCompletion(item)
      const resolved = await session.request("completionItem/resolve", { ...item, label: "forged client label" })
      assert.equal(resolved.error, undefined, JSON.stringify(resolved))
      assert.deepEqual(resolved.result.data, item.data)
      const payload = canonicalCompletion(resolved.result)
      if (opened) {
        oracle = payload
        assert.equal(oracle.label, "value")
        assert.match(oracle.detail, /value.*number/u)
        assert.match(JSON.stringify(oracle.documentation), /Disk resolution documentation 😀/u)
      } else {
        assert.deepEqual(payload, oracle, "server-owned completion data, not client fields, defines the entire result")
        const stat = fs.statSync(file)
        const changed = text.replace("alpha", "bravo")
        assert.equal(Buffer.byteLength(changed), Buffer.byteLength(text))
        fs.writeFileSync(file, changed)
        fs.utimesSync(file, stat.atime, stat.mtime)
        const stale = await session.request("completionItem/resolve", item)
        assert.equal(stale.error, undefined, JSON.stringify(stale))
        assert.deepEqual(stale.result, item)
        const fresh = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
        assert.equal(fresh.result?.semanticState, "ready", JSON.stringify(fresh))
        assert.notEqual(fresh.result.inputIdentity.sourcesSha256, prepared.result.inputIdentity.sourcesSha256)
        assert.equal(fresh.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
        const next = await session.request("textDocument/completion", params)
        assert.equal(next.error, undefined, JSON.stringify(next))
        assert.deepEqual(next.result.items.map(entry => entry.label), ["value"])
        const recovered = await session.request("completionItem/resolve", next.result.items[0])
        assert.equal(recovered.error, undefined, JSON.stringify(recovered))
        assert.deepEqual(canonicalCompletion(recovered.result), oracle)
        assert.equal(session.documentVersions.size, 0)
        assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a never-opened typeDefinition matches an opened caller without creating an overlay",
  { timeout: 30_000 }, async t => {
    for (const opened of [true, false]) {
      const { session, rootUri, uri, workspace } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const text = 'import { item } from "./Unopened"\nexport const result = item\n'
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      fs.writeFileSync(path.join(workspace, "Unopened.ets"), "export class Model {}\nexport const item = new Model()\n")
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const response = await session.request("textDocument/typeDefinition", {
        textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
        start: { line: 0, character: 13 }, end: { line: 0, character: 18 },
      } }], opened ? "opened-caller oracle" : "never-opened source must preserve the complete oracle")
      if (!opened) {
        const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
        assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
        assert.equal(session.documentVersions.size, 0)
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("direct disk definitions reject root escapes and non-files without poisoning a valid query",
  { timeout: 30_000 }, async t => {
    const { session, uri, sources, workspace, directory } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const outside = path.join(directory, "outside.ets")
    fs.writeFileSync(outside, "export const privateSymbol = 1\nprivateSymbol\n")
    fs.symlinkSync(outside, path.join(workspace, "Escaped.ets"), "file")
    fs.mkdirSync(path.join(workspace, "Directory.ets"))
    for (const name of ["../outside.ets", "Escaped.ets", "Directory.ets"]) {
      const rejected = await session.request("textDocument/definition", {
        textDocument: { uri: uri(name) }, position: { line: 1, character: 1 },
      })
      assert.equal(rejected.error, undefined, JSON.stringify(rejected))
      assert.deepEqual(rejected.result, [], `${name} cannot become a workspace disk source`)
    }
    const current = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 },
    })
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an early never-opened query cancellation keeps the public error and permits cold disk recovery",
  { timeout: 30_000 }, async t => {
    const { session, uri, sources } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const params = { textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 } }
    const id = 50_001
    session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/definition", params })
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await session.transport.response(id)
    assert.equal(cancelled.result, undefined)
    assert.deepEqual(cancelled.error, { code: -32800, message: "Request cancelled by client" })
    const recovered = await session.request("textDocument/definition", params)
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const transcript = session.transport.diagnosticSnapshot().transcript
    assert.equal(transcript.droppedEntries, 0)
    assert.equal(transcript.entries.filter(message => message.direction === "receive" && message.id === id).length, 1)
  })

test("a real open overlay wins over disk and closing it restores direct disk queries",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources, workspace } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    fs.appendFileSync(path.join(workspace, "Unopened.ets"), "export function freshlyBound(): number { return 2 }\n")
    assert.equal((await session.request("arkts/semanticReadiness",
      { rootUri, prepare: true }, { timeoutMs: 20_000 })).result?.semanticState, "ready")
    const params = { textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 } }
    const overlay = sources["Main.ets"].replaceAll("neverQueried", "freshlyBound")
    session.openDocument({ uri: uri("Main.ets"), version: 7, text: overlay })
    const opened = await session.request("textDocument/definition", params)
    assert.equal(opened.error, undefined, JSON.stringify(opened))
    assert.deepEqual(opened.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: uri("Main.ets") } } })
    session.documentVersions.delete(uri("Main.ets"))
    const closed = await session.request("textDocument/definition", params)
    assert.equal(closed.error, undefined, JSON.stringify(closed))
    assert.deepEqual(closed.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    assert.equal(fs.readFileSync(path.join(workspace, "Main.ets"), "utf8"), sources["Main.ets"])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a disk edit after the real Worker send cannot publish an old unopened definition and recovers",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources, workspace, directory } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/disk-source-window.cjs"))}`,
    })
    fs.appendFileSync(path.join(workspace, "Unopened.ets"), "export function freshlyBound(): number { return 2 }\n")
    assert.equal((await session.request("arkts/semanticReadiness",
      { rootUri, prepare: true }, { timeoutMs: 20_000 })).result?.semanticState, "ready")
    const changed = sources["Main.ets"].replaceAll("neverQueried", "freshlyBound")
    fs.writeFileSync(path.join(directory, "mutate-sent-disk-source.json"), JSON.stringify({ text: changed }))
    const params = { textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 } }
    const stale = await session.request("textDocument/definition", params)
    const witness = JSON.parse(fs.readFileSync(path.join(directory, "sent-disk-source-mutated.json"), "utf8"))
    assert.equal(witness.pid, session.transport.child.pid)
    assert.equal(witness.boundary, "original-worker-postMessage-return")
    assert.equal(witness.sentText, sources["Main.ets"])
    assert.equal(witness.currentText, changed)
    if (stale.error) assert.ok([-32801, -32803].includes(stale.error.code), JSON.stringify(stale))
    else assert.deepEqual(stale.result, [], "no successful stale Location may cross the real disk return fence")
    assert.equal((await session.request("arkts/semanticReadiness",
      { rootUri, prepare: true }, { timeoutMs: 20_000 })).result?.semanticState, "ready")
    const current = await session.request("textDocument/definition", params)
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a never-opened definition rereads same-size same-mtime source edits without a file notification",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources, workspace } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    fs.appendFileSync(path.join(workspace, "Unopened.ets"), "export function freshlyBound(): number { return 2 }\n")
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    const params = { textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: sources["Main.ets"].split("\n")[1].indexOf("neverQueried") + 1 } }
    const first = await session.request("textDocument/definition", params)
    assert.deepEqual(first.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    const file = path.join(workspace, "Main.ets"), before = fs.statSync(file)
    const changed = sources["Main.ets"].replaceAll("neverQueried", "freshlyBound")
    assert.equal(Buffer.byteLength(changed), before.size)
    fs.writeFileSync(file, changed)
    fs.utimesSync(file, before.atime, before.mtime)
    const next = await session.request("textDocument/definition", params)
    assert.equal(next.error, undefined, JSON.stringify(next))
    assert.deepEqual(next.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.notEqual(current.result?.semanticState, "ready", "the unnotified edit must revoke the old proof")
    assert.deepEqual(current.result.readyCapabilities, [])
    const recovered = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(recovered.result?.semanticState, "ready", JSON.stringify(recovered))
    assert.notEqual(recovered.result.inputIdentity.sourcesSha256, prepared.result.inputIdentity.sourcesSha256)
    assert.equal(recovered.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
