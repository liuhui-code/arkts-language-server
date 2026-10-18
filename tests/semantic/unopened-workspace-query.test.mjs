import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { createReadinessFixture, startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"
import { waitForEvent } from "../support/resident-interactive-lsp.mjs"

for (const opened of [false, true]) for (const includeDeclaration of [false, true]) {
test(opened || includeDeclaration
  ? `watched dependency references refresh READY for opened=${opened} includeDeclaration=${includeDeclaration}`
  : "a complete disk reference query refreshes its explicit READY session after a watched dependency edit",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, workspace, events, sources } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    if (opened) {
      session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
    }
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.error, undefined, JSON.stringify(prepared))
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration } }
    const uses = [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    ]
    const baseline = await session.request("textDocument/references", params, { timeoutMs: 20_000 })
    assert.equal(baseline.error, undefined, JSON.stringify(baseline))
    assert.deepEqual(baseline.result, includeDeclaration ? [...uses, { uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }] : uses)
    const unchanged = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.deepEqual(unchanged.result, prepared.result)
    const currentSource = "// current dependency 👩‍💻\n"
      + "export function neverQueried(): number { return 2 }\n"
      + "export const dependencyAlias = neverQueried\n"
    assert.equal(currentSource.split("\n")[2].slice(31, 43), "neverQueried")
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), currentSource)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 2 }] } })
    const revoked = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(revoked.error, undefined, JSON.stringify(revoked))
    assert.notEqual(revoked.result?.semanticState, "ready", "the old source manifest must be revoked before querying")
    const response = await session.request("textDocument/references", params, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response))
    const expected = [...uses, { uri: uri("Unopened.ets"), range: {
      start: { line: 2, character: 31 }, end: { line: 2, character: 43 },
    } }]
    if (includeDeclaration) expected.push({ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } })
    const sorted = locations => [...locations].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    assert.deepEqual(sorted(response.result), sorted(expected), "the new dependency reference must be included")
    const refreshed = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(session.documentVersions.size, opened ? 1 : 0)
    assert.ok(!session.documentVersions.has(uri("Unopened.ets")), "the edited destination must never open")
    if (!opened) assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"),
      "no didOpen, background diagnostic or synthetic version-zero overlay may warm this query")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    t.diagnostic(JSON.stringify({ phase: "EXACT_POST_EDIT_REFERENCE_THEN_READONLY_ROOT_STATUS", completeLocations: response.result,
      before: prepared.result, revoked: revoked.result, after: refreshed, route: events().filter(event =>
        ["references.resident.hit", "references.resident.miss", "references.batch.start",
          "semantic.context.create", "semantic.prepare.complete"].includes(event.event)) }))
    assert.equal(refreshed.error, undefined, JSON.stringify(refreshed))
    assert.equal(refreshed.result?.semanticState, "ready",
      "a complete ordinary reference query must refresh its already explicit-ready session against current inputs")
    assert.notEqual(refreshed.result.inputIdentity.sha256, prepared.result.inputIdentity.sha256)
    assert.notEqual(refreshed.result.inputIdentity.sourcesSha256, prepared.result.inputIdentity.sourcesSha256)
    assert.equal(refreshed.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
    assert.deepEqual(refreshed.result.readyCapabilities, prepared.result.readyCapabilities)
    assert.deepEqual(refreshed.result.coverage, prepared.result.coverage)
  })
}

test("never-opened references preserve the complete opened-caller oracle for both declaration policies",
  { timeout: 30_000 }, async t => {
    for (const opened of [true, false]) {
      const { session, rootUri, uri, workspace, events } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const lines = ['import { neverQueried } from "./Unopened"',
        "export const result = neverQueried() + neverQueried()"]
      const text = lines.join("\n") + "\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const expected = lines.flatMap((line, number) => [...line.matchAll(/neverQueried/gu)].map(match => ({
        uri: uri("Main.ets"), range: { start: { line: number, character: match.index },
          end: { line: number, character: match.index + 12 } },
      })))
      const params = { textDocument: { uri: uri("Main.ets") },
        position: { line: 1, character: lines[1].indexOf("neverQueried") + 1 } }
      for (const includeDeclaration of [false, true, false]) {
        const response = await session.request("textDocument/references", { ...params, context: { includeDeclaration } })
        assert.equal(response.error, undefined, JSON.stringify(response))
        const complete = includeDeclaration ? [...expected, { uri: uri("Unopened.ets"), range: {
          start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
        } }] : expected
        assert.deepEqual(response.result, complete,
          `${opened ? "opened-caller" : "never-opened"} includeDeclaration=${includeDeclaration}`)
      }
      if (!opened) {
        assert.ok(events().some(event => event.event === "references.cache.hit"),
          "a proven unchanged disk snapshot must still use the complete result cache")
        const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
        assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
        assert.equal(session.documentVersions.size, 0)
        assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a never-opened first reference request reuses automatic preparation for both complete policies",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const before = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(before.result?.semanticState, "ready", JSON.stringify(before))
    const uses = [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    ]
    for (const includeDeclaration of [false, true]) {
      const response = await session.request("textDocument/references", { textDocument: { uri: uri("Main.ets") },
        position: { line: 1, character: 23 }, context: { includeDeclaration } })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, includeDeclaration ? [...uses, { uri: uri("Unopened.ets"), range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
      } }] : uses)
    }
    assert.equal(session.documentVersions.size, 0)
    assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a repeated disk reference query cannot reuse stale cross-file locations after an unnotified edit",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources, workspace } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const lines = [sources["Unopened.ets"].trimEnd(), "export function freshlyBound(): number { return 2 }",
      "export const extra = neverQueried()"]
    const file = path.join(workspace, "Unopened.ets")
    const text = lines.join("\n") + "\n"
    fs.writeFileSync(file, text)
    const ready = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
    const uses = [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    ]
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration: false } }
    const first = await session.request("textDocument/references", params)
    assert.equal(first.error, undefined, JSON.stringify(first))
    const offset = lines[2].indexOf("neverQueried")
    assert.deepEqual(first.result, [...uses, { uri: uri("Unopened.ets"), range: {
      start: { line: 2, character: offset }, end: { line: 2, character: offset + 12 },
    } }])
    const stat = fs.statSync(file)
    const changed = lines.slice(0, 2).join("\n") + "\n" + lines[2].replace("neverQueried", "freshlyBound") + "\n"
    assert.equal(Buffer.byteLength(changed), Buffer.byteLength(text))
    fs.writeFileSync(file, changed)
    fs.utimesSync(file, stat.atime, stat.mtime)
    assert.equal(fs.readFileSync(path.join(workspace, "Main.ets"), "utf8"), sources["Main.ets"])
    const uncached = await session.request("textDocument/references", { ...params, context: { includeDeclaration: true } })
    assert.equal(uncached.error, undefined, JSON.stringify(uncached))
    assert.deepEqual(uncached.result, [...uses, { uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }], "a previously unqueried declaration policy must observe the current workspace source")
    const current = await session.request("textDocument/references", params)
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, uses, "unchanged query-source bytes do not certify other workspace source locations")
    assert.equal(session.documentVersions.size, 0)
    assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("never-opened prepareRename preserves the complete opened-caller range and placeholder",
  { timeout: 30_000 }, async t => {
    for (const opened of [true, false]) {
      const { session, rootUri, uri, sources } = await startRenameFixture(t)
      const ready = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
      const response = await session.request("textDocument/prepareRename", {
        textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, { placeholder: "neverQueried", range: {
        start: { line: 1, character: 22 }, end: { line: 1, character: 34 },
      } })
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

test("never-opened rename returns the complete transactional edit with null disk versions and no filesystem writes",
  { timeout: 30_000 }, async t => {
    for (const opened of [true, false]) {
      const { session, rootUri, uri, sources, workspace } = await startRenameFixture(t)
      const ready = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
      if (opened) session.openDocument({ uri: uri("Unopened.ets"), version: 1, text: sources["Unopened.ets"] })
      const params = { textDocument: { uri: uri("Unopened.ets") }, position: { line: 0, character: 17 }, newName: "freshlyBound" }
      const response = await session.request("textDocument/rename", params)
      assert.equal(response.error, undefined, JSON.stringify(response))
      const version = opened ? 1 : null
      assert.deepEqual(response.result, { documentChanges: [
        { textDocument: { uri: uri("Main.ets"), version: null }, edits: [
          { range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } }, newText: "freshlyBound" },
          { range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } }, newText: "freshlyBound" },
        ] },
        { textDocument: { uri: uri("Unopened.ets"), version }, edits: [
          { range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } }, newText: "freshlyBound" },
        ] },
      ] })
      const changed = applyWorkspaceEdit(new Map(Object.entries(sources).map(([name, text]) => [uri(name), text])),
        response.result, { documentVersions: new Map([[uri("Main.ets"), null], [uri("Unopened.ets"), version]]) })
      for (const [name, text] of Object.entries(sources)) {
        assert.equal(changed.get(uri(name)), text.replaceAll("neverQueried", "freshlyBound"))
        assert.equal(fs.readFileSync(path.join(workspace, name), "utf8"), text,
          "the server returns an edit; only the client may apply it")
      }
      const invalid = await session.request("textDocument/rename", { ...params, newName: "not valid" })
      assert.equal(invalid.error?.code, -32602, JSON.stringify(invalid))
      assert.equal(invalid.result, undefined)
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

test("renaming a never-opened import alias preserves its origin and only edits the complete caller",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, sources } = await startRenameFixture(t)
    assert.equal((await session.request("arkts/semanticReadiness",
      { rootUri, prepare: true }, { timeoutMs: 20_000 })).result?.semanticState, "ready")
    const response = await session.request("textDocument/rename", { textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: 23 }, newName: "freshlyBound" })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, { documentChanges: [{ textDocument: { uri: uri("Main.ets"), version: null }, edits: [
      { range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } }, newText: "neverQueried as freshlyBound" },
      { range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } }, newText: "freshlyBound" },
    ] }] })
    const changed = applyWorkspaceEdit(new Map(Object.entries(sources).map(([name, text]) => [uri(name), text])),
      response.result, { documentVersions: new Map([[uri("Main.ets"), null], [uri("Unopened.ets"), null]]) })
    assert.equal(changed.get(uri("Unopened.ets")), sources["Unopened.ets"])
    assert.equal(changed.get(uri("Main.ets")), 'import { neverQueried as freshlyBound } from "./Unopened"\n'
      + "export const result = freshlyBound()\n")
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("identical never-opened reference requests share one operation instead of superseding a participant",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, uri, events } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    })
    const ready = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration: false } }
    const responses = await Promise.all([session.request("textDocument/references", params),
      session.request("textDocument/references", params)])
    const expected = [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    ]
    for (const response of responses) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, expected)
    }
    assert.equal(events().filter(event => event.event === "references.coalesced" && event.sourceKind === "disk").length, 1)
    const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
    assert.equal(current.result.inputIdentity.overlaysSha256, ready.result.inputIdentity.overlaysSha256)
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("one cancelled disk-reference subscriber cannot cancel a coalesced survivor or duplicate a terminal response",
  { timeout: 30_000 }, async t => {
    // Existing private verifier window; not a normal latency observation.
    const { session, uri, directory } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1",
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "600", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
    })
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration: false } }
    for (const id of [50_001, 50_002]) {
      session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params })
    }
    const logs = { logs: path.join(directory, "logs") }
    await waitForEvent(logs, event => event.event === "references.coalesced" && event.sourceKind === "disk")
    await waitForEvent(logs, event => event.event === "references.batch.start")
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 50_001 } })
    const [cancelled, survivor] = await Promise.all([session.transport.response(50_001), session.transport.response(50_002)])
    assert.deepEqual(cancelled.error, { code: -32800, message: "Request cancelled by client" })
    assert.equal(cancelled.result, undefined)
    const expected = [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    ]
    assert.equal(survivor.error, undefined, JSON.stringify(survivor))
    assert.deepEqual(survivor.result, expected)
    const recovered = await session.request("textDocument/references", params)
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, expected)
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const transcript = session.transport.diagnosticSnapshot().transcript
    assert.equal(transcript.droppedEntries, 0)
    for (const id of [50_001, 50_002]) {
      assert.equal(transcript.entries.filter(message => message.direction === "receive" && message.id === id).length, 1)
    }
  })

test("a watched disk edit invalidates both coalesced requests and a new query returns every current reference",
  { timeout: 30_000 }, async t => {
    const { session, uri, sources, workspace, directory } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "1",
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "600", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
    })
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 },
      context: { includeDeclaration: false } }
    for (const id of [50_101, 50_102]) {
      session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params })
    }
    const logs = { logs: path.join(directory, "logs") }
    await waitForEvent(logs, event => event.event === "references.coalesced" && event.sourceKind === "disk")
    await waitForEvent(logs, event => event.event === "references.batch.start")
    fs.writeFileSync(path.join(workspace, "Main.ets"), sources["Main.ets"] + "export const extra = neverQueried()\n")
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Main.ets"), type: 2 }] } })
    for (const response of await Promise.all([session.transport.response(50_101), session.transport.response(50_102)])) {
      assert.equal(response.error?.code, -32801, JSON.stringify(response))
      assert.equal(response.result, undefined)
    }
    const fresh = await session.request("textDocument/references", params)
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.deepEqual(fresh.result, [
      { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
      { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
      { uri: uri("Main.ets"), range: { start: { line: 2, character: 21 }, end: { line: 2, character: 33 } } },
    ])
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const transcript = session.transport.diagnosticSnapshot().transcript
    assert.equal(transcript.droppedEntries, 0)
    for (const id of [50_101, 50_102]) {
      assert.equal(transcript.entries.filter(message => message.direction === "receive" && message.id === id).length, 1)
    }
  })

test("never-opened implementation returns the complete opened-caller workspace oracle without an overlay",
  { timeout: 30_000 }, async t => {
    for (const opened of [true, false]) {
      const { session, rootUri, uri, workspace } = await startReadinessFixture(t, {
        ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      })
      const caller = "export function consume(value: Contract): number { return value.run() }"
      const text = 'import { Contract } from "./Unopened"\n' + caller + "\n"
        + "export class Local implements Contract { run(): number { return 3 } }\n"
      fs.writeFileSync(path.join(workspace, "Main.ets"), text)
      fs.writeFileSync(path.join(workspace, "Unopened.ets"), "export interface Contract { run(): number }\n"
        + "export class First implements Contract { run(): number { return 1 } }\n"
        + "export class Second implements Contract { run(): number { return 2 } }\n")
      const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
      assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
      if (opened) session.openDocument({ uri: uri("Main.ets"), version: 1, text })
      const response = await session.request("textDocument/implementation", {
        textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: caller.indexOf("Contract") + 1 },
      })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [
        { uri: uri("Main.ets"), range: { start: { line: 2, character: 13 }, end: { line: 2, character: 18 } } },
        { uri: uri("Unopened.ets"), range: { start: { line: 1, character: 13 }, end: { line: 1, character: 18 } } },
        { uri: uri("Unopened.ets"), range: { start: { line: 2, character: 13 }, end: { line: 2, character: 19 } } },
      ], opened ? "complete opened-caller oracle" : "disk source must not drop any workspace implementation")
      if (!opened) {
        const current = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
        assert.equal(current.result?.semanticState, "ready", JSON.stringify(current))
        assert.equal(current.result.inputIdentity.overlaysSha256, prepared.result.inputIdentity.overlaysSha256)
        assert.equal(session.documentVersions.size, 0)
        assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

async function startRenameFixture(t) {
  const fixture = createReadinessFixture(t, {
    ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
  })
  const { session, sdk } = fixture
  const initialized = await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000,
    capabilities: { ...session.capabilities,
      textDocument: { ...session.capabilities.textDocument, rename: { prepareSupport: true } },
      workspace: { workspaceEdit: { documentChanges: true, failureHandling: "transactional" } } } })
  assert.deepEqual(initialized.result.capabilities.renameProvider, { prepareProvider: true })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  return fixture
}
