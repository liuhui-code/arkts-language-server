import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture, startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("an unconfigured RSS budget keeps complete public readiness above the former default", async t => {
  const f = await startReadinessFixture(t, reportedPressureEnvironment())
  const evidence = fs.readFileSync(path.join(f.directory, "reported-rss.jsonl"), "utf8")
    .trim().split("\n").map(JSON.parse)
  assert.equal(evidence[0].budget, null, "the child must actually have no configured budget")
  assert.equal(evidence[0].reportedRss, 8 * 1024 ** 3)
  assert.ok(evidence[0].actualRss < evidence[0].reportedRss, "do not allocate the synthetic RSS")
  const response = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.equal(response.result.semanticState, "ready", JSON.stringify(response))
  assert.deepEqual(response.result.unavailableReasons, [])
  assert.ok(!f.events().some(e => ["memory-level2", "memory-level3"].includes(e.reason)))
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
})

test("an explicit RSS budget still applies pressure after initial preparation", async t => {
  const f = await startReadinessFixture(t, reportedPressureEnvironment("4096"))
  assert.equal(f.initialPreparation.semanticState, "ready", "the initial exemption remains scoped")
  const response = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.equal(response.result.semanticState, "degraded")
  assert.deepEqual(response.result.unavailableReasons, ["resource-budget-exceeded"])
  assert.ok(f.events().some(e => e.reason === "memory-level3"), "an explicit budget may evict idle owners")
})

test("no RSS budget preserves warm Programs and fresh complete results through edit undo and reopen",
  { timeout: 45_000 }, async t => {
    const metricsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-no-rss-budget-"))
    const metricsFile = path.join(metricsDirectory, "metrics.jsonl")
    const f = await startReadinessFixture(t, {
      ...reportedPressureEnvironment(), ARKTS_MEMORY_METRICS_FILE: metricsFile,
    })
    t.after(() => fs.rmSync(metricsDirectory, { recursive: true, force: true }))
    const { session, sources, uri, rootUri, events } = f
    const original = sources["Main.ets"], originalTarget = sources["Unopened.ets"]
    const timings = [], generations = []
    const request = async (method, params) => {
      const started = performance.now()
      const response = await session.request(method, params, { timeoutMs: 20_000 })
      timings.push({ method, durationMs: performance.now() - started })
      assert.equal(response.error, undefined, JSON.stringify(response))
      return response.result
    }
    const occurrences = text => {
      const ranges = []
      for (let offset = text.indexOf("neverQueried"); offset >= 0; offset = text.indexOf("neverQueried", offset + 1)) {
        ranges.push({ start: positionAt(text, offset), end: positionAt(text, offset + "neverQueried".length) })
      }
      return ranges
    }
    const sorted = locations => locations.map(location => JSON.stringify(location)).sort()
    const query = async text => {
      const params = { textDocument: { uri: uri("Main.ets") },
        position: positionAt(text, text.lastIndexOf("neverQueried") + 1) }
      assert.deepEqual(await request("textDocument/definition", params),
        [{ uri: uri("Unopened.ets"), range: occurrences(originalTarget)[0] }])
      const expected = [...occurrences(text).map(range => ({ uri: uri("Main.ets"), range })),
        ...occurrences(originalTarget).map(range => ({ uri: uri("Unopened.ets"), range }))]
      assert.deepEqual(sorted(await request("textDocument/references",
        { ...params, context: { includeDeclaration: true } })), sorted(expected))
      const renamed = await request("textDocument/rename", { textDocument: { uri: uri("Unopened.ets") },
        position: occurrences(originalTarget)[0].start, newName: "renamedFunction" })
      const edits = renamed.documentChanges.flatMap(change => change.edits.map(edit => {
        assert.equal(edit.newText, "renamedFunction")
        return { uri: change.textDocument.uri, range: edit.range }
      }))
      assert.deepEqual(sorted(edits), sorted(expected), "complete rename must include the unsaved call")
      const hover = await request("textDocument/hover", params)
      assert.match(hover.contents.value, /neverQueried\(\): number/)
      const completion = await request("textDocument/completion", { ...params,
        position: positionAt(text, text.lastIndexOf("neverQueried") + 5) })
      const item = (Array.isArray(completion) ? completion : completion.items)
        .find(candidate => candidate.label === "neverQueried")
      assert.ok(item, "the live imported function remains available for completion")
      const resolved = await request("completionItem/resolve", item)
      assert.match(resolved.detail, /neverQueried/)
      const status = await request("arkts/semanticReadiness", { rootUri, prepare: false })
      assert.equal(status.semanticState, "ready", JSON.stringify(status))
      return status
    }
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: original })
    let version = 1
    await query(original)
    const contexts = events().filter(e => e.event === "semantic.context.create").length
    for (let round = 0; round < 6; round++) {
      const edited = original + `export const unsaved${round} = neverQueried()\n`
      session.changeDocument({ uri: uri("Main.ets"), version: ++version, text: edited })
      const fresh = await query(edited)
      for (let repeated = 0; repeated < 2; repeated++) {
        const warm = await query(edited)
        assert.equal(warm.semanticGeneration, fresh.semanticGeneration, "unchanged warm queries retain the same Program")
        assert.deepEqual(warm.inputIdentity, fresh.inputIdentity)
      }
      generations.push(fresh.semanticGeneration)
      session.changeDocument({ uri: uri("Main.ets"), version: ++version, text: original })
      await query(original)
      session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose",
        params: { textDocument: { uri: uri("Main.ets") } } })
      session.openDocument({ uri: uri("Main.ets"), version: ++version, text: original })
      await query(original)
    }
    assert.equal(events().filter(e => e.event === "semantic.context.create").length, contexts,
      "content versions and requests must not create a growing owner set")
    assert.ok(!events().some(e => ["memory-level2", "memory-level3"].includes(e.reason)))
    assert.equal(events().filter(e => e.event === "semantic.worker.started").length, 1)
    assert.equal(fs.readFileSync(path.join(f.workspace, "Main.ets"), "utf8"), original)
    const metrics = fs.readFileSync(metricsFile, "utf8").trim().split("\n").map(JSON.parse)
    assert.ok(metrics.every(row => row.rss === 8 * 1024 ** 3))
    assert.equal(metrics.at(-1).leaseCount, 0, "completed operations release their leases")
    assert.equal(metrics.at(-1).activeVerifierJobCount, 0)
    assert.ok(metrics.every(row => row.residentContextCount <= contexts))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    t.diagnostic(JSON.stringify({ qualification: "PRIVATE_SDK_SYNTHETIC_RSS_NOT_8GIB_ALLOCATION_OR_30K_SOAK",
      rounds: 6, contexts, generations, requests: timings.length, timings,
      firstMetrics: metrics[0], lastMetrics: metrics.at(-1),
      actualRss: fs.readFileSync(path.join(f.directory, "reported-rss.jsonl"), "utf8").trim().split("\n").map(JSON.parse) }))
  })

function reportedPressureEnvironment(budget) {
  return { ARKTS_MEMORY_BUDGET_MB: budget, ARKTS_BENCHMARK_CONTROL: "0",
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release",
      process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"),
    NODE_OPTIONS: `--require=${JSON.stringify(path.join(projectRoot, "tests/fixtures/reported-worker-rss.cjs"))}`,
    ARKTS_TEST_REPORTED_RSS_MIB: "8192" }
}

test("initial preparation covers every selected semantic group before a first query of the last module",
  { timeout: 30_000 }, async t => {
    const { session, workspace, rootUri, sdk, events, uri } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0" })
    const modules = Array.from({ length: 5 }, (_, index) => `module${index}`)
    fs.writeFileSync(path.join(workspace, "build-profile.json5"), JSON.stringify({
      app: { products: [{ name: "default" }] }, modules: modules.map(name => ({
        name, srcPath: `./${name}`, targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
    for (const [index, module] of modules.entries()) {
      const directory = path.join(workspace, module)
      fs.mkdirSync(path.join(directory, "src/main/ets"), { recursive: true })
      fs.writeFileSync(path.join(directory, "build-profile.json5"), "{targets:[{name:'default'}]}")
      fs.writeFileSync(path.join(directory, "oh-package.json5"), JSON.stringify({
        name: module, main: "./src/main/ets/Local.ets", dependencies: {} }))
      fs.writeFileSync(path.join(directory, "src/main/ets/Local.ets"), `export class Local${index} { value: number = ${index} }\n`)
      fs.writeFileSync(path.join(directory, "src/main/ets/Query.ets"),
        `import { Local${index} } from './Local'\nexport const selected = new Local${index}()\n`)
    }
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify(prepared.params))
    const created = events().filter(row => row.event === "semantic.context.create").length
    assert.equal(created, 6, "all five configured groups and the complete owner are initialized, without an arbitrary two-group limit")
    assert.ok(!events().some(row => row.event.endsWith("compiler-query.start")), "initialization does not prequery a target")
    const file = "module4/src/main/ets/Query.ets", text = fs.readFileSync(path.join(workspace, file), "utf8")
    session.openDocument({ uri: uri(file), version: 1, text })
    const response = await session.request("textDocument/definition", { textDocument: { uri: uri(file) },
      position: positionAt(text, text.lastIndexOf("Local4") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [{ uri: uri("module4/src/main/ets/Local.ets"), range: {
      start: { line: 0, character: 13 }, end: { line: 0, character: 19 } } }])
    assert.equal(events().filter(row => row.event === "semantic.context.create").length, created,
      "the first random query of the last module synchronizes its initialized language service")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

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

test("a partial SDK first preparation consumes its pressure exemption before a recovery request",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, sdk, workspace } = createReadinessFixture(t, {
      ARKTS_MEMORY_BUDGET_MB: "1", ARKTS_BENCHMARK_CONTROL: "0" })
    fs.writeFileSync(path.join(workspace, "Missing.ets"), 'import value from "@ohos.missing"\nexport { value }\n')
    await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
    const complete = await session.transport.notification("arkts/semanticPreparation",
      message => message.params.rootUri === rootUri && message.params.phase === "complete", 10_000)
    assert.equal(complete.params.report.semanticState, "partial")
    assert.deepEqual(complete.params.report.unavailableReasons, ["sdk-inputs-incomplete"],
      "the first attempt must finish the real compiler preparation above the pressure budget")
    const recovery = await session.request("arkts/semanticReadiness", { rootUri, prepare: true })
    assert.equal(recovery.error, undefined, JSON.stringify(recovery))
    assert.equal(recovery.result.semanticState, "degraded")
    assert.deepEqual(recovery.result.unavailableReasons, ["resource-budget-exceeded"],
      "missing inputs must not grant every recovery another pressure-exempt initialization")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

for (const caseSensitive of [undefined, "1"]) {
test("initialization parses supported SDK declarations without adding unused APIs to the Program"
  + (caseSensitive ? " with a case-sensitive compiler filesystem" : ""),
  { timeout: 30_000 }, async t => {
    const fixture = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096",
      ARKTS_TEST_CASE_SENSITIVE_FS: caseSensitive,
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

}

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
  const declaration = path.join(sdk, "ets", "component", "common.d.ts")
  assert.equal(rows.filter(row => row.file === declaration).length, 1,
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


test("readiness observations wait for a complete JSONL record and reject complete corrupt records", async t => {
  const { session, directory, events } = createReadinessFixture(t)
  await session.close()
  const logs = path.join(directory, "logs")
  fs.mkdirSync(logs, { recursive: true })
  const file = path.join(logs, "server.log")
  fs.writeFileSync(file, '{"event":"first"}\n{"event":"sec')
  assert.deepEqual(events(), [{ event: "first" }])
  fs.appendFileSync(file, 'ond"}\n')
  assert.deepEqual(events(), [{ event: "first" }, { event: "second" }])
  fs.appendFileSync(file, '{"event":\n')
  assert.throws(events, SyntaxError, "a completed corrupt record must remain an error")
})
