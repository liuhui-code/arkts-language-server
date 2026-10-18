import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { completeLogEvents } from "../support/complete-log-events.mjs"
import { startFixture, definition, diagnostic, readObservations } from "../support/versioned-overlay-lsp.mjs"

test("the unadopted snapshot candidate defaults to full parsing while explicit opt-in remains available",
  { timeout: 30_000 }, async t => {
    const payloads = []
    for (const enabled of [undefined, "0"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const changed = source.replace("number = 1", 'string = "current"')
        + "export const broken: number = value\n"
      session.changeDocument({ uri, version: 2, text: changed })
      const result = await session.request("textDocument/definition", { textDocument: { uri },
        position: positionAt(changed, changed.lastIndexOf("value")) }, { timeoutMs: 10_000 })
      assert.equal(result.error, undefined, JSON.stringify(result.error))
      const start = changed.indexOf("value")
      assert.deepEqual(result.result, [{ uri, range: {
        start: positionAt(changed, start), end: positionAt(changed, start + 5),
      } }])
      const response = await session.request("textDocument/hover", { textDocument: { uri },
        position: positionAt(changed, changed.lastIndexOf("value")) })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const currentDiagnostics = await diagnostic(session, uri, 2, [2322])
      const updates = readObservations(fixture).filter(row => row.kind === "compiler-change-range")
      assert.ok(updates.length > 0, "the real compiler must consume the changed source")
      assert.ok(updates.every(row => row.change === null), "no unadopted incremental parser candidate may run by default")
      payloads.push({ definition: result.result.map(item => ({ ...item, uri: "Query.ets" })),
        hover: response.result, diagnostics: currentDiagnostics })
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
    assert.deepEqual(payloads[0], payloads[1], "default preserves full explicit0 response and latest diagnostics")
  })

test("queued overlay edits and simultaneous queries publish the latest full payload without a false compiler delta",
  { timeout: 60_000 }, async t => {
    const payloads = []
    for (const enabled of ["0", "1"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const inserted = source.replace("\nexport const value", "\n// queued 👩‍💻\nexport const value")
      const broken = inserted.replace("number = 1", 'string = "latest"')
        + "export const broken: number = value\n"
      session.changeDocument({ uri, version: 2, text: source.replace("= 1", "= 20") })
      session.changeDocument({ uri, version: 3, text: inserted })
      session.changeDocument({ uri, version: 4, text: broken })
      const [, hover] = await Promise.all([definition(session, uri, broken),
        session.request("textDocument/hover", { textDocument: { uri },
          position: positionAt(broken, broken.lastIndexOf("value")) }, { timeoutMs: 10_000 })])
      assert.equal(hover.error, undefined, JSON.stringify(hover.error))
      assert.deepEqual(hover.result, { contents: { kind: "markdown", value: "```arkts\nconst value: string\n```" },
        range: { start: positionAt(broken, broken.lastIndexOf("value")),
          end: positionAt(broken, broken.lastIndexOf("value") + 5) } })
      const diagnostics = await diagnostic(session, uri, 4, [2322])
      const offset = broken.indexOf("broken")
      assert.deepEqual(diagnostics[0].range, { start: positionAt(broken, offset), end: positionAt(broken, offset + 6) })
      payloads.push({ hover: hover.result, diagnostics })
      const native = readObservations(fixture).filter(row => row.kind === "compiler-change-range")
      assert.ok(native.length > 0)
      assert.ok(native.every(row => enabled === "0" ? row.change === null
        : row.change === null || row.reconstructsCurrentText === true), "unknown ancestry cannot certify a wrong delta")
      t.diagnostic(JSON.stringify({ enabled, queuedEdits: native }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
    assert.deepEqual(payloads[1], payloads[0], "latest full hover and diagnostic payloads match opt-out")
  })

test("consecutive UTF-16 overlay edits give the real compiler an exact change range and keep full results",
  { timeout: 60_000 }, async t => {
    for (const enabled of ["1", "0"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const edited = source.replace("= 1", "= 20")
      session.changeDocument({ uri, version: 2, text: edited })
      await definition(session, uri, edited)
      await diagnostic(session, uri, 2)
      const operations = readObservations(fixture)
      t.diagnostic(JSON.stringify({ mode: enabled ?? "default", operations }))
      assert.ok(operations.length > 0, "observe a real compiler request, not a synthetic delta")
      assert.ok(operations.every(row => row.threadId > 0 && row.newLength === edited.length))
      const updates = operations.filter(row => row.kind === "compiler-source-update")
      assert.ok(updates.length > 0, "observe actual parser output as well as its accepted range")
      if (enabled === "0") {
        assert.ok(operations.every(row => row.change === null), "explicit opt-out keeps full parsing")
        assert.ok(updates.every(row => row.reusedStatements === 0), JSON.stringify(updates))
      } else {
        assert.ok(operations.some(row => row.change?.span.start === source.indexOf("= 1") + 2
          && row.change.span.length === 1 && row.change.newLength === 2
          && row.reconstructsCurrentText === true), JSON.stringify(operations))
        assert.ok(updates.some(row => row.reusedStatements > 0
          && row.sourceFileChanged === true), "reuse an unchanged actual AST statement under a new SourceFile")
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a jumped overlay version keeps full parsing, then a known consecutive edit can resume incrementality",
  { timeout: 60_000 }, async t => {
    for (const enabled of ["1", "0"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const jumped = source.replace("= 1", "= 20")
      session.changeDocument({ uri, version: 4, text: jumped })
      await definition(session, uri, jumped)
      await diagnostic(session, uri, 4)
      const first = readObservations(fixture)
      assert.ok(first.some(row => row.kind === "compiler-source-update" && row.reusedStatements === 0))
      assert.ok(first.every(row => row.change === null), JSON.stringify(first))
      const next = jumped.replace("= 20", "= 21")
      session.changeDocument({ uri, version: 5, text: next })
      await definition(session, uri, next)
      await diagnostic(session, uri, 5)
      const continued = readObservations(fixture).slice(first.length)
      assert.ok(continued.some(row => row.kind === "compiler-change-range"
        && (enabled === "0" ? row.change === null : row.reconstructsCurrentText === true)))
      t.diagnostic(JSON.stringify({ mode: enabled ?? "default", jumped: first, continued }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("compiler snapshots compose eight known edits and refuse older ancestry without losing current results",
  { timeout: 60_000 }, async t => {
    const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
      + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
    const { fixture, session, uri } = await startFixture(t, source, "1", { probeAncestors: true })
    let seen = 0
    const witnesses = []
    for (let version = 2; version <= 11; version++) {
      const edited = source.replace("= 1", `= ${version}`)
      session.changeDocument({ uri, version, text: edited })
      await definition(session, uri, edited)
      await diagnostic(session, uri, version)
      const rows = readObservations(fixture)
      const current = rows.slice(seen)
      seen = rows.length
      assert.ok(current.some(row => row.kind === "compiler-change-range"
        && row.reconstructsCurrentText === true), "native immediate-parent incrementality remains valid")
      const probes = current.filter(row => row.kind === "snapshot-ancestor-probe")
      assert.equal(probes.length, 1, "separate probe receipts from native compiler consumption")
      const probe = probes[0]
      assert.equal(probe.oldLength, source.length)
      if (version <= 9) {
        assert.equal(probe.reconstructsCurrentText, true)
      } else {
        assert.equal(probe.change, null, "discarded numeric history cannot authorize an old snapshot")
      }
      witnesses.push({ version, probe })
    }
    t.diagnostic(JSON.stringify({ ancestry: witnesses }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("incremental insertion deletion API edits syntax errors and undo match the full-parser oracle with latest diagnostics",
  { timeout: 60_000 }, async t => {
    const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
      + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
    const inserted = source.replace("\nexport const value", "\n// inserted 👩‍💻\nexport const value")
    const api = source.replace("number = 1", 'string = "updated"') + "export const broken: number = value\n"
    const invalid = api + "export const malformed = ;\n"
    const observations = []
    for (const enabled of ["0", "1"]) {
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const payloads = []
      for (const [version, text, codes] of [[2, inserted, []], [3, api, [2322]],
        [4, invalid, null], [5, source, []]]) {
        session.changeDocument({ uri, version, text })
        const hover = await session.request("textDocument/hover", {
          textDocument: { uri }, position: positionAt(text, text.lastIndexOf("value")),
        }, { timeoutMs: 10_000 })
        assert.equal(hover.error, undefined, JSON.stringify(hover.error))
        const diagnostics = await diagnostic(session, uri, version, codes)
        if (version === 3) {
          const start = text.indexOf("broken")
          assert.deepEqual(diagnostics[0].range, { start: positionAt(text, start), end: positionAt(text, start + 6) })
        }
        if (version === 4) assert.ok(diagnostics.length > 0, "never hide malformed source diagnostics")
        payloads.push({ version, hover: hover.result, diagnostics })
        if (version !== 4) await definition(session, uri, text)
      }
      observations.push(payloads)
      if (enabled === undefined) {
        const ranges = readObservations(fixture).filter(row => row.kind === "compiler-change-range" && row.change)
        assert.ok(ranges.length >= 3)
        assert.ok(ranges.every(row => row.reconstructsCurrentText === true))
      }
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
    assert.deepEqual(observations[1], observations[0], "compare entire hover and diagnostic payloads, not counts")
  })

test("close and reopen with reset document versions never reuse a stale overlay or diagnostic",
  { timeout: 60_000 }, async t => {
    for (const enabled of ["0", "1"]) {
      const source = "// op04-snapshot 😀\nexport const value: number = 1\nexport const selected = value\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const broken = source.replace("number = 1", 'string = "updated"')
        + "export const broken: number = value\n"
      session.changeDocument({ uri, version: 2, text: broken })
      await definition(session, uri, broken)
      await diagnostic(session, uri, 2, [2322])
      const ready = session.transport.waitFor(message => message.method === "textDocument/publishDiagnostics"
        && message.params.uri === uri && message.params.version === 1,
      "new diagnostics after reopen, not an old queued v1", 10_000)
      session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
      session.documentVersions.delete(uri)
      const reopened = source.replace("\nexport const value", "\n// reopened 👩‍💻\nexport const value")
      session.openDocument({ uri, version: 1, text: reopened })
      await definition(session, uri, reopened)
      assert.deepEqual((await ready).params.diagnostics, [])
      const edited = reopened.replace("= 1", "= 2")
      session.changeDocument({ uri, version: 2, text: edited })
      await definition(session, uri, edited)
      await diagnostic(session, uri, 2)
      const native = readObservations(fixture).filter(row => row.kind === "compiler-change-range" && row.change)
      assert.ok(native.every(row => row.reconstructsCurrentText === true))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("diskless overlays keep exact results after same-content version promotion and a real edit",
  { timeout: 60_000 }, async t => {
    const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
      + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
    const payloads = []
    for (const enabled of ["0", "1"]) {
      const { fixture, session, uri } = await startFixture(t, source, enabled, { diskless: true })
      assert.equal(fs.existsSync(path.join(fixture.suite.workspace, "Query.ets")), false)
      session.changeDocument({ uri, version: 2, text: source })
      await definition(session, uri, source)
      await diagnostic(session, uri, 2)
      const promoted = readObservations(fixture)
      assert.equal(promoted.length, 0, "same-content promotion must not manufacture a parser update")
      const edited = source.replace("= 1", "= 20")
      session.changeDocument({ uri, version: 3, text: edited })
      await definition(session, uri, edited)
      const diagnostics = await diagnostic(session, uri, 3)
      const hover = await session.request("textDocument/hover", {
        textDocument: { uri }, position: positionAt(edited, edited.lastIndexOf("value")),
      }, { timeoutMs: 10_000 })
      assert.equal(hover.error, undefined, JSON.stringify(hover.error))
      payloads.push({ hover: hover.result, diagnostics })
      const native = readObservations(fixture)
      assert.ok(native.some(row => row.kind === "compiler-change-range"))
      if (enabled === "0") assert.ok(native.every(row => row.change === null))
      else {
        assert.ok(native.some(row => row.kind === "compiler-change-range"
          && row.reconstructsCurrentText === true))
        assert.ok(native.some(row => row.kind === "compiler-source-update" && row.reusedStatements > 0))
      }
      t.diagnostic(JSON.stringify({ mode: enabled ?? "default", diskless: true, promoted, native }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
    assert.deepEqual(payloads[1], payloads[0], "diskless current hover and diagnostics match full parsing")
  })

test("a diagnostic GC checkpoint targets the resident Worker without evicting current snapshots or changing results",
  { timeout: 60_000 }, async t => {
    for (const enabled of ["0", "1"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled,
        { residentGc: true, slowGcReceipt: true })
      const edited = source.replace("= 1", "= 20")
      session.changeDocument({ uri, version: 2, text: edited })
      await definition(session, uri, edited)
      await diagnostic(session, uri, 2)
      const observed = readObservations(fixture).length
      const output = path.join(fixture.directory, "resident-gc-result.json")
      fs.writeFileSync(path.join(fixture.directory, "collect-resident-gc"), "{}")
      const deadline = Date.now() + 5_000
      const halfWritten = path.join(fixture.directory, "resident-gc-write-entered")
      while (!fs.existsSync(halfWritten) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
      assert.ok(fs.existsSync(halfWritten), "the original GC bytes must enter the real slow filesystem boundary")
      assert.equal(fs.existsSync(output), false, "a partial GC receipt must never be visible at the published path")
      while (!fs.existsSync(output) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
      assert.ok(fs.existsSync(output), "the real semantic Worker must publish its diagnostic GC receipt")
      const receipt = JSON.parse(fs.readFileSync(output, "utf8"))
      assert.equal(receipt.status, "COMPLETE", JSON.stringify(receipt))
      assert.equal(receipt.gcCalls, 2)
      assert.equal(receipt.pid, session.transport.child.pid)
      assert.ok(receipt.threadId > 0)
      for (const key of ["before", "after"]) {
        assert.ok(receipt[key].heapUsed > 0 && receipt[key].rss > 0)
        assert.equal(receipt[`${key}Stats`].residentContextCount, 1)
        assert.equal(receipt[`${key}Stats`].leaseCount, 0)
        assert.equal(receipt[`${key}Stats`].transientVerifierCount, 0)
      }
      await definition(session, uri, edited)
      const next = edited.replace("= 20", "= 21")
      session.changeDocument({ uri, version: 3, text: next })
      await definition(session, uri, next)
      await diagnostic(session, uri, 3)
      const ranges = readObservations(fixture).slice(observed).filter(row => row.kind === "compiler-change-range")
      assert.ok(ranges.length > 0, "GC must not replace the resident compiler context with a fresh parse")
      assert.ok(ranges.every(row => enabled === "0" ? row.change === null : row.reconstructsCurrentText === true))
      assert.equal(fs.existsSync(`${output}.pending-${receipt.threadId}`), false, "the published receipt must not leave its temporary file")
      t.diagnostic(JSON.stringify({ enabled, receipt }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("real L3 eviction cannot certify the old overlay ancestry and consecutive new edits recover exact incrementality",
  { timeout: 60_000 }, async t => {
    for (const enabled of ["0", "1"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled, { pressure: true })
      const edited = source.replace("= 1", "= 20")
      session.changeDocument({ uri, version: 2, text: edited })
      await definition(session, uri, edited)
      await diagnostic(session, uri, 2)
      const observed = readObservations(fixture).length
      const control = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.equal(control.error, undefined, JSON.stringify(control.error))
      assert.deepEqual(control.result, { applied: "level3" })
      const log = path.join(fixture.directory, "logs", "server.log")
      const deadline = Date.now() + 5_000
      let eviction
      while (!eviction && Date.now() < deadline) {
        eviction = completeLogEvents(log).findLast(event => event.event === "semantic.context.evict"
          && event.reason === "memory-level3" && event.residentContextCount === 0)
        if (!eviction) await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.ok(eviction, "exercise actual context disposal, not a timer-labelled pressure scenario")
      const recovered = edited.replace("\nexport const value", "\n// recovered 👩‍💻\nexport const value")
      session.changeDocument({ uri, version: 3, text: recovered })
      await definition(session, uri, recovered)
      await diagnostic(session, uri, 3)
      const recovery = readObservations(fixture).slice(observed)
      assert.ok(recovery.every(row => row.change === null), "an evicted lineage cannot authorize a delta")
      const create = completeLogEvents(log).findLast(event => event.event === "semantic.context.create")
      assert.ok(create.contextSequence > eviction.contextSequence)
      const seen = readObservations(fixture).length
      const next = recovered.replace("= 20", "= 21")
      session.changeDocument({ uri, version: 4, text: next })
      await definition(session, uri, next)
      await diagnostic(session, uri, 4)
      const current = readObservations(fixture).slice(seen)
      assert.ok(current.some(row => row.kind === "compiler-change-range"
        && (enabled === "0" ? row.change === null : row.reconstructsCurrentText === true)))
      t.diagnostic(JSON.stringify({ enabled, eviction, create, recovery, current }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("SDK configuration changes cannot reuse a trusted overlay delta to publish the old SDK type or declaration",
  { timeout: 60_000 }, async t => {
    for (const enabled of ["0", "1"]) {
      const source = '// op04-snapshot 😀\nimport { SdkValue } from "@ohos.snapshot"\n'
        + "export const retainedBefore = 0\nexport const value = new SdkValue().item\nexport const selected = value\n"
      const declaration = type => `export declare class SdkValue { item: ${type} }\n`
      const { fixture, session, uri } = await startFixture(t, source, enabled,
        { sdkDeclaration: declaration("number") })
      const nextSdk = path.join(fixture.directory, "sdk-next")
      fs.cpSync(fixture.suite.sdk, nextSdk, { recursive: true })
      fs.writeFileSync(path.join(nextSdk, "ets", "api", "@ohos.snapshot.d.ts"), declaration("string"))
      const querySdk = async (text, sdk, type) => {
        const response = await session.request("textDocument/definition", {
          textDocument: { uri }, position: positionAt(text, text.lastIndexOf("SdkValue") + 1),
        }, { timeoutMs: 10_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const offset = declaration(type).indexOf("SdkValue")
        assert.deepEqual(response.result, [{ uri: pathToFileURL(path.join(sdk, "ets", "api", "@ohos.snapshot.d.ts")).href,
          range: { start: positionAt(declaration(type), offset), end: positionAt(declaration(type), offset + 8) } }])
        const hover = await session.request("textDocument/hover", {
          textDocument: { uri }, position: positionAt(text, text.lastIndexOf("value")),
        }, { timeoutMs: 10_000 })
        assert.equal(hover.error, undefined, JSON.stringify(hover.error))
        assert.match(JSON.stringify(hover.result), new RegExp(`value: ${type}`))
      }
      const edited = source.replace("= 0", "= 9")
      session.changeDocument({ uri, version: 2, text: edited })
      await definition(session, uri, edited)
      await diagnostic(session, uri, 2)
      await querySdk(edited, fixture.suite.sdk, "number")
      const seen = readObservations(fixture).length
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: nextSdk } } } } })
      const switched = edited.replace("= 9", "= 10")
      session.changeDocument({ uri, version: 3, text: switched })
      await definition(session, uri, switched)
      await querySdk(switched, nextSdk, "string")
      await diagnostic(session, uri, 3)
      const boundary = readObservations(fixture).slice(seen)
      assert.ok(boundary.every(row => row.change === null), "a new SDK context is not a trusted old ancestry")
      const currentSeen = readObservations(fixture).length
      const next = switched.replace("= 10", "= 11")
      session.changeDocument({ uri, version: 4, text: next })
      await definition(session, uri, next)
      await querySdk(next, nextSdk, "string")
      await diagnostic(session, uri, 4)
      const current = readObservations(fixture).slice(currentSeen)
      assert.ok(current.some(row => row.kind === "compiler-change-range"
        && (enabled === "0" ? row.change === null : row.reconstructsCurrentText === true)))
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: fixture.suite.sdk } } } } })
      session.changeDocument({ uri, version: 5, text: edited })
      await definition(session, uri, edited)
      await querySdk(edited, fixture.suite.sdk, "number")
      await diagnostic(session, uri, 5)
      t.diagnostic(JSON.stringify({ enabled, boundary, current }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a process restart on the same workspace never restores stale overlay ancestry and new edits stay current",
  { timeout: 60_000 }, async t => {
    for (const enabled of ["0", "1"]) {
      const source = "// op04-snapshot 😀\nexport const retainedBefore = 0\n"
        + "export const value: number = 1\nexport const selected = value\nexport const retainedAfter = 2\n"
      const { fixture, session, uri } = await startFixture(t, source, enabled)
      const changed = source.replace("= 1", "= 20")
      session.changeDocument({ uri, version: 2, text: changed })
      await definition(session, uri, changed)
      await diagnostic(session, uri, 2)
      const oldPid = session.transport.child.pid
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      const restarted = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: session.rootUri, capabilities: session.capabilities,
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "restart-logs"),
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "restart-index"),
          ARKTS_VERSIONED_OVERLAY_SNAPSHOTS: enabled,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/snapshot-change-observer.cjs"))}` },
      })
      t.after(() => restarted.close().catch(() => {}))
      assert.notEqual(restarted.transport.child.pid, oldPid)
      await restarted.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      const seen = readObservations(fixture).length
      const reopened = changed.replace("\nexport const value", "\n// restarted 👩‍💻\nexport const value")
      restarted.openDocument({ uri, version: 1, text: reopened })
      await definition(restarted, uri, reopened)
      await diagnostic(restarted, uri, 1)
      assert.ok(readObservations(fixture).slice(seen).every(row => row.change === null))
      const currentSeen = readObservations(fixture).length
      const next = reopened.replace("= 20", "= 21")
      restarted.changeDocument({ uri, version: 2, text: next })
      await definition(restarted, uri, next)
      await diagnostic(restarted, uri, 2)
      const native = readObservations(fixture).slice(currentSeen)
      assert.ok(native.some(row => row.kind === "compiler-change-range"
        && (enabled === "0" ? row.change === null : row.reconstructsCurrentText === true)))
      t.diagnostic(JSON.stringify({ enabled, oldPid, newPid: restarted.transport.child.pid, native }))
      assert.deepEqual((await restarted.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })
