import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { capturePreparedIdentity } from "../../scripts/bench/prepared-suite-input.mjs"
import { saveSuite } from "../support/prepared-suite-fixture.mjs"
import { assertColdOwnerRecovery, releasePreparedOwner } from "../support/semantic-preparation-state.mjs"

test("an edited resident-first miss revokes the failed observation before complete fallback",
  { timeout: 60_000 }, async t => {
    const source = "export class TargetThing {}\n"
    const use = 'import { TargetThing } from "./Target"\nexport const thing = new TargetThing()\n'
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Target.ets": source, "Use.ets": use },
      target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
        position: { line: 0, character: 14 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [{ file: "Use.ets", range: {
        start: { line: 0, character: 9 }, end: { line: 0, character: 20 },
      } }, { file: "Use.ets", range: {
        start: { line: 1, character: 25 }, end: { line: 1, character: 36 },
      } }] },
    })
    const api = path.join(fixture.suite.sdk, "ets", "api")
    fs.mkdirSync(api)
    for (let index = 0; index < 100; index += 1) {
      fs.writeFileSync(path.join(api, `@ohos.admission${index}.d.ts`), `interface Admission${index} {}\n`)
    }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const logs = path.join(fixture.directory, "logs")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "1",
        NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/resident-admission-io.cjs"))}` },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    await releasePreparedOwner(session, pathToFileURL(fixture.suite.workspace).href)
    session.openDocument({ uri: uri("Target.ets"), version: 1, text: source })
    session.openDocument({ uri: uri("Use.ets"), version: 1, text: use })
    const position = { line: 0, character: 14 }
    const warm = await session.request("textDocument/implementation", {
      textDocument: { uri: uri("Target.ets") }, position,
    }, { timeoutMs: 20_000 })
    assert.equal(warm.error, undefined, JSON.stringify(warm.error))
    const references = () => session.request("textDocument/references", {
      textDocument: { uri: uri("Target.ets") }, position, context: { includeDeclaration: false },
    }, { timeoutMs: 20_000 })
    const known = [location(uri("Use.ets"), 0, 9, 20), location(uri("Use.ets"), 1, 25, 36)]
    assert.deepEqual((await references()).result, known)
    const events = () => fs.readFileSync(path.join(logs, "server.log"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.ok(events().some(event => event.event === "references.resident.hit"), "the original observation is complete")
    fs.writeFileSync(path.join(fixture.directory, "arm-resident-admission-io"), "observe")
    session.changeDocument({ uri: uri("Use.ets"), version: 2,
      text: use + "export const extra = new TargetThing()\n" })
    const response = await references()
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual(response.result, [...known, location(uri("Use.ets"), 2, 25, 36)])
    const allEvents = events()
    const rejected = allEvents.find(event => event.event === "references.resident.proof.rejected"
      && event.reason === "inputs-changed")
    assert.ok(rejected, "the actual edited input must reject its old observation")
    const attempt = allEvents.filter(event => event.traceId === rejected.traceId)
    const misses = attempt.filter(event => event.event === "references.resident.miss")
    const batch = attempt.find(event => event.event === "references.batch.start")
    assert.ok(misses.length >= 2 && batch, "the trial miss must retain the normal complete fallback")
    const io = fs.readFileSync(path.join(fixture.directory, "resident-admission-io.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    const ownerThread = Math.min(...io.map(item => item.threadId))
    const repeatedSdkReads = io.filter(item => item.threadId === ownerThread
      && item.timestamp > Date.parse(misses[0].ts) && item.timestamp < Date.parse(batch.ts))
    t.diagnostic(`SDK leaf observations after first miss, before fallback: ${repeatedSdkReads.length}`)
    assert.equal(repeatedSdkReads.length, 0,
      "the same failed resident observation must not scan SDK inputs again before fallback")
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

function location(uri, line, start, end) {
  return { uri, range: { start: { line, character: start }, end: { line, character: end } } }
}

test("a known consecutive overlay reference edit can synchronize the complete existing owner without a cold verifier",
  { timeout: 60_000 }, async t => {
    const source = "export class TargetThing {}\n"
    const use = 'import { TargetThing } from "./Target"\nexport const thing = new TargetThing()\n'
    const fixture = await makeQueryLayerFixture(t, {
      files: { "Target.ets": source, "Use.ets": use },
      target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
        position: { line: 0, character: 14 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [{ file: "Use.ets", range: {
        start: { line: 0, character: 9 }, end: { line: 0, character: 20 },
      } }, { file: "Use.ets", range: {
        start: { line: 1, character: 25 }, end: { line: 1, character: 36 },
      } }] },
    })
    const api = path.join(fixture.suite.sdk, "ets", "api")
    fs.mkdirSync(api)
    for (let index = 0; index < 100; index++) {
      fs.writeFileSync(path.join(api, `@ohos.overlay${index}.d.ts`), `interface Overlay${index} {}\n`)
    }
    fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
    saveSuite(fixture)
    const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
    const logs = path.join(fixture.directory, "logs")
    const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "0",
        ARKTS_REFERENCES_OVERLAY_SYNC: "1" },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    session.openDocument({ uri: uri("Target.ets"), version: 1, text: source })
    session.openDocument({ uri: uri("Use.ets"), version: 1, text: use })
    const position = { line: 0, character: 14 }
    const warm = await session.request("textDocument/implementation", {
      textDocument: { uri: uri("Target.ets") }, position,
    }, { timeoutMs: 20_000 })
    assert.equal(warm.error, undefined, JSON.stringify(warm.error))
    const references = includeDeclaration => session.request("textDocument/references", {
      textDocument: { uri: uri("Target.ets") }, position, context: { includeDeclaration },
    }, { timeoutMs: 20_000 })
    const known = [location(uri("Use.ets"), 0, 9, 20), location(uri("Use.ets"), 1, 25, 36)]
    const declaration = location(uri("Target.ets"), 0, 13, 24)
    assert.deepEqual((await references(false)).result, known)
    assert.deepEqual((await references(true)).result, [declaration, ...known])
    const events = () => fs.readFileSync(path.join(logs, "server.log"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.ok(events().some(event => event.event === "references.resident.hit"), "the edit experiment requires a proved warm owner")
    const first = events().length
    session.changeDocument({ uri: uri("Use.ets"), version: 2,
      text: use + "export const extra = new TargetThing()\n" })
    const changed = [...known, location(uri("Use.ets"), 2, 25, 36)]
    for (const includeDeclaration of [false, true]) {
      const response = await references(includeDeclaration)
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, includeDeclaration ? [declaration, ...changed] : changed)
    }
    const actual = events().slice(first)
    assert.ok(actual.some(event => event.event === "references.resident.hit"),
      `the new input must obtain a fresh complete proof: ${JSON.stringify(actual.filter(event => event.event.startsWith("references.resident")))}`)
    assert.equal(actual.filter(event => event.event === "references.batch.start").length, 0,
      "a proven warm owner must not rebuild this edited scope in a cold verifier")
    assert.equal(actual.filter(event => event.event === "references.anchor.prepare").length, 0)
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("overlay synchronization does not create a cold resident owner for an unproved edit",
  { timeout: 60_000 }, async t => {
    const fixture = await startOverlayFixture(t)
    const { session, uri, use, references, events, known, declaration } = fixture
    assert.ok(!events().some(event => event.event === "semantic.context.create"),
      "this transcript starts without a resident owner")
    const first = events().length
    session.changeDocument({ uri: uri("Use.ets"), version: 2,
      text: use + "export const extra = new TargetThing()\n" })
    const changed = [...known, location(uri("Use.ets"), 2, 25, 36)]
    for (const includeDeclaration of [false, true]) {
      const response = await references(includeDeclaration)
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, includeDeclaration ? [declaration, ...changed] : changed)
    }
    const actual = events().slice(first)
    assertColdOwnerRecovery(actual)
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("overlay synchronization rejects an unproved version jump and returns the complete edited references",
  { timeout: 60_000 }, async t => {
    const { session, uri, use, references, events, known, declaration } = await startOverlayFixture(t, { warm: true })
    const first = events().length
    session.changeDocument({ uri: uri("Use.ets"), version: 4,
      text: use + "export const extra = new TargetThing()\n" })
    const changed = [...known, location(uri("Use.ets"), 2, 25, 36)]
    for (const includeDeclaration of [false, true]) {
      const response = await references(includeDeclaration)
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, includeDeclaration ? [declaration, ...changed] : changed)
    }
    const actual = events().slice(first)
    assert.ok(actual.some(event => event.event === "references.resident.proof.rejected"
      && event.reason === "overlay-sync-version-unproven"))
    assert.ok(actual.some(event => event.event === "references.batch.start"))
    assert.ok(!actual.some(event => event.event === "references.resident.hit"))
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 4, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("overlay synchronization cannot reuse an owner evicted by actual level3 pressure",
  { timeout: 60_000 }, async t => {
    const { session, uri, use, references, events, known, declaration } = await startOverlayFixture(t, {
      warm: true, benchmark: true,
    })
    const pressureAt = events().length
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    const deadline = performance.now() + 10_000
    const evicted = () => events().slice(pressureAt).some(event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3" && event.residentContextCount === 0)
    while (!evicted() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
    assert.ok(evicted(), "the real owner must be gone before testing reuse")
    const first = events().length
    session.changeDocument({ uri: uri("Use.ets"), version: 2,
      text: use + "export const extra = new TargetThing()\n" })
    const changed = [...known, location(uri("Use.ets"), 2, 25, 36)]
    for (const includeDeclaration of [false, true]) {
      const response = await references(includeDeclaration)
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, includeDeclaration ? [declaration, ...changed] : changed)
    }
    const actual = events().slice(first)
    assertColdOwnerRecovery(actual)
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("overlay synchronization cannot certify a reopened buffer as the old version lineage",
  { timeout: 60_000 }, async t => {
    const { session, uri, use, references, events, known, declaration } = await startOverlayFixture(t, { warm: true })
    const before = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(before.params.diagnostics, [])
    const first = events().length
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
      params: { textDocument: { uri: uri("Use.ets") } } })
    session.openDocument({ uri: uri("Use.ets"), version: 1,
      text: use + 'export const extra = new TargetThing()\nexport const broken: number = "wrong"\n' })
    const changed = [...known, location(uri("Use.ets"), 2, 25, 36)]
    for (const includeDeclaration of [false, true]) {
      const response = await references(includeDeclaration)
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      assert.deepEqual(response.result, includeDeclaration ? [declaration, ...changed] : changed)
    }
    const actual = events().slice(first)
    assert.ok(actual.some(event => event.event === "references.batch.start"))
    assert.ok(!actual.some(event => event.event === "references.resident.hit"))
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Use.ets") && message.params.version === 1, 10_000)
    assert.deepEqual(diagnostic.params.diagnostics.map(item => item.code), [2322])
    assert.deepEqual(diagnostic.params.diagnostics[0].range, location(uri("Use.ets"), 3, 13, 19).range)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("overlay synchronization cannot hide an unwatched same-size disk edit behind a known overlay change",
  { timeout: 60_000 }, async t => {
    for (const overlaySync of ["0", "1"]) {
      const original = "export const count = 0\n".padEnd(128, " ") + "\n"
      const fixture = await startOverlayFixture(t, { warm: true, files: { "Hidden.ets": original }, overlaySync })
      const { session, uri, use, references, events, known, declaration } = fixture
      const hidden = path.join(fixture.fixture.suite.workspace, "Hidden.ets")
      const stat = fs.statSync(hidden)
      const first = events().length
      fs.writeFileSync(hidden,
        'import { TargetThing } from "./Target"\nexport const hidden = new TargetThing()\n'.padEnd(128, " ") + "\n")
      fs.utimesSync(hidden, stat.atimeMs / 1000, stat.mtimeMs / 1000)
      const current = fs.statSync(hidden)
      assert.equal(current.size, stat.size)
      assert.ok(Math.abs(current.mtimeMs - stat.mtimeMs) < 0.001)
      session.changeDocument({ uri: uri("Use.ets"), version: 2,
        text: use + "export const extra = new TargetThing()\n" })
      const changed = [location(uri("Hidden.ets"), 0, 9, 20), location(uri("Hidden.ets"), 1, 26, 37),
        ...known, location(uri("Use.ets"), 2, 25, 36)]
      for (const includeDeclaration of [false, true]) {
        const response = await references(includeDeclaration)
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const expected = includeDeclaration ? [declaration, ...changed] : changed
        assert.deepEqual(response.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort(), overlaySync)
      }
      const actual = events().slice(first)
      assert.ok(actual.some(event => event.event === "references.index.fallback" && event.reason === "source-snapshot-changed"))
      assert.ok(actual.some(event => event.event === "references.plan.complete" && event.candidateFiles === event.membershipFiles))
      assert.ok(!actual.some(event => event.event === "references.resident.hit"))
      const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
      assert.deepEqual(diagnostic.params.diagnostics, [])
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

async function startOverlayFixture(t, { warm = false, benchmark = false, files = {}, overlaySync = "1" } = {}) {
  const source = "export class TargetThing {}\n"
  const use = 'import { TargetThing } from "./Target"\nexport const thing = new TargetThing()\n'
  const fixture = await makeQueryLayerFixture(t, {
    files: { "Target.ets": source, "Use.ets": use, ...files },
    target: { kind: "references", file: "Target.ets", symbol: "TargetThing",
      position: { line: 0, character: 14 }, includeDeclaration: false },
    oracle: { schemaVersion: 1, locations: [0, 1].map(line => ({ file: "Use.ets", range: {
      start: { line, character: line === 0 ? 9 : 25 }, end: { line, character: line === 0 ? 20 : 36 },
    } })) },
  })
  const api = path.join(fixture.suite.sdk, "ets", "api")
  fs.mkdirSync(api)
  for (let index = 0; index < 100; index++) {
    fs.writeFileSync(path.join(api, `@ohos.overlay${index}.d.ts`), `interface Overlay${index} {}\n`)
  }
  fixture.suite.pins = await capturePreparedIdentity(fixture.suite)
  saveSuite(fixture)
  const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
  const logs = path.join(fixture.directory, "logs")
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_REFERENCES_OVERLAY_SYNC: overlaySync },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  await releasePreparedOwner(session, pathToFileURL(fixture.suite.workspace).href)
  const initialEventCount = fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").length
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: source })
  session.openDocument({ uri: uri("Use.ets"), version: 1, text: use })
  const position = { line: 0, character: 14 }
  const references = includeDeclaration => session.request("textDocument/references", {
    textDocument: { uri: uri("Target.ets") }, position, context: { includeDeclaration },
  }, { timeoutMs: 20_000 })
  const events = () => fs.existsSync(path.join(logs, "server.log"))
    ? fs.readFileSync(path.join(logs, "server.log"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse).slice(initialEventCount) : []
  const known = [location(uri("Use.ets"), 0, 9, 20), location(uri("Use.ets"), 1, 25, 36)]
  const declaration = location(uri("Target.ets"), 0, 13, 24)
  if (warm) {
    const response = await session.request("textDocument/implementation", {
      textDocument: { uri: uri("Target.ets") }, position,
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual((await references(false)).result, known)
    assert.deepEqual((await references(true)).result, [declaration, ...known])
    assert.ok(events().some(event => event.event === "references.resident.hit"), "a proved warm owner is required")
  }
  return { session, uri, source, use, references, events, known, declaration, fixture }
}
