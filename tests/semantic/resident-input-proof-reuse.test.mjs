import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("request-scoped compiler resolution avoids repeated native directory lookups and keeps its opt-out",
  { timeout: 60_000 }, async t => {
    for (const [imports, reuse] of [[20, undefined], [20, "0"], [40, undefined], [40, "0"]]) {
      const source = "export const value: number = 1\nexport const selected = value\n"
      const fixture = await makeQueryLayerFixture(t, { files: { "Query.ets": source },
        target: { kind: "definition", file: "Query.ets", symbol: "value",
          position: positionAt(source, source.lastIndexOf("value")) },
        oracle: { schemaVersion: 1, locations: [{ file: "Query.ets", range: range(0, 13, 18) }] },
      })
      const api = path.join(fixture.suite.sdk, "ets", "api")
      fs.mkdirSync(api)
      const references = []
      for (let index = 0; index < imports; index++) {
        const name = `@ohos.op02repeat${index}.d.ts`
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
      const response = await session.request("textDocument/definition", { textDocument: { uri },
        position: positionAt(source, source.lastIndexOf("value")) }, { timeoutMs: 10_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, [location(uri, 0, 13, 18)])
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
      const output = path.join(fixture.directory, "module-resolution-io.jsonl")
      assert.ok(fs.existsSync(output), "observe genuine native module lookup attempts, not synthetic memo hits")
      const rows = fs.readFileSync(output, "utf8").trim().split("\n").map(JSON.parse)
      assert.ok(rows.every(row => row.pid === session.transport.child.pid && row.threadId > 0))
      t.diagnostic(JSON.stringify({ imports, reuse: reuse ?? "default", nativeDirectoryProbes: rows.length,
        first: rows[0], last: rows.at(-1) }))
      if (reuse === "0") assert.equal(rows.length, imports * 2, "opt-out retains ordinary native fallback lookups")
      else assert.ok(rows.length > 0 && rows.length <= 2,
        "module cache overflow still resolves normally while bounded request presence avoids duplicate native probes")
      const packageDirectory = path.join(api, "node_modules", "op02-repeated-missing")
      fs.mkdirSync(packageDirectory, { recursive: true })
      fs.writeFileSync(path.join(packageDirectory, "package.json"), JSON.stringify({ types: "index.d.ts" }))
      fs.writeFileSync(path.join(packageDirectory, "index.d.ts"), "export declare class MissingType {}\n")
      const changedInputs = await session.request("textDocument/definition", { textDocument: { uri },
        position: positionAt(source, source.lastIndexOf("value")) }, { timeoutMs: 10_000 })
      assert.equal(changedInputs.error?.code, -32803, JSON.stringify(changedInputs))
      assert.equal(changedInputs.result, undefined, "a cached absence cannot certify changed inputs as current")
      const nextSdk = path.join(fixture.directory, "sdk-next")
      fs.cpSync(fixture.suite.sdk, nextSdk, { recursive: true })
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: nextSdk } } } } })
      const current = `// recovered 👩‍💻\n${source}`
      session.changeDocument({ uri, version: 2, text: current })
      const recovered = await session.request("textDocument/definition", { textDocument: { uri },
        position: positionAt(current, current.lastIndexOf("value")) }, { timeoutMs: 10_000 })
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      const offset = current.indexOf("value")
      assert.deepEqual(recovered.result, [{ uri, range: { start: positionAt(current, offset), end: positionAt(current, offset + 5) } }])
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri && message.params.version === 2, 10_000)
      assert.deepEqual(latest.params.diagnostics, [])
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a complete resident reference transaction hashes each actual input text once and keeps its opt-out",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const source = "export class TargetThing {}\n"
      const use = '// op02-pure-input 😀\nimport { TargetThing } from "./Target"\n'
        + "export const thing = new TargetThing()\n"
      const fixture = await makeQueryLayerFixture(t, {
        files: { "Target.ets": source, "Use.ets": use },
        target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
          position: { line: 0, character: 14 }, includeDeclaration: false },
        oracle: { schemaVersion: 1, locations: [
          { file: "Use.ets", range: range(1, 9, 20) },
          { file: "Use.ets", range: range(2, 25, 36) },
        ] },
      })
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const logs = path.join(fixture.directory, "logs")
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
      const output = path.join(fixture.directory, "resident-input-proof.jsonl")
      fs.writeFileSync(path.join(fixture.directory, "arm-resident-input-proof"), "{}")
      let observed = 0
      for (const includeDeclaration of [false, true]) {
        const response = await session.request("textDocument/references", {
          ...params, position: { ...params.position, character: params.position.character + Number(includeDeclaration) },
          context: { includeDeclaration },
        }, { timeoutMs: 20_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const expected = [location(uri("Use.ets"), 1, 9, 20), location(uri("Use.ets"), 2, 25, 36)]
        if (includeDeclaration) expected.unshift(location(uri("Target.ets"), 0, 13, 24))
        assert.deepEqual(response.result, expected)
        const operations = fs.readFileSync(output, "utf8").trim().split("\n").map(JSON.parse)
        const current = operations.slice(observed)
        observed = operations.length
        t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", includeDeclaration,
          hashUpdates: current.length, callers: current.map(operation => operation.caller) }))
        assert.ok(current.every(operation => operation.threadId > 0 && operation.inputBytes === Buffer.byteLength(use)))
        assert.equal(current.length, reuse === "0" ? 6 : 1,
          "pure text fingerprints can be reused inside one transaction, not across independent requests")
      }
      const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
      assert.equal(events.filter(event => event.event === "references.resident.hit").length, 2)
      assert.ok(!events.some(event => event.event === "references.cache.hit" || event.event === "references.batch.start"))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("a return-time disk change cannot publish the old resident locations after pure hash reuse",
  { timeout: 60_000 }, async t => {
    const source = "export class TargetThing {}\n"
    const use = '// op02-pure-input 😀\nimport { TargetThing } from "./Target"\n'
      + "export const thing = new TargetThing()\n"
    const hidden = 'import { TargetThing } from "./Target"\nexport const hidden = new TargetThing()\n'
    const changed = hidden + "export const extra = new TargetThing()\n"
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Target.ets": source, "Use.ets": use, "Hidden.ets": hidden },
      target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
        position: { line: 0, character: 14 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [...textLocations("Hidden.ets", hidden), ...textLocations("Use.ets", use)]
        .map(({ uri: file, range }) => ({ file, range })) },
    })
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const logs = path.join(fixture.directory, "logs")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
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
    const hiddenPath = path.join(fixture.suite.workspace, "Hidden.ets")
    fs.writeFileSync(path.join(fixture.directory, "arm-resident-input-proof"), JSON.stringify({
      mutation: { path: hiddenPath, content: changed },
    }))
    const references = () => session.request("textDocument/references", {
      ...params, context: { includeDeclaration: false },
    }, { timeoutMs: 20_000 })
    const response = await references()
    assert.equal(fs.readFileSync(hiddenPath, "utf8"), changed, "the real return-window mutation must execute")
    const expected = [...textLocations(uri("Hidden.ets"), changed), ...textLocations(uri("Use.ets"), use)]
    if (response.error) {
      assert.ok([-32801, -32803].includes(response.error.code), JSON.stringify(response.error))
      assert.equal(response.result, undefined)
    } else assert.deepEqual(response.result, expected, "never publish the old four locations as current")
    const operations = fs.readFileSync(path.join(fixture.directory, "resident-input-proof.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.ok(operations.some(operation => operation.kind === "disk-guard" && operation.mutated))
    const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
    t.diagnostic(JSON.stringify({ returnWindow: { errorCode: response.error?.code ?? null,
      locations: response.result?.length ?? null,
      guards: operations.filter(operation => operation.kind === "disk-guard"),
      rejected: events.filter(event => event.event === "references.resident.proof.rejected")
        .map(event => ({ stage: event.stage, reason: event.reason })),
    } }))
    assert.ok(events.some(event => event.event === "references.resident.proof.rejected"
      && event.stage === "admit" && ["configuration-changed", "disk-source-changed"].includes(event.reason)))
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Hidden.ets"), type: 2 }] } })
    session.changeDocument({ uri: uri("Use.ets"), version: 2, text: use })
    const current = await references()
    assert.equal(current.error, undefined, JSON.stringify(current.error))
    assert.deepEqual(current.result, expected)
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("fingerprint budget overflow keeps complete references and uses uncached calculation for excess input",
  { timeout: 60_000 }, async t => {
    const source = "export class TargetThing {}\n"
    const texts = {
      "AUse.ets": "// op02-pure-input capacity-a " + "a".repeat(2300 * 1024)
        + '\nimport { TargetThing } from "./Target"\nexport const first = new TargetThing()\n',
      "BUse.ets": "// op02-pure-input capacity-b " + "b".repeat(2400 * 1024)
        + '\nimport { TargetThing } from "./Target"\nexport const second = new TargetThing()\n',
    }
    const oracle = Object.entries(texts).flatMap(([file, text]) => textLocations(file, text)
      .map(({ uri: file, range }) => ({ file, range })))
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Target.ets": source, ...texts },
      target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
        position: { line: 0, character: 14 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: oracle },
    })
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const logs = path.join(fixture.directory, "logs")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/resident-input-proof-observer.cjs"))}` },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000,
      initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    for (const [file, text] of [["Target.ets", source], ...Object.entries(texts)]) {
      session.openDocument({ uri: uri(file), version: 1, text })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
    }
    const params = { textDocument: { uri: uri("Target.ets") }, position: { line: 0, character: 14 } }
    const warm = await session.request("textDocument/implementation", params, { timeoutMs: 20_000 })
    assert.equal(warm.error, undefined, JSON.stringify(warm.error))
    fs.writeFileSync(path.join(fixture.directory, "arm-resident-input-proof"), "{}")
    const response = await session.request("textDocument/references", {
      ...params, context: { includeDeclaration: false },
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const expected = Object.entries(texts).flatMap(([file, text]) => textLocations(uri(file), text))
    assert.deepEqual(response.result, expected)
    const operations = fs.readFileSync(path.join(fixture.directory, "resident-input-proof.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const counts = Object.values(texts).map(text => operations.filter(operation => (
      operation.kind === "hash-update" && operation.inputBytes === Buffer.byteLength(text))).length).sort((a, b) => a - b)
    t.diagnostic(JSON.stringify({ capacityHashUpdates: counts, inputCodeUnits: Object.values(texts).map(text => text.length) }))
    assert.deepEqual(counts, [1, 6], "overflow must calculate honestly rather than grow the memo or drop input")
    const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(events.filter(event => event.event === "references.resident.hit").length, 1)
    assert.ok(!events.some(event => event.event === "references.batch.start" || event.event === "references.cache.hit"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("cancelling during native input hashing publishes one cancellation and a fresh transaction recovers",
  { timeout: 60_000 }, async t => {
    const source = "export class TargetThing {}\n"
    const use = '// op02-pure-input cancellation 😀\nimport { TargetThing } from "./Target"\n'
      + "export const thing = new TargetThing()\n"
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Target.ets": source, "Use.ets": use },
      target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
        position: { line: 0, character: 14 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: textLocations("Use.ets", use)
        .map(({ uri: file, range }) => ({ file, range })) },
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
    fs.writeFileSync(path.join(fixture.directory, "arm-resident-input-proof"), JSON.stringify({ pause: true }))
    session.transport.send({ jsonrpc: "2.0", id: 50, method: "textDocument/references",
      params: { ...params, context: { includeDeclaration: false } } })
    let cancelled
    try {
      const entered = await waitForJson(path.join(fixture.directory, "resident-input-proof-entered.json"))
      assert.equal(entered.pid, session.transport.child.pid)
      assert.ok(entered.threadId > 0, "cancel only after the actual Worker has entered its first input hash")
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 50 } })
      cancelled = await session.transport.response(50, 3000)
      assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
      assert.equal(cancelled.result, undefined)
    } finally { fs.writeFileSync(release, "resume") }
    const recovered = await session.request("textDocument/references", {
      ...params, context: { includeDeclaration: false },
    }, { timeoutMs: 20_000 })
    assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
    assert.deepEqual(recovered.result, textLocations(uri("Use.ets"), use))
    const operations = fs.readFileSync(path.join(fixture.directory, "resident-input-proof.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.equal(operations.filter(operation => operation.kind === "hash-update").length, 2,
      "cancelled work cannot share a retained memo with the recovered transaction")
    const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(events.filter(event => event.event === "references.resident.hit").length, 1)
    const transcript = session.transport.diagnosticSnapshot().transcript
    assert.equal(transcript.droppedEntries, 0)
    assert.equal(transcript.entries.filter(entry => entry.direction === "receive" && entry.id === 50).length, 1)
    t.diagnostic(JSON.stringify({ cancelled: cancelled.error.code, recoveredLocations: recovered.result.length,
      nativeHashUpdates: operations.filter(operation => operation.kind === "hash-update").length }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("same-size same-mtime disk replacement is rejected by the return fence despite pure text hash reuse",
  { timeout: 60_000 }, async t => {
    const source = "export class TargetThing {}\n"
    const use = '// op02-pure-input same-size 😀\nimport { TargetThing } from "./Target"\n'
      + "export const thing = new TargetThing()\n"
    const hidden = 'import { TargetThing } from "./Target"\nexport class ShadowThing {}\n'
      + "export const hidden = new TargetThing()\n"
    const changed = hidden.replace("new TargetThing()", "new ShadowThing()")
    assert.equal(Buffer.byteLength(changed), Buffer.byteLength(hidden))
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Target.ets": source, "Use.ets": use, "Hidden.ets": hidden },
      target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
        position: { line: 0, character: 14 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [...textLocations("Hidden.ets", hidden), ...textLocations("Use.ets", use)]
        .map(({ uri: file, range }) => ({ file, range })) },
    })
    const hiddenPath = path.join(fixture.suite.workspace, "Hidden.ets")
    fs.utimesSync(hiddenPath, new Date("2020-01-01T00:00:00Z"), new Date("2020-01-01T00:00:00Z"))
    const before = fs.statSync(hiddenPath)
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const logs = path.join(fixture.directory, "logs")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
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
    fs.writeFileSync(path.join(fixture.directory, "arm-resident-input-proof"), JSON.stringify({
      mutation: { path: hiddenPath, content: changed, restoreMtime: true },
    }))
    const response = await session.request("textDocument/references", {
      ...params, context: { includeDeclaration: false },
    }, { timeoutMs: 20_000 })
    const after = fs.statSync(hiddenPath)
    assert.equal(fs.readFileSync(hiddenPath, "utf8"), changed)
    assert.equal(after.size, before.size)
    assert.equal(after.mtimeMs, before.mtimeMs, "the real mutation control must restore mtime")
    assert.notEqual(after.ctimeMs, before.ctimeMs, "full disk identity must still observe the real replacement")
    const events = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
    if (response.error) {
      assert.ok([-32801, -32803].includes(response.error.code), JSON.stringify(response.error))
      assert.equal(response.result, undefined)
    } else assert.deepEqual(response.result,
      [...textLocations(uri("Hidden.ets"), changed), ...textLocations(uri("Use.ets"), use)])
    assert.ok(events.some(event => event.event === "references.resident.proof.rejected"
      && event.stage === "admit" && event.reason === "disk-source-changed"))
    t.diagnostic(JSON.stringify({ sameSize: after.size, sameMtime: after.mtimeMs, ctimeChanged: true,
      errorCode: response.error?.code ?? null, currentLocations: response.result?.length ?? null }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

async function waitForJson(file, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"))
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error("Native hash-entry control did not execute")
}

function range(line, start, end) {
  return { start: { line, character: start }, end: { line, character: end } }
}

function location(uri, line, start, end) { return { uri, range: range(line, start, end) } }

function textLocations(uri, text) {
  return [...text.matchAll(/TargetThing/g)].map(match => {
    const lines = text.slice(0, match.index).split("\n")
    return location(uri, lines.length - 1, lines.at(-1).length, lines.at(-1).length + match[0].length)
  })
}
