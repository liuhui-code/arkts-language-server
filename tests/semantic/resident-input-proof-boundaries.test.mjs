import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"

test("native input hash reuse rejects an old SDK proof and revalidates changed declarations before full publication",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const source = "export class TargetThing {}\n"
      const use = '// op02-pure-input SDK boundary 😀\nimport { TargetThing } from "./Target"\n'
        + "export const thing = new TargetThing()\n"
      const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": source, "Use.ets": use },
        target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
          position: { line: 0, character: 14 }, includeDeclaration: false },
        oracle: { schemaVersion: 1, locations: [
          { file: "Use.ets", range: range(1, 9, 20) }, { file: "Use.ets", range: range(2, 25, 36) },
        ] },
      })
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const logs = path.join(fixture.directory, "logs")
      const release = path.join(fixture.directory, "release-resident-input-proof")
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
          ARKTS_RESIDENT_INPUT_HASH_REUSE: reuse,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/resident-input-proof-observer.cjs"))}` },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000,
        initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      for (const [file, text] of [["Target.ets", source], ["Use.ets", use]]) {
        session.openDocument({ uri: uri(file), version: 1, text })
        const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
        assert.deepEqual(diagnostic.params.diagnostics, [])
      }
      const params = { textDocument: { uri: uri("Target.ets") }, position: { line: 0, character: 14 } }
      const warm = await session.request("textDocument/implementation", params, { timeoutMs: 20_000 })
      assert.equal(warm.error, undefined, JSON.stringify(warm.error))
      assert.deepEqual(warm.result, [])
      fs.writeFileSync(path.join(fixture.directory, "arm-resident-input-proof"), JSON.stringify({ pause: true }))
      session.transport.send({ jsonrpc: "2.0", id: 50, method: "textDocument/references",
        params: { ...params, context: { includeDeclaration: false } } })
      const sdkSource = path.join(fixture.suite.sdk, "ets", "component", "common.d.ts")
      const originalSdk = fs.readFileSync(sdkSource, "utf8")
      const changedSdk = originalSdk + "interface ChangedDuringHash { current: number }\n"
      try {
        const entered = await waitForJson(path.join(fixture.directory, "resident-input-proof-entered.json"))
        assert.equal(entered.pid, session.transport.child.pid)
        assert.ok(entered.threadId > 0, "mutate only after the actual semantic Worker has entered input hashing")
        fs.writeFileSync(sdkSource, changedSdk)
        assert.notEqual(fs.readFileSync(sdkSource, "utf8"), originalSdk)
      } finally { fs.writeFileSync(release, "resume") }
      const response = await session.transport.response(50, 20_000)
      assert.equal(response.error, undefined, JSON.stringify(response))
      const initialLocations = [
        { uri: uri("Use.ets"), range: range(1, 9, 20) }, { uri: uri("Use.ets"), range: range(2, 25, 36) },
      ]
      assert.deepEqual(response.result, initialLocations)
      const runtime = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
      assert.ok(runtime.some(row => row.event === "references.resident.proof.rejected"
        && row.reason === "disk-source-changed" && row.sourcePath === sdkSource))
      assert.equal(runtime.filter(row => row.event === "references.resident.hit").length, 0,
        "a stale SDK Program must not be published as a resident hit")
      const batches = runtime.filter(row => row.event === "references.batch.complete")
      assert.equal(batches.length, 1, "the response must use the original full transient fallback")
      assert.equal(batches[0].anchorVerified, true)
      assert.equal(batches[0].preparedSdkSourceFiles, 1)
      assert.equal(batches[0].preparedSdkTextCodeUnits, changedSdk.length,
        "the actual new compiler Program must load the changed declaration, not the old one")
      const operations = fs.readFileSync(path.join(fixture.directory, "resident-input-proof.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.ok(operations.some(row => row.kind === "hash-update" && row.pid === session.transport.child.pid
        && row.threadId > 0 && row.inputBytes === Buffer.byteLength(use)))
      const fresh = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk, NODE_OPTIONS: undefined,
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "fresh-index"),
          ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "fresh-logs"),
          ARKTS_REFERENCES_STRATEGY: "legacy", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0" },
      })
      t.after(() => fresh.close().catch(() => {}))
      await fresh.initialize({ timeoutMs: 10_000,
        initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      fresh.openDocument({ uri: uri("Target.ets"), version: 1, text: source })
      fresh.openDocument({ uri: uri("Use.ets"), version: 1, text: use })
      const freshInitial = await fresh.request("textDocument/references", {
        ...params, context: { includeDeclaration: false },
      }, { timeoutMs: 20_000 })
      assert.equal(freshInitial.error, undefined, JSON.stringify(freshInitial))
      assert.deepEqual(response.result, freshInitial.result)
      const nextSdk = path.join(fixture.directory, "sdk-next")
      fs.cpSync(fixture.suite.sdk, nextSdk, { recursive: true })
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: nextSdk } } } } })
      const current = use + "export const extra = new TargetThing()\n"
      session.changeDocument({ uri: uri("Use.ets"), version: 2, text: current })
      const recovered = await session.request("textDocument/references", {
        ...params, context: { includeDeclaration: false },
      }, { timeoutMs: 20_000 })
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      assert.deepEqual(recovered.result, [
        { uri: uri("Use.ets"), range: range(1, 9, 20) },
        { uri: uri("Use.ets"), range: range(2, 25, 36) },
        { uri: uri("Use.ets"), range: range(3, 25, 36) },
      ])
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
      fresh.changeDocument({ uri: uri("Use.ets"), version: 2, text: current })
      const freshCurrent = await fresh.request("textDocument/references", {
        ...params, context: { includeDeclaration: false },
      }, { timeoutMs: 20_000 })
      assert.equal(freshCurrent.error, undefined, JSON.stringify(freshCurrent))
      assert.deepEqual(recovered.result, freshCurrent.result)
      const freshDiagnostic = await fresh.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, freshDiagnostic.params.diagnostics)
      const transcript = session.transport.diagnosticSnapshot().transcript
      assert.equal(transcript.droppedEntries, 0)
      assert.equal(transcript.entries.filter(entry => entry.direction === "receive" && entry.id === 50).length, 1)
      t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", nativeHashUpdates: operations.length,
        nativeSdkTextCodeUnits: batches[0].preparedSdkTextCodeUnits, freshInitialLocations: response.result.length,
        recoveredLocations: recovered.result.length }))
      assert.deepEqual((await fresh.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("an in-flight native hash cannot publish old parent references after a nested-root overlay edit",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const source = "export class TargetThing {}\n"
      const use = '// op02-pure-input nested boundary 😀\nimport { TargetThing } from "./nested/Target"\n'
        + "export const thing = new TargetThing()\n"
      const nestedUse = use.replace('from "./nested/Target"', 'from "./Target"')
      const fixture = await makeQueryLayerFixture(t, { files: {
        "nested/Target.ets": source, "Use.ets": use, "nested/Use.ets": nestedUse,
      }, target: { kind: "references", file: "Use.ets", symbol: "TargetThing",
        position: { line: 2, character: 26 }, includeDeclaration: false },
        oracle: { schemaVersion: 1, locations: ["Use.ets", "nested/Use.ets"].flatMap(file => [
          { file, range: range(1, 9, 20) }, { file, range: range(2, 25, 36) },
        ]) },
      })
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const rootUri = pathToFileURL(fixture.suite.workspace).href
      const nestedUri = pathToFileURL(path.join(fixture.suite.workspace, "nested")).href
      const logs = path.join(fixture.directory, "logs")
      const release = path.join(fixture.directory, "release-resident-input-proof")
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"], rootUri,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
          ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
          ARKTS_RESIDENT_INPUT_HASH_REUSE: reuse,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/resident-input-proof-observer.cjs"))}` },
      })
      t.after(() => session.close().catch(() => {}))
      const initializeId = session.nextRequestId++
      session.transport.send({ jsonrpc: "2.0", id: initializeId, method: "initialize", params: {
        processId: process.pid, rootUri, capabilities: session.capabilities,
        initializationOptions: { sdk: { path: fixture.suite.sdk } },
        workspaceFolders: [{ name: "parent", uri: rootUri }, { name: "nested", uri: nestedUri }],
      } })
      const initialized = await session.transport.response(initializeId, 10_000)
      assert.equal(initialized.error, undefined, JSON.stringify(initialized))
      session.initialized = true
      session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
      for (const [file, text] of [["nested/Target.ets", source], ["Use.ets", use], ["nested/Use.ets", nestedUse]]) {
        session.openDocument({ uri: uri(file), version: 1, text })
        const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
        assert.deepEqual(diagnostic.params.diagnostics, [])
      }
      const params = { textDocument: { uri: uri("Use.ets") }, position: { line: 2, character: 26 } }
      const warm = await session.request("textDocument/implementation", params, { timeoutMs: 20_000 })
      assert.equal(warm.error, undefined, JSON.stringify(warm))
      fs.writeFileSync(path.join(fixture.directory, "arm-resident-input-proof"), JSON.stringify({ pause: true }))
      session.transport.send({ jsonrpc: "2.0", id: 50, method: "textDocument/references",
        params: { ...params, context: { includeDeclaration: false } } })
      const changed = nestedUse + "export const extra = new TargetThing()\n"
      let stale
      try {
        const entered = await waitForJson(path.join(fixture.directory, "resident-input-proof-entered.json"))
        assert.equal(entered.pid, session.transport.child.pid)
        assert.ok(entered.threadId > 0)
        session.changeDocument({ uri: uri("nested/Use.ets"), version: 2, text: changed })
        const barrier = await session.request("arkts/test/input-boundary-barrier", {}, { timeoutMs: 3000 })
        assert.equal(barrier.error?.code, -32601, "the main-process framed barrier must not enter the paused compiler")
      } finally { fs.writeFileSync(release, "resume") }
      stale = await session.transport.response(50, 20_000)
      assert.equal(stale.error?.code, -32801, JSON.stringify(stale))
      assert.equal(stale.result, undefined, "a changed nested authority forbids parent partial or stale success")
      const expected = ["Use.ets", "nested/Use.ets"].flatMap(file => [
        { uri: uri(file), range: range(1, 9, 20) }, { uri: uri(file), range: range(2, 25, 36) },
      ])
      expected.push({ uri: uri("nested/Use.ets"), range: range(3, 25, 36) })
      for (const includeDeclaration of [false, true]) {
        const recovered = await session.request("textDocument/references", {
          ...params, context: { includeDeclaration },
        }, { timeoutMs: 20_000 })
        assert.equal(recovered.error, undefined, JSON.stringify(recovered))
        const full = includeDeclaration ? [{ uri: uri("nested/Target.ets"), range: range(0, 13, 24) }, ...expected] : expected
        assert.deepEqual(recovered.result.map(item => JSON.stringify(item)).sort(),
          full.map(item => JSON.stringify(item)).sort())
      }
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("nested/Use.ets") && message.params.version === 2, 10_000)
      assert.deepEqual(latest.params.diagnostics, [])
      const operations = fs.readFileSync(path.join(fixture.directory, "resident-input-proof.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.ok(operations.some(row => row.kind === "hash-update" && row.pid === session.transport.child.pid))
      const transcript = session.transport.diagnosticSnapshot().transcript
      assert.equal(transcript.droppedEntries, 0)
      assert.equal(transcript.entries.filter(entry => entry.direction === "receive" && entry.id === 50).length, 1)
      t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", staleCode: stale.error.code,
        completeLocations: [expected.length, expected.length + 1], nativeHashUpdates: operations.length }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

function range(line, start, end) {
  return { start: { line, character: start }, end: { line, character: end } }
}

async function waitForJson(file) {
  const deadline = Date.now() + 5000
  while (!fs.existsSync(file)) {
    assert.ok(Date.now() < deadline, "native input hash barrier must be observed")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return JSON.parse(fs.readFileSync(file, "utf8"))
}
