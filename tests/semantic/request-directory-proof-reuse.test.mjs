import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("a request reuses witnessed directory presence beyond module-cache capacity without certifying later creation",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const source = "export const value: number = 1\nexport const selected = value\n"
      const imports = 60
      const fixture = await makeQueryLayerFixture(t, { files: { "Query.ets": source },
        target: { kind: "definition", file: "Query.ets", symbol: "value",
          position: positionAt(source, source.lastIndexOf("value")) },
        oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: range(0, 13, 18) }] },
      })
      const api = path.join(fixture.suite.sdk, "ets", "api")
      fs.mkdirSync(api)
      const references = []
      for (let index = 0; index < imports; index++) {
        const name = `@ohos.directoryProof${index}.d.ts`
        fs.writeFileSync(path.join(api, name), 'export { MissingType } from "op02-repeated-missing"\n')
        references.push(`/// <reference path="../api/${name}" />`)
      }
      fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), references.join("\n") + "\n")
      const uri = pathToFileURL(path.join(fixture.suite.workspace, "Query.ets")).href
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
          ARKTS_QUERY_MODULE_RESOLUTION_REUSE: reuse,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/module-resolution-io.cjs"))}` },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      session.openDocument({ uri, version: 1, text: source })
      const params = { textDocument: { uri }, position: positionAt(source, source.lastIndexOf("value")) }
      const response = await session.request("textDocument/definition", params, { timeoutMs: 10_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [{ uri, range: range(0, 13, 18) }])
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
      const rows = fs.readFileSync(path.join(fixture.directory, "module-resolution-io.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.ok(rows.every(row => row.pid === session.transport.child.pid && row.threadId > 0))
      t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", imports, nativeDirectoryProbes: rows.length }))
      if (reuse === "0") assert.equal(rows.length, imports * 2)
      else assert.ok(rows.length > 0 && rows.length <= 2,
        "bounded witnessed presence must avoid repeated native probes even after compiler resolution capacity")
      const packageDirectory = path.join(api, "node_modules", "op02-repeated-missing")
      fs.mkdirSync(packageDirectory, { recursive: true })
      fs.writeFileSync(path.join(packageDirectory, "package.json"), JSON.stringify({ types: "index.d.ts" }))
      fs.writeFileSync(path.join(packageDirectory, "index.d.ts"), "export declare class MissingType {}\n")
      const changed = await session.request("textDocument/definition", params, { timeoutMs: 10_000 })
      assert.equal(changed.error?.code, -32803, JSON.stringify(changed))
      assert.equal(changed.result, undefined, "no cross-request stale absence may certify current inputs")
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

for (const opened of [false, true]) {
for (const reuse of [undefined, "0"]) {
test(`a ${opened ? "opened" : "never-opened"} caller's READY refresh retains unchanged SDK resolutions (${reuse ?? "default"})`,
  { timeout: 60_000 }, async t => {
    const source = 'import { value } from "./Dependency"\nexport const selected = value\n'
    const fixture = await makeQueryLayerFixture(t, { files: { "Query.ets": source,
      "Dependency.ets": "export const value: number = 1\n" },
      target: { kind: "definition", file: "Query.ets", symbol: "value",
        position: positionAt(source, source.lastIndexOf("value")) },
      oracle: { schemaVersion: 1, locations: [{ file: "Dependency.ets", range: range(0, 13, 18) }] },
    })
    const imports = 60, api = path.join(fixture.suite.sdk, "ets", "api")
    fs.mkdirSync(api)
    const references = []
    for (let index = 0; index < imports; index++) {
      const name = `@ohos.readyResolution${index}.d.ts`
      fs.writeFileSync(path.join(api, name), 'export { SharedType } from "op04-ready-shared"\n')
      references.push(`/// <reference path="../api/${name}" />`)
    }
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), references.join("\n") + "\n")
    // A real ancestor package resolves successfully; api/node_modules remains an observed absence.
    const shared = path.join(fixture.suite.sdk, "ets", "node_modules", "op04-ready-shared")
    fs.mkdirSync(shared, { recursive: true })
    fs.writeFileSync(path.join(shared, "package.json"), JSON.stringify({ types: "index.d.ts" }))
    fs.writeFileSync(path.join(shared, "index.d.ts"), "export interface SharedType { value: number }\n")
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const rootUri = pathToFileURL(fixture.suite.workspace).href
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"], rootUri,
      capabilities: { textDocument: { hover: { contentFormat: ["plaintext"] },
        publishDiagnostics: { versionSupport: true } } },
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk, ARKTS_BENCHMARK_CONTROL: "0",
        ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
        ARKTS_QUERY_MODULE_RESOLUTION_REUSE: reuse,
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/module-resolution-io.cjs"))}` },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    const diagnostics = async version => assert.deepEqual((await session.transport.notification(
      "textDocument/publishDiagnostics", message => message.params.uri === uri("Query.ets")
        && message.params.version === version, 10_000)).params.diagnostics, [])
    if (opened) { session.openDocument({ uri: uri("Query.ets"), version: 1, text: source }); await diagnostics(1) }
    const prepared = await session.request("arkts/semanticReadiness", { rootUri, prepare: true }, { timeoutMs: 20_000 })
    assert.equal(prepared.result?.semanticState, "ready", JSON.stringify(prepared))
    const params = { textDocument: { uri: uri("Query.ets") }, position: positionAt(source, source.lastIndexOf("value")) }
    assert.deepEqual((await session.request("textDocument/definition", params)).result,
      [{ uri: uri("Dependency.ets"), range: range(0, 13, 18) }])
    const rows = () => fs.readFileSync(path.join(fixture.directory, "module-resolution-io.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const offset = rows().length
    fs.writeFileSync(path.join(fixture.suite.workspace, "Dependency.ets"),
      '// current dependency 👩‍💻\nexport const value: string = "current"\n')
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Dependency.ets"), type: 2 }] } })
    const current = await session.request("textDocument/definition", params, { timeoutMs: 20_000 })
    assert.equal(current.error, undefined, JSON.stringify(current))
    assert.deepEqual(current.result, [{ uri: uri("Dependency.ets"), range: range(1, 13, 18) }])
    const observations = rows().slice(offset)
    assert.ok(observations.every(row => row.pid === session.transport.child.pid && row.threadId > 0))
    const ready = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
    assert.notEqual(ready.result.inputIdentity.sourcesSha256, prepared.result.inputIdentity.sourcesSha256)
    assert.deepEqual(ready.result.coverage, prepared.result.coverage)
    assert.deepEqual(ready.result.readyCapabilities, prepared.result.readyCapabilities)
    assert.deepEqual((await session.request("textDocument/hover", { textDocument: params.textDocument,
      position: positionAt(source, source.indexOf("selected")) })).result, {
      contents: { kind: "plaintext", value: "const selected: string" }, range: range(1, 13, 21) })
    assert.equal(session.documentVersions.size, opened ? 1 : 0)
    assert.equal(session.documentVersions.has(uri("Dependency.ets")), false)
    if (opened) { session.changeDocument({ uri: uri("Query.ets"), version: 2, text: source }); await diagnostics(2) }
    else { assert.ok(!session.transport.messages.some(message => message.method === "textDocument/publishDiagnostics"))
      session.openDocument({ uri: uri("Query.ets"), version: 1, text: source }); await diagnostics(1) }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    t.diagnostic(JSON.stringify({ opened, reuse: reuse ?? "default", imports,
      nativeDirectoryProbes: observations.length, completeDefinition: current.result, coverage: ready.result.coverage }))
    assert.equal(observations.length, 0,
      "a project-only edit must retain SDK resolutions even when request-local lookup reuse is disabled")
  })
}
}

function range(line, start, end) {
  return { start: { line, character: start }, end: { line, character: end } }
}
