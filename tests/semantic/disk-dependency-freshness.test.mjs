import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import { startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("an in-flight dependency disk edit cannot publish its pre-read declaration location",
  { timeout: 30_000 }, async t => {
    const { session, workspace, uri, sources, directory } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/disk-dependency-read-window.cjs"))}`,
    })
    const suffix = "// shifted declaration 👩‍💻\n", original = sources["Unopened.ets"] + suffix
    const current = suffix + sources["Unopened.ets"]
    assert.equal(Buffer.byteLength(original), Buffer.byteLength(current))
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), original)
    fs.writeFileSync(path.join(directory, "mutate-read-dependency.json"), JSON.stringify({ text: current }), { flag: "wx" })
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 } }
    const response = await session.request("textDocument/definition", params, { timeoutMs: 20_000 })
    const witness = JSON.parse(fs.readFileSync(path.join(directory, "read-dependency-mutated.json"), "utf8"))
    assert.equal(witness.pid, session.transport.child.pid)
    assert(witness.threadId > 0); assert.equal(witness.boundary, "native-read-final-fstat-return")
    assert.equal(witness.originalSize, witness.currentSize); assert.equal(witness.currentText, current)
    assert(witness.caller.some(line => line.includes("readDiskSource")))
    t.diagnostic(JSON.stringify({ response, witness, noDidOpen: session.documentVersions.size === 0 }))
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }], "re-admission before compilation must use the current declaration, never the pre-read line zero")
    const recovered = await session.request("textDocument/definition", params, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an explicit READY query rejects an in-flight dependency edit and recertifies its current source",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, workspace, uri, sources, directory } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/disk-dependency-read-window.cjs"))}`,
    })
    const suffix = "// shifted declaration 👩‍💻\n", original = sources["Unopened.ets"] + suffix
    const current = suffix + sources["Unopened.ets"]
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), original)
    const ready = async prepare => {
      const response = await session.request("arkts/semanticReadiness", { rootUri, prepare }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response))
      return response.result
    }
    const prepared = await ready(true)
    assert.equal(prepared.semanticState, "ready", JSON.stringify(prepared))
    assert.equal(prepared.coverage.projectSources, 2)
    fs.writeFileSync(path.join(directory, "mutate-read-dependency.json"), JSON.stringify({ text: current }), { flag: "wx" })
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 } }
    const changed = await session.request("textDocument/definition", params, { timeoutMs: 20_000 })
    assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
    assert.equal(changed.result, undefined)
    const witness = JSON.parse(fs.readFileSync(path.join(directory, "read-dependency-mutated.json"), "utf8"))
    assert.equal(witness.pid, session.transport.child.pid); assert(witness.threadId > 0)
    const stale = await ready(false)
    assert.notEqual(stale.semanticState, "ready", JSON.stringify(stale))
    assert.equal(stale.semanticGeneration, null)
    const recovered = await session.request("textDocument/definition", params, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    const currentReady = await ready(false)
    assert.equal(currentReady.semanticState, "ready", JSON.stringify(currentReady))
    assert.notEqual(currentReady.inputIdentity.sourcesSha256, prepared.inputIdentity.sourcesSha256)
    assert.deepEqual(currentReady.coverage, prepared.coverage)
    assert.equal(session.documentVersions.size, 0)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an opened caller cannot publish a dependency changed during final disk verification",
  { timeout: 30_000 }, async t => {
    const { session, workspace, uri, sources, directory } = await startReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_TRACE: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/disk-dependency-read-window.cjs"))}`,
    })
    const suffix = "// shifted declaration 👩‍💻\n", original = sources["Unopened.ets"] + suffix
    const current = suffix + sources["Unopened.ets"]
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), original)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Main.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    const params = { textDocument: { uri: uri("Main.ets") }, position: { line: 1, character: 23 } }
    const oldLocation = [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }]
    assert.deepEqual((await session.request("textDocument/definition", params)).result, oldLocation)
    fs.writeFileSync(path.join(directory, "mutate-read-dependency.json"), JSON.stringify({ text: current }), { flag: "wx" })
    const response = await session.request("textDocument/definition", params, { timeoutMs: 20_000 })
    const witness = JSON.parse(fs.readFileSync(path.join(directory, "read-dependency-mutated.json"), "utf8"))
    assert.equal(witness.pid, session.transport.child.pid); assert(witness.threadId > 0)
    assert(witness.caller.some(line => line.includes("assertCurrentWorkspaceSources")),
      "mutation must occur in the real post-query source verification, not initial preparation")
    assert.equal(witness.originalSize, witness.currentSize); assert.equal(witness.currentText, current)
    t.diagnostic(JSON.stringify({ response, witness, entry: "opened" }))
    assert.equal(response.error?.code, -32803)
    assert.equal(response.result, undefined, "the previous compiler location cannot pass a changed final source read")
    const recovered = await session.request("textDocument/definition", params, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered))
    assert.deepEqual(recovered.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 1, character: 16 }, end: { line: 1, character: 28 },
    } }])
    assert.equal(session.documentVersions.has(uri("Unopened.ets")), false)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
