import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { releasePreparedOwner } from "../support/semantic-preparation-state.mjs"

test("serial reference jobs reuse SDK syntax across jobs and refresh changed SDK bytes and configuration", { timeout: 60_000 }, async t => {
  const target = "export class Thing extends SdkBase {}\n"
  const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
  const fixture = await makeQueryLayerFixture(t, {
    files: { "Target.ets": target, "Use.ets": use, "Other.ets": use },
    target: { kind: "references", file: "Use.ets", symbol: "Thing", includeDeclaration: false,
      position: positionAt(use, use.lastIndexOf("Thing")) }, oracle: { schemaVersion: 1, locations: [] },
  })
  const sdkFile = path.join(fixture.suite.sdk, "ets", "component", "common.d.ts")
  fs.writeFileSync(sdkFile, "declare class SdkBase { value: string }\n")
  const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
      ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
      ARKTS_MEMORY_METRICS_FILE: path.join(fixture.directory, "metrics.jsonl"),
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_REFERENCES_BATCH_ROOTS: "1",
      ARKTS_BENCHMARK_CONTROL: "1",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/sdk-parse-observer.cjs"))}` },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  await releasePreparedOwner(session, pathToFileURL(fixture.suite.workspace).href)
  session.openDocument({ uri: uri("Use.ets"), version: 1, text: use })
  const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri("Use.ets") && message.params.version === 1, 10_000)
  assert.deepEqual(diagnostic.params.diagnostics, [])
  let firstSearchJobs = 0
  for (const includeDeclaration of [false, true]) {
    const response = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
      position: positionAt(use, use.lastIndexOf("Thing")), context: { includeDeclaration } }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const expected = ["Use.ets", "Other.ets"].flatMap(file => [use.indexOf("Thing"), use.lastIndexOf("Thing")]
      .map(start => location(uri(file), use, start)))
    if (includeDeclaration) expected.push(location(uri("Target.ets"), target, target.indexOf("Thing")))
    assert.deepEqual(sorted(response.result), sorted(expected))
    const jobs = readRows(path.join(fixture.directory, "cache-completions.jsonl")).length
    if (!includeDeclaration) firstSearchJobs = jobs
    else assert.equal(jobs, firstSearchJobs, "declaration policy reuses the same complete compiler search")
  }
  const trace = fs.readFileSync(path.join(fixture.directory, "logs", "server.log"), "utf8").trim().split("\n").map(JSON.parse)
    .filter(row => ["references.anchor.complete", "references.batch.complete"].includes(row.event))
  assert.ok(trace.length > 2)
  assert.equal(trace[0].workerReused, false)
  assert.ok(trace.slice(1).every(row => row.workerReused === true), "trace distinguishes reused SDK Worker jobs from physical startup")
  const parses = fs.readFileSync(path.join(fixture.directory, "sdk-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
  const sdkParses = parses.filter(row => row.file === sdkFile)
  assert.equal(sdkParses.length, 1, "unchanged SDK must be parsed once across anchor and reference jobs")
  const libraryParses = readRows(path.join(fixture.directory, "stdlib-parses.jsonl"))
  assert.ok(libraryParses.length > 0, "observe actual compiler standard-library parsing")
  const libraryCounts = new Map()
  for (const row of libraryParses) libraryCounts.set(row.file, (libraryCounts.get(row.file) ?? 0) + 1)
  assert.ok([...libraryCounts.values()].every(count => count === 1),
    `unchanged compiler libraries must parse once across jobs: ${JSON.stringify([...libraryCounts])}`)
  assert.equal(new Set(parses.map(row => row.threadId)).size, 1, "one serial Worker owns the current SDK cache")
  assert.ok(parses.filter(row => row.file.endsWith("Target.ets")).length > 1, "each job still rebuilds project syntax")
  // No configuration notification: same SDK path and host version "0", different bytes.
  fs.writeFileSync(sdkFile, "declare class SdkBase { replacement: number }\n")
  const changed = use + "export const extra = new Thing()\n"
  session.changeDocument({ uri: uri("Use.ets"), version: 2, text: changed })
  const fresh = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
    position: positionAt(changed, changed.lastIndexOf("Thing")), context: { includeDeclaration: false } }, { timeoutMs: 20_000 })
  assert.equal(fresh.error, undefined, JSON.stringify(fresh))
  const expectedFresh = [use.indexOf("Thing"), use.lastIndexOf("Thing"), changed.lastIndexOf("Thing")]
    .map(start => location(uri("Use.ets"), changed, start))
  expectedFresh.push(...[use.indexOf("Thing"), use.lastIndexOf("Thing")].map(start => location(uri("Other.ets"), use, start)))
  assert.deepEqual(sorted(fresh.result), sorted(expectedFresh))
  const afterEdit = readParses(fixture)
  assert.equal(afterEdit.filter(row => row.file === sdkFile).length, 2, "changed SDK bytes must reparse despite constant host version")
  assert.equal(new Set(afterEdit.map(row => row.threadId)).size, 1, "a byte refresh reuses the serial Worker")

  const loader = path.join(fixture.suite.sdk, "ets", "build-tools", "ets-loader")
  fs.mkdirSync(loader, { recursive: true })
  fs.writeFileSync(path.join(loader, "tsconfig.json"), JSON.stringify({ compilerOptions: { ets: { components: ["CacheChanged"] } } }))
  const loaderOverlay = changed + "// loader changed\n"
  session.changeDocument({ uri: uri("Use.ets"), version: 3, text: loaderOverlay })
  const loaderResult = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
    position: positionAt(loaderOverlay, loaderOverlay.lastIndexOf("Thing")), context: { includeDeclaration: false } }, { timeoutMs: 20_000 })
  assert.equal(loaderResult.error, undefined, JSON.stringify(loaderResult))
  assert.deepEqual(sorted(loaderResult.result), sorted(expectedFresh))
  assert.equal(readParses(fixture).filter(row => row.file === sdkFile).length, 3, "loader parsing options replace incompatible SDK syntax")

  const sdkNext = path.join(fixture.directory, "sdk-next")
  fs.cpSync(fixture.suite.sdk, sdkNext, { recursive: true })
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: sdkNext } } } } })
  const configured = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
    position: positionAt(changed, changed.lastIndexOf("Thing")), context: { includeDeclaration: true } }, { timeoutMs: 20_000 })
  assert.equal(configured.error, undefined, JSON.stringify(configured))
  assert.deepEqual(sorted(configured.result), sorted([...expectedFresh, location(uri("Target.ets"), target, target.indexOf("Thing"))]))
  const configuredJobs = readRows(path.join(fixture.directory, "cache-completions.jsonl")).length
  const configuredUsages = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
    position: positionAt(changed, changed.lastIndexOf("Thing")), context: { includeDeclaration: false } }, { timeoutMs: 20_000 })
  assert.equal(configuredUsages.error, undefined, JSON.stringify(configuredUsages))
  assert.deepEqual(sorted(configuredUsages.result), sorted(expectedFresh))
  assert.equal(readRows(path.join(fixture.directory, "cache-completions.jsonl")).length, configuredJobs,
    "including declarations first also serves the excluding-declarations policy without more compiler jobs")
  const definition = await session.request("textDocument/definition", { textDocument: { uri: uri("Target.ets") },
    position: positionAt(target, target.indexOf("SdkBase") + 1) }, { timeoutMs: 10_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition))
  assert.equal(definition.result[0].uri, pathToFileURL(path.join(sdkNext, "ets", "component", "common.d.ts")).href)
  const metrics = fs.readFileSync(path.join(fixture.directory, "metrics.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
  assert.ok(metrics.some(row => row.referenceSdkCacheWorkerCount === 1))
  assert.equal(metrics.at(-1).referenceSdkCacheWorkerCount, 0, "SDK configuration replacement releases the old physical cache Worker")
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

function location(uri, text, start) {
  return { uri, range: { start: positionAt(text, start), end: positionAt(text, start + 5) } }
}
function sorted(locations) { return locations.map(value => JSON.stringify(value)).sort() }

function readParses(fixture) {
  return fs.readFileSync(path.join(fixture.directory, "sdk-parses.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
}

test("an external SDK declaration does not poison usage-only search or become a cached complete declaration result", async t => {
  const use = "export const selected = new SdkBase()\n"
  const fixture = await makeQueryLayerFixture(t, { files: { "Use.ets": use },
    target: { kind: "references", file: "Use.ets", symbol: "SdkBase", includeDeclaration: false,
      position: positionAt(use, use.indexOf("SdkBase")) }, oracle: { schemaVersion: 1, locations: [] } })
  fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), "declare class SdkBase {}\n")
  const uri = pathToFileURL(path.join(fixture.suite.workspace, "Use.ets")).href
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk, ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0" } })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  session.openDocument({ uri, version: 1, text: use })
  const ask = includeDeclaration => session.request("textDocument/references", { textDocument: { uri },
    position: positionAt(use, use.indexOf("SdkBase")), context: { includeDeclaration } }, { timeoutMs: 20_000 })
  const usages = await ask(false)
  assert.equal(usages.error, undefined, JSON.stringify(usages))
  const expected = [{ uri, range: { start: positionAt(use, use.indexOf("SdkBase")),
    end: positionAt(use, use.indexOf("SdkBase") + "SdkBase".length) } }]
  assert.deepEqual(usages.result, expected)
  const declarations = await ask(true)
  assert.equal(declarations.error?.code, -32803, JSON.stringify(declarations))
  assert.equal(declarations.result, undefined)
  assert.deepEqual((await ask(false)).result, expected)
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

test("optional policy reuse does not overflow a previously valid complete reference response", { timeout: 30_000 }, async t => {
  const source = "export const value = 1\nexport const selected = [\n" + "value,\n".repeat(5_000) + "]\n"
  const fixture = await makeQueryLayerFixture(t, { files: { "Use.ets": source },
    target: { kind: "references", file: "Use.ets", symbol: "value", includeDeclaration: false,
      position: positionAt(source, source.lastIndexOf("value")) }, oracle: { schemaVersion: 1, locations: [] } })
  const uri = pathToFileURL(path.join(fixture.suite.workspace, "Use.ets")).href
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk, ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0" } })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  session.openDocument({ uri, version: 1, text: source })
  const response = await session.request("textDocument/references", { textDocument: { uri },
    position: positionAt(source, source.lastIndexOf("value")), context: { includeDeclaration: false } }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const expected = Array.from({ length: 5_000 }, (_, index) => ({ uri,
    range: { start: { line: index + 2, character: 0 }, end: { line: index + 2, character: 5 } } }))
  assert.deepEqual(response.result, expected)
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

test("serial verifier reuses SDK candidate probes and refreshes unnotified creation, deletion and symlinks", { timeout: 60_000 }, async t => {
  const target = "export class Thing extends SdkBase {}\n"
  const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
  const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": target, "Use.ets": use, "Other.ets": use },
    target: { kind: "references", file: "Use.ets", symbol: "Thing", includeDeclaration: false,
      position: positionAt(use, use.lastIndexOf("Thing")) }, oracle: { schemaVersion: 1, locations: [] } })
  const api = path.join(fixture.suite.sdk, "ets", "api")
  fs.mkdirSync(api)
  fs.writeFileSync(path.join(api, "SharedBase.d.ts"), "export interface SharedType { value: string }\n")
  const declarations = Array.from({ length: 20 }, (_, index) => {
    const name = `@ohos.lookup${index}.d.ts`
    fs.writeFileSync(path.join(api, name), 'export { SharedType } from "./SharedBase"\n')
    return `/// <reference path="../api/${name}" />`
  })
  fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"),
    declarations.join("\n") + '\ndeclare class SdkBase { value: import("../api/SharedBase").SharedType }\n')
  const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
      ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_REFERENCES_BATCH_ROOTS: "1",
      NODE_OPTIONS: ["sdk-parse-observer.cjs", "sdk-candidate-io.cjs"]
        .map(file => `--require=${JSON.stringify(path.resolve("tests/fixtures", file))}`).join(" ") } })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  session.openDocument({ uri: uri("Use.ets"), version: 1, text: use })
  let version = 1
  const ask = async (includeDeclaration, refresh = false) => {
    const text = refresh ? use + `// revision ${++version}\n` : use
    if (refresh) session.changeDocument({ uri: uri("Use.ets"), version, text })
    const response = await session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
      position: positionAt(use, use.lastIndexOf("Thing")), context: { includeDeclaration } }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response))
    const expected = ["Use.ets", "Other.ets"].flatMap(file => [use.indexOf("Thing"), use.lastIndexOf("Thing")]
      .map(start => location(uri(file), use, start)))
    if (includeDeclaration) expected.push(location(uri("Target.ets"), target, target.indexOf("Thing")))
    assert.deepEqual(sorted(response.result), sorted(expected))
  }
  await ask(false)
  await ask(true)
  const workers = new Set(readRows(path.join(fixture.directory, "cache-jobs.jsonl")).map(row => row.threadId))
  const attempts = () => readRows(path.join(fixture.directory, "sdk-candidate-io.jsonl"))
    .filter(row => workers.has(row.threadId)).length
  assert.ok(attempts() > 0 && attempts() <= 8,
    `SDK absence is captured once and revalidated without repeated leaf probes: ${attempts()}`)
  const candidate = path.join(api, "SharedBase.ets")
  fs.writeFileSync(candidate, "export interface SharedType { replacement: number }\n")
  await ask(false, true)
  assert.ok(readParses(fixture).some(row => row.file === candidate), "new higher-priority SDK source is actually parsed")
  const afterCreate = attempts()
  fs.unlinkSync(candidate)
  await ask(false, true)
  assert.ok(attempts() > afterCreate, "deletion invalidates the cached SDK candidate")
  const first = path.join(api, "First.ets"), second = path.join(api, "Second.ets")
  fs.writeFileSync(first, "export interface SharedType { first: number }\n")
  fs.writeFileSync(second, "export interface SharedType { second: number }\n")
  fs.symlinkSync(first, candidate)
  await ask(false, true)
  const beforeRetarget = readParses(fixture).filter(row => row.file === candidate).length
  fs.unlinkSync(candidate)
  fs.symlinkSync(second, candidate)
  await ask(false, true)
  assert.ok(readParses(fixture).filter(row => row.file === candidate).length > beforeRetarget,
    "retargeted SDK links refresh actual syntax at the unchanged lexical path")
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})


test("cancelling a warm SDK job retires its physical Worker and exact references recover", { timeout: 60_000 }, async t => {
  const target = "export class Thing {}\n"
  const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
  const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": target, "Use.ets": use },
    target: { kind: "references", file: "Use.ets", symbol: "Thing", includeDeclaration: false,
      position: positionAt(use, use.lastIndexOf("Thing")) }, oracle: { schemaVersion: 1, locations: [] } })
  const uri = pathToFileURL(path.join(fixture.suite.workspace, "Use.ets")).href
  const metricsFile = path.join(fixture.directory, "metrics.jsonl")
  const jobsFile = path.join(fixture.directory, "cache-jobs.jsonl")
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
      ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
      ARKTS_MEMORY_METRICS_FILE: metricsFile, ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "1000",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/sdk-parse-observer.cjs"))}` } })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  session.openDocument({ uri, version: 1, text: use })
  const parameters = text => ({ textDocument: { uri }, position: positionAt(text, text.lastIndexOf("Thing")),
    context: { includeDeclaration: false } })
  const warm = await session.request("textDocument/references", parameters(use), { timeoutMs: 20_000 })
  assert.equal(warm.error, undefined, JSON.stringify(warm))
  assert.equal(readParses(fixture).filter(row => row.file.endsWith("common.d.ts")).length, 1)
  const readyBefore = readRows(jobsFile).length
  const changed = use + "export const extra = new Thing()\n"
  session.changeDocument({ uri, version: 2, text: changed })
  const id = session.nextRequestId++
  session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/references", params: parameters(changed) })
  const pending = session.transport.response(id, 20_000)
  await waitUntil(() => readRows(jobsFile).length > readyBefore)
  session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
  const cancelled = await pending
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
  assert.equal(cancelled.result, undefined)
  const recovered = await session.request("textDocument/references", parameters(changed), { timeoutMs: 20_000 })
  assert.equal(recovered.error, undefined, JSON.stringify(recovered))
  assert.deepEqual(sorted(recovered.result), sorted([use.indexOf("Thing"), use.lastIndexOf("Thing"), changed.lastIndexOf("Thing")]
    .map(start => location(uri, changed, start))))
  assert.equal(readParses(fixture).filter(row => row.file.endsWith("common.d.ts")).length, 2)
  assert.equal(new Set(readRows(jobsFile).map(row => row.threadId)).size, 2)
  const metrics = readRows(metricsFile)
  assert.ok(metrics.some(row => row.referenceSdkCacheWorkerCount === 0))
  assert.ok(metrics.every(row => row.referenceSdkCacheWorkerCount >= 0 && row.referenceSdkCacheWorkerCount <= 1),
    "replacement waits for physical termination before spawning another SDK verifier")
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  assert.equal(readRows(metricsFile).at(-1).referenceSdkCacheWorkerCount, 0,
    "normal public shutdown observes cached Worker exit before stopping its owner")
})

function readRows(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : []
}
async function waitUntil(predicate) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail("SDK job did not start")
}


test("a second public reference query waits for the same serial SDK Worker", { timeout: 60_000 }, async t => {
  const target = "export class Thing {}\n"
  const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
  const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": target, "Use.ets": use, "Other.ets": use },
    target: { kind: "references", file: "Use.ets", symbol: "Thing", includeDeclaration: false,
      position: positionAt(use, use.lastIndexOf("Thing")) }, oracle: { schemaVersion: 1, locations: [] } })
  const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
  const logFile = path.join(fixture.directory, "logs", "server.log")
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    rootUri: pathToFileURL(fixture.suite.workspace).href,
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
      ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_REFERENCES_ANCHOR_REUSE: "0",
      ARKTS_REFERENCES_LOCAL_EXPORT_ANCHOR: "0", ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "1000",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/sdk-parse-observer.cjs"))}` } })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
  session.openDocument({ uri: uri("Use.ets"), version: 1, text: use })
  session.openDocument({ uri: uri("Other.ets"), version: 1, text: use })
  const params = (includeDeclaration, file = "Use.ets") => ({ textDocument: { uri: uri(file) },
    position: positionAt(use, use.lastIndexOf("Thing")), context: { includeDeclaration } })
  const first = session.request("textDocument/references", params(false), { timeoutMs: 20_000 })
  await waitUntil(() => readRows(logFile).some(row => row.event === "references.batch.start"))
  const second = session.request("textDocument/references", params(true, "Other.ets"), { timeoutMs: 20_000 })
  const [withoutDeclaration, withDeclaration] = await Promise.all([first, second])
  assert.equal(withoutDeclaration.error, undefined, JSON.stringify(withoutDeclaration))
  assert.equal(withDeclaration.error, undefined, JSON.stringify(withDeclaration))
  const expected = ["Use.ets", "Other.ets"].flatMap(file => [use.indexOf("Thing"), use.lastIndexOf("Thing")]
    .map(start => location(uri(file), use, start)))
  assert.deepEqual(sorted(withoutDeclaration.result), sorted(expected))
  assert.deepEqual(sorted(withDeclaration.result), sorted([...expected, location(uri("Target.ets"), target, target.indexOf("Thing"))]))
  assert.equal(readParses(fixture).filter(row => row.file.endsWith("common.d.ts")).length, 1)
  assert.equal(new Set(readRows(path.join(fixture.directory, "cache-jobs.jsonl")).map(row => row.threadId)).size, 1)
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

test("two workspace roots share one serial SDK verifier without losing either reference result", { timeout: 60_000 }, async t => {
  const target = "export class Thing {}\n"
  const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
  const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": target, "Use.ets": use },
    target: { kind: "references", file: "Use.ets", symbol: "Thing", includeDeclaration: false,
      position: positionAt(use, use.lastIndexOf("Thing")) }, oracle: { schemaVersion: 1, locations: [] } })
  const other = path.join(fixture.directory, "other-workspace")
  fs.mkdirSync(other)
  fs.writeFileSync(path.join(other, "Target.ets"), target)
  fs.writeFileSync(path.join(other, "Use.ets"), use)
  const roots = [fixture.suite.workspace, other]
  const metricsFile = path.join(fixture.directory, "metrics.jsonl")
  const logFile = path.join(fixture.directory, "logs", "server.log")
  const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
    env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
      ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
      ARKTS_MEMORY_METRICS_FILE: metricsFile, ARKTS_REFERENCES_STRATEGY: "batched",
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_REFERENCES_BATCH_ROOTS: "1",
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "1000",
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/sdk-parse-observer.cjs"))}` } })
  t.after(() => session.close().catch(() => {}))
  const id = session.nextRequestId++
  session.transport.send({ jsonrpc: "2.0", id, method: "initialize", params: {
    processId: process.pid, rootUri: null, capabilities: {}, initializationOptions: { sdk: { path: fixture.suite.sdk } },
    workspaceFolders: roots.map((root, index) => ({ name: `root-${index}`, uri: pathToFileURL(root).href })),
  } })
  const initialized = await session.transport.response(id, 10_000)
  assert.equal(initialized.error, undefined, JSON.stringify(initialized))
  session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  session.initialized = true
  const uris = roots.map(root => pathToFileURL(path.join(root, "Use.ets")).href)
  for (const uri of uris) session.openDocument({ uri, version: 1, text: use })
  const ask = (uri, includeDeclaration = false) => session.request("textDocument/references", { textDocument: { uri },
    position: positionAt(use, includeDeclaration ? use.indexOf("Thing") : use.lastIndexOf("Thing")),
    context: { includeDeclaration } }, { timeoutMs: 20_000 })
  const first = ask(uris[0])
  await waitUntil(() => readRows(logFile).some(row => row.event === "references.batch.start"))
  const second = ask(uris[1])
  for (const [index, result] of (await Promise.all([first, second])).entries()) {
    assert.equal(result.error, undefined, JSON.stringify(result))
    assert.deepEqual(sorted(result.result), sorted([use.indexOf("Thing"), use.lastIndexOf("Thing")]
      .map(start => location(uris[index], use, start))))
  }
  const completions = path.join(fixture.directory, "cache-completions.jsonl")
  const completedBefore = readRows(completions).length
  const batchesBefore = readRows(logFile).filter(row => row.event === "references.batch.start").length
  const uninterrupted = ask(uris[0], true)
  await waitUntil(() => readRows(logFile).filter(row => row.event === "references.batch.start").length > batchesBefore)
  const cancelId = session.nextRequestId++
  session.transport.send({ jsonrpc: "2.0", id: cancelId, method: "textDocument/references", params: {
    textDocument: { uri: uris[1] }, position: positionAt(use, use.indexOf("Thing")), context: { includeDeclaration: true },
  } })
  const pending = session.transport.response(cancelId, 20_000)
  await waitUntil(() => readRows(logFile).filter(row => row.event === "references.batch.start").length > batchesBefore + 1)
  session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: cancelId } })
  const cancelled = await pending
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
  assert.equal(cancelled.result, undefined)
  assert.equal(readRows(completions).length, completedBefore, "queued cancellation replies before the other root's held batch completes")
  const finished = await uninterrupted
  assert.equal(finished.error, undefined, JSON.stringify(finished))
  assert.deepEqual(sorted(finished.result), sorted([
    ...[use.indexOf("Thing"), use.lastIndexOf("Thing")].map(start => location(uris[0], use, start)),
    location(pathToFileURL(path.join(roots[0], "Target.ets")).href, target, target.indexOf("Thing")),
  ]))
  const recovered = await ask(uris[1], true)
  assert.equal(recovered.error, undefined, JSON.stringify(recovered))
  assert.deepEqual(sorted(recovered.result), sorted([
    ...[use.indexOf("Thing"), use.lastIndexOf("Thing")].map(start => location(uris[1], use, start)),
    location(pathToFileURL(path.join(roots[1], "Target.ets")).href, target, target.indexOf("Thing")),
  ]))
  assert.ok(readRows(metricsFile).every(row => row.referenceSdkCacheWorkerCount >= 0 && row.referenceSdkCacheWorkerCount <= 1))
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})
