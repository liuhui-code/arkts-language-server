import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("transient verifiers release real compiler Registry leases before publishing complete public references",
  { timeout: 60_000 }, async t => {
    const target = "export class Thing {}\n"
    const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
    const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": target, "Use.ets": use },
      target: { kind: "references", file: "Use.ets", symbol: "Thing",
        position: positionAt(use, use.lastIndexOf("Thing")), includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [use.indexOf("Thing"), use.lastIndexOf("Thing")]
        .map(start => ({ file: "Use.ets", range: {
          start: positionAt(use, start), end: positionAt(use, start + 5) } })) },
    })
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_REFERENCES_BATCH_ROOTS: "1",
        ARKTS_BENCHMARK_CONTROL: "1", ARKTS_L01_REGISTRY_PROBE_FILE: path.join(fixture.directory, "registry.jsonl"),
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/transient-release-order.cjs"))}` },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    for (const [file, text] of [["Target.ets", target], ["Use.ets", use]]) {
      session.openDocument({ uri: uri(file), version: 1, text })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
    }
    for (const includeDeclaration of [false, true]) {
      const response = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
        position: positionAt(use, use.lastIndexOf("Thing")), context: { includeDeclaration } }, { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const expected = [use.indexOf("Thing"), use.lastIndexOf("Thing")].map(start => location(uri("Use.ets"), use, start))
      if (includeDeclaration) expected.push(location(uri("Target.ets"), target, target.indexOf("Thing")))
      assert.deepEqual(sorted(response.result), sorted(expected))
    }
    const output = path.join(fixture.directory, "verifier-publications.jsonl")
    assert.ok(fs.existsSync(output), "observe actual transient verifier result publications")
    const publications = fs.readFileSync(output, "utf8").trim().split("\n").map(JSON.parse)
    assert.ok(publications.length >= 2, "one shared search retains separate anchor and final verifier jobs")
    assert.ok(publications.length <= 16, "keep private native receipt diagnostics bounded")
    t.diagnostic(JSON.stringify({ qualification: "NATIVE_REGISTRY_RECEIPTS_AT_PUBLICATION_NOT_PHYSICAL_RELEASE",
      publications }))
    for (const publication of publications) {
      assert.equal(publication.pid, session.transport.child.pid)
      assert.ok(publication.threadId > 0 && publication.responseOk === true)
      const before = publication.records.filter(record => record.phase === "before-dispose")
      const after = publication.records.filter(record => record.phase === "after-dispose")
      assert.equal(before.length, 1, "compiler disposal must start before result publication")
      assert.equal(after.length, 1, "compiler disposal must finish before result publication")
      assert.ok(before[0].sampledSourceFiles > 0 && before[0].totalRefCount > 0)
      assert.equal(after[0].sampleId, before[0].sampleId)
      assert.equal(after[0].serviceId, before[0].serviceId)
      assert.equal(after[0].projectRefCount, 0, "all project leases must be released")
      assert.equal(after[0].nonSdkRefCount, after[0].libraryRefCount)
      assert.equal(after[0].totalRefCount, after[0].sdkRefCount + after[0].libraryRefCount, "only SDK and compiler-library cache pins may survive")
      assert.equal(after[0].retainedSourceFiles, after[0].sdkRefCount + after[0].libraryRefCount)
    }
    t.diagnostic(JSON.stringify({ publications: publications.length, nativeRegistryReleaseBeforeReply: true }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a rejected transient SDK load releases its real Registry leases before publishing input failure",
  { timeout: 60_000 }, async t => {
    const target = "export class Thing {}\n"
    const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
    const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": target, "Use.ets": use },
      target: { kind: "references", file: "Use.ets", symbol: "Thing", includeDeclaration: false,
        position: positionAt(use, use.lastIndexOf("Thing")) },
      oracle: { schemaVersion: 1, locations: [use.indexOf("Thing"), use.lastIndexOf("Thing")]
        .map(start => ({ file: "Use.ets", range: {
          start: positionAt(use, start), end: positionAt(use, start + 5) } })) },
    })
    const api = path.join(fixture.suite.sdk, "ets", "api")
    fs.mkdirSync(api)
    fs.writeFileSync(path.join(api, "@ohos.unavailable.d.ts"), 'export { MissingType } from "op02-repeated-missing"\n')
    fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"),
      '/// <reference path="../api/@ohos.unavailable.d.ts" />\n')
    fs.writeFileSync(path.join(fixture.directory, "module-presence-window"), "arm")
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const preloads = ["transient-release-order.cjs", "module-resolution-io.cjs"]
      .map(file => `--require=${JSON.stringify(path.resolve("tests/fixtures", file))}`).join(" ")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
        ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_BENCHMARK_CONTROL: "1",
        ARKTS_L01_REGISTRY_PROBE_FILE: path.join(fixture.directory, "registry.jsonl"), NODE_OPTIONS: preloads },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    for (const [file, text] of [["Target.ets", target], ["Use.ets", use]]) {
      session.openDocument({ uri: uri(file), version: 1, text })
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
    }
    const response = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
      position: positionAt(use, use.lastIndexOf("Thing")), context: { includeDeclaration: false } }, { timeoutMs: 20_000 })
    assert.equal(response.error?.code, -32803, JSON.stringify(response))
    assert.equal(response.result, undefined)
    const marker = JSON.parse(fs.readFileSync(path.join(fixture.directory, "module-presence-mutated.json"), "utf8"))
    assert.equal(marker.pid, session.transport.child.pid)
    assert.ok(marker.threadId > 0 && marker.wasDirectory === true)
    const publications = fs.readFileSync(path.join(fixture.directory, "verifier-publications.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const failure = publications.find(publication => publication.responseOk === false)
    assert.ok(failure, "observe the genuine rejected verifier result publication")
    assert.equal(failure.pid, session.transport.child.pid)
    assert.equal(failure.threadId, marker.threadId)
    const before = failure.records.filter(record => record.phase === "before-dispose")
    const after = failure.records.filter(record => record.phase === "after-dispose")
    assert.equal(before.length, 1)
    assert.equal(after.length, 1)
    assert.ok(before[0].sampledSourceFiles > 0 && before[0].totalRefCount > 0)
    assert.equal(after[0].sampleId, before[0].sampleId)
    assert.equal(after[0].projectRefCount, 0)
    assert.equal(after[0].nonSdkRefCount, after[0].libraryRefCount)
    assert.equal(after[0].totalRefCount, after[0].sdkRefCount + after[0].libraryRefCount)
    assert.equal(after[0].retainedSourceFiles, after[0].sdkRefCount + after[0].libraryRefCount)
    t.diagnostic(JSON.stringify({ qualification: "REJECTED_NATIVE_SDK_LOAD_NOT_PHYSICAL_RELEASE", marker, failure }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

function location(uri, text, start) {
  return { uri, range: { start: positionAt(text, start), end: positionAt(text, start + 5) } }
}

function sorted(locations) {
  return locations.map(location => JSON.stringify(location)).sort()
}
