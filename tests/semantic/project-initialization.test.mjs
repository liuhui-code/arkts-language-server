import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture, startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

test("project initialization prepares real semantics automatically despite a one MiB pressure setting",
  { timeout: 30_000 }, async t => {
    const fixture = createReadinessFixture(t, { ARKTS_MEMORY_BUDGET_MB: "1", ARKTS_BENCHMARK_CONTROL: "0" })
    const { session, rootUri, sdk, events } = fixture
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const complete = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    const report = complete.params.report
    assert.equal(report.semanticState, "ready", JSON.stringify(report))
    assert.equal(report.coverage.projectSources, 2)
    assert.equal(report.coverage.sdkSources, 1)
    assert.ok(report.coverage.standardLibrarySources > 0)
    assert.equal(report.coverage.dependenciesComplete, true)
    assert.deepEqual(report.unavailableReasons, [])
    assert.equal(session.documentVersions.size, 0)
    assert.ok(!session.transport.messages.some(message => message.method === "arkts/semanticReadiness"))
    const completed = events().find(row => row.event === "semantic.initialization.complete")
    assert.equal(completed?.semanticState, "ready")
    assert.ok(completed.rssBytes > 1024 * 1024, "observe actual memory above the configured pressure setting")
    const status = await session.request("arkts/semanticReadiness", { rootUri, prepare: false })
    assert.equal(status.result.semanticState, "degraded")
    assert.deepEqual(status.result.unavailableReasons, ["resource-budget-exceeded"])
    const later = await session.request("arkts/semanticReadiness", { rootUri, prepare: true })
    assert.equal(later.result.semanticState, "degraded", "ordinary recovery does not renew the initialization exemption")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("initialization parses supported SDK declarations without adding unused APIs to the Program",
  { timeout: 30_000 }, async t => {
    const fixture = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/initial-preparation-parses.cjs"))}` })
    const { session, sdk, rootUri, directory } = fixture
    const api = path.join(sdk, "ets", "api", "@ohos.unused.d.ts")
    fs.mkdirSync(path.dirname(api), { recursive: true })
    fs.writeFileSync(api, "export class InitiallyUnused { value: number }\n")
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const complete = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(complete.params.report.semanticState, "ready", JSON.stringify(complete.params))
    assert.equal(complete.params.report.coverage.sdkSources, 1, "preparsed API must not become an ambient root")
    const rows = fs.readFileSync(path.join(directory, "initial-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(rows.filter(row => row.file === api).length, 1, "unused supported API syntax is prepared at initialization")
    assert.ok(rows.some(row => row.file === path.join(sdk, "ets", "component", "common.d.ts")))
    assert.ok(rows.some(row => /^lib\..*\.d\.ts$/.test(path.basename(row.file))))
    assert.equal(new Set(rows.map(row => row.threadId)).size, 1)
    const content = 'import { InitiallyUnused } from "@ohos.unused"\nexport const chosen = new InitiallyUnused()\n'
    session.openDocument({ uri: fixture.uri("Main.ets"), version: 1, text: content })
    const query = { textDocument: { uri: fixture.uri("Main.ets") }, position: { line: 1, character: 28 } }
    const definition = await session.request("textDocument/definition", query)
    const sdkLocation = line => [{ uri: pathToFileURL(api).href,
      range: { start: { line, character: 13 }, end: { line, character: 28 } } }]
    assert.deepEqual(definition.result, sdkLocation(0))
    const readParses = () => fs.readFileSync(path.join(directory, "initial-parses.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse)
    assert.equal(readParses().filter(row => row.file === api).length, 1, "first real API use must reuse the preparsed syntax")
    fs.writeFileSync(api, "// unnotified SDK edit\nexport class InitiallyUnused { value: number }\n")
    session.changeDocument({ uri: fixture.uri("Main.ets"), version: 2, text: content + "// refresh\n" })
    const fresh = await session.request("textDocument/definition", query)
    assert.equal(fresh.error?.code, -32803, "an unwitnessed SDK mutation cannot publish an old retained result")
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: sdk } } } } })
    const configured = await session.request("textDocument/definition", query)
    assert.deepEqual(configured.result, sdkLocation(1))
    assert.equal(readParses().filter(row => row.file === api).length, 2, "new SDK bytes must replace a prefetched syntax pin")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("automatic initialization catches up with documents opened and edited immediately after initialize",
  { timeout: 30_000 }, async t => {
    const { session, sdk, rootUri, uri, sources, directory } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/initial-preparation-parses.cjs"))}` })
    const api = path.join(sdk, "ets", "api", "@ohos.initialRace.d.ts")
    fs.mkdirSync(path.dirname(api), { recursive: true })
    fs.writeFileSync(api, "export class InitialRace {}\n")
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    session.changeDocument({ uri: uri("Main.ets"), version: 2, text: "// latest overlay\n" + sources["Main.ets"] })
    const complete = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(complete.params.report.semanticState, "ready", JSON.stringify(complete.params))
    const rows = fs.readFileSync(path.join(directory, "initial-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(rows.filter(row => row.file === api).length, 1, "initialization after immediate edits must still preparse the SDK catalog")
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: uri("Main.ets") }, position: { line: 2, character: 23 } })
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"),
      range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("SDK configuration recovery retains reference compilation in the initialized SDK owner", { timeout: 30_000 }, async t => {
  const { session, sdk, directory, uri, events } = await startReadinessFixture(t, {
    ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/initial-preparation-parses.cjs"))}` })
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: sdk } } } } })
  const response = await session.request("textDocument/references", { textDocument: { uri: uri("Main.ets") },
    position: { line: 1, character: 23 }, context: { includeDeclaration: true } })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(response.result, [
    { uri: uri("Main.ets"), range: { start: { line: 0, character: 9 }, end: { line: 0, character: 21 } } },
    { uri: uri("Main.ets"), range: { start: { line: 1, character: 22 }, end: { line: 1, character: 34 } } },
    { uri: uri("Unopened.ets"), range: { start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } },
  ])
  const rows = fs.readFileSync(path.join(directory, "initial-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
  assert.equal(rows.filter(row => row.file.endsWith("/sdk/ets/component/common.d.ts")).length, 1,
    "reference recovery must not cold-parse the same SDK in another verifier isolate")
  assert.ok(!events().some(row => row.event === "references.batch.start"))
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

test("a first references request joins initialization and uses the prepared compiler owner",
  { timeout: 30_000 }, async t => {
    const { session, sdk, rootUri, uri, sources, directory, events } = createReadinessFixture(t, {
      ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/initial-preparation-parses.cjs"))}` })
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    const response = await session.request("textDocument/references", { textDocument: { uri: uri("Main.ets") },
      position: { line: 1, character: 23 }, context: { includeDeclaration: true } }, { timeoutMs: 20_000 })
    const expected = Object.entries(sources).flatMap(([name, source]) => {
      const locations = []
      for (let offset = source.indexOf("neverQueried"); offset >= 0; offset = source.indexOf("neverQueried", offset + 1)) {
        locations.push({ uri: uri(name), range: {
          start: positionAt(source, offset), end: positionAt(source, offset + "neverQueried".length) } })
      }
      return locations
    })
    const sorted = value => value.map(location => JSON.stringify(location)).sort()
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted(expected))
    await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    const rows = fs.readFileSync(path.join(directory, "initial-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    const declaration = path.join(sdk, "ets", "component", "common.d.ts")
    t.diagnostic(JSON.stringify({ sdkParses: rows.filter(row => row.file === declaration),
      route: events().filter(row => row.event.startsWith("references.") || row.event.startsWith("semantic.initialization.")) }))
    assert.equal(rows.filter(row => row.file === declaration).length, 1,
      "the first query must join startup instead of creating a second SDK compiler in a verifier")
    assert.equal(new Set(rows.map(row => row.threadId)).size, 1)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
