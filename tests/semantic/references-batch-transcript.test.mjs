import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"
import { completeLogEvents } from "../support/complete-log-events.mjs"

test("transient reference batches reuse request-local module resolution without losing proof or isolation",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const { fixture, target, use } = await moduleFixture(t)
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const logs = path.join(fixture.directory, "logs")
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_LSP_LOG_DIR: logs, ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
          ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_BATCH_ROOTS: "1",
          ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_QUERY_MODULE_RESOLUTION_REUSE: reuse,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/module-resolution-io.cjs"))}` },
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
          position: positionAt(use, use.lastIndexOf("Thing") + Number(includeDeclaration)),
          context: { includeDeclaration } }, { timeoutMs: 20_000 })
        assert.equal(response.error, undefined, JSON.stringify(response.error))
        const expected = [use.indexOf("Thing"), use.lastIndexOf("Thing")].map(start => ({ uri: uri("Use.ets"),
          range: { start: positionAt(use, start), end: positionAt(use, start + 5) } }))
        if (includeDeclaration) expected.unshift({ uri: uri("Target.ets"), range: {
          start: positionAt(target, target.indexOf("Thing")), end: positionAt(target, target.indexOf("Thing") + 5),
        } })
        assert.deepEqual(sortedLocations(response.result), sortedLocations(expected))
      }
      const rows = fs.readFileSync(path.join(fixture.directory, "module-resolution-io.jsonl"), "utf8")
        .trim().split("\n").map(JSON.parse)
      assert.ok(rows.every(row => row.pid === session.transport.child.pid && row.threadId > 0))
      assert.ok(rows.every(row => typeof row.entryFile === "string"), "distinguish actual owner and verifier entrypoints")
      const counts = new Map()
      for (const row of rows.filter(row => row.entryFile === "reference-verifier-worker.cjs")) {
        const job = `${row.threadId}:${row.job}`
        counts.set(job, (counts.get(job) ?? 0) + 1)
      }
      assert.ok(counts.size >= 4, "distinct cursors on the same symbol must retain separate project LS jobs")
      assert.equal(new Set(rows.filter(row => row.entryFile === "reference-verifier-worker.cjs").map(row => row.threadId)).size, 1)
      t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", verifierCounts: [...counts] }))
      for (const count of counts.values()) {
        if (reuse === "0") assert.equal(count, 40)
        else assert.ok(count > 0 && count <= 2, "the real transient compiler must reuse witnessed presence inside its own query")
      }
      const events = completeLogEvents(path.join(logs, "server.log"))
      const batches = events.filter(event => event.event === "references.batch.complete")
      assert.equal(batches.length, 2, "one complete final batch per public query, plus its separate anchor")
      assert.equal(events.filter(event => event.event === "references.anchor.complete").length, 2)
      assert.ok(batches.every(event => event.verifierIsolation === "sdk-cache-worker"
        && event.sdkSourceFiles >= 21), "keep full SDK and normal batch ownership")
      assert.ok(!events.some(event => event.event === "references.resident.hit"))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

async function moduleFixture(t) {
  const target = "export class Thing {}\n"
  const use = 'import { Thing } from "./Target"\nexport const selected = new Thing()\n'
  const fixture = await makeQueryLayerFixture(t, { files: { "Target.ets": target, "Use.ets": use },
    target: { kind: "references", file: "Use.ets", symbol: "Thing",
      position: positionAt(use, use.lastIndexOf("Thing")), includeDeclaration: false },
    oracle: { schemaVersion: 1, locations: [{ file: "Use.ets", range: {
      start: positionAt(use, use.indexOf("Thing")), end: positionAt(use, use.indexOf("Thing") + 5),
    } }, { file: "Use.ets", range: { start: positionAt(use, use.lastIndexOf("Thing")),
      end: positionAt(use, use.lastIndexOf("Thing") + 5) } }] },
  })
  const api = path.join(fixture.suite.sdk, "ets", "api")
  fs.mkdirSync(api)
  const references = []
  for (let index = 0; index < 20; index++) {
    const name = `@ohos.op02repeat${index}.d.ts`
    fs.writeFileSync(path.join(api, name), 'export { MissingType } from "op02-repeated-missing"\n')
    references.push(`/// <reference path="../api/${name}" />`)
  }
  fs.writeFileSync(path.join(fixture.suite.sdk, "ets", "component", "common.d.ts"), references.join("\n") + "\n")
  return { fixture, target, use }
}

test("a transient true directory lookup cannot certify an absent SDK path and later references recover",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const { fixture, target, use } = await moduleFixture(t)
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const control = path.join(fixture.directory, "module-presence-window")
      fs.writeFileSync(control, "arm")
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
          ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_QUERY_MODULE_RESOLUTION_REUSE: reuse,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/module-resolution-io.cjs"))}` },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      for (const [file, text] of [["Target.ets", target], ["Use.ets", use]]) {
        session.openDocument({ uri: uri(file), version: 1, text })
        const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
        assert.deepEqual(diagnostic.params.diagnostics, [])
      }
      const ask = text => session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
        position: positionAt(text, text.lastIndexOf("Thing")), context: { includeDeclaration: false } }, { timeoutMs: 20_000 })
      const response = await ask(use)
      const marker = path.join(fixture.directory, "module-presence-mutated.json")
      assert.ok(fs.existsSync(marker), "the actual transient verifier must consume the real temporary directory")
      const observed = JSON.parse(fs.readFileSync(marker, "utf8"))
      assert.equal(observed.pid, session.transport.child.pid)
      assert.ok(observed.threadId > 0 && observed.wasDirectory === true)
      assert.equal(observed.operation, "references")
      assert.equal(fs.existsSync(path.join(fixture.suite.sdk, "ets", "api", "node_modules")), false)
      assert.equal(response.error?.code, -32803, JSON.stringify(response))
      assert.equal(response.result, undefined, "uncertain SDK load inputs cannot certify a successful complete result")
      fs.unlinkSync(control)
      const changed = `// recovered 👩‍💻\n${use}`
      session.changeDocument({ uri: uri("Use.ets"), version: 2, text: changed })
      const recovered = await ask(changed)
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      assert.deepEqual(recovered.result, [changed.indexOf("Thing"), changed.lastIndexOf("Thing")].map(start => ({
        uri: uri("Use.ets"), range: { start: positionAt(changed, start), end: positionAt(changed, start + 5) },
      })))
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
      assert.deepEqual(latest.params.diagnostics, [])
      t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", observed, rejected: response.error.code }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("new SDK facts between negative leaf loads cannot restamp the earlier directory proof",
  { timeout: 60_000 }, async t => {
    for (const reuse of [undefined, "0"]) {
      const { fixture, target, use } = await moduleFixture(t)
      const api = path.join(fixture.suite.sdk, "ets", "api")
      fs.mkdirSync(path.join(api, "Absent"))
      for (let index = 0; index < 20; index++) {
        fs.writeFileSync(path.join(api, `@ohos.op02repeat${index}.d.ts`),
          `export { MissingType } from "./Absent/Probe${index}"\n`)
      }
      const uri = file => pathToFileURL(path.join(fixture.suite.workspace, file)).href
      const control = path.join(fixture.directory, "module-negative-owner-window")
      fs.writeFileSync(control, "arm")
      const session = new LspSession({ command: process.execPath, args: [fixture.suite.server, "--stdio"],
        rootUri: pathToFileURL(fixture.suite.workspace).href,
        capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
        env: { ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
          ARKTS_LSP_LOG_DIR: path.join(fixture.directory, "logs"),
          ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
          // The first SDK lookup must belong to the search whose end fence is under test.
          ARKTS_REFERENCES_STRATEGY: "batched",
          ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_QUERY_MODULE_RESOLUTION_REUSE: reuse,
          NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/module-resolution-io.cjs"))}` },
      })
      t.after(() => session.close().catch(() => {}))
      await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: fixture.suite.sdk } } })
      for (const [file, text] of [["Target.ets", target], ["Use.ets", use]]) {
        session.openDocument({ uri: uri(file), version: 1, text })
        const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
          message => message.params.uri === uri(file) && message.params.version === 1, 10_000)
        assert.deepEqual(diagnostic.params.diagnostics, [])
      }
      const ask = text => session.request("textDocument/references", { textDocument: { uri: uri("Use.ets") },
        position: positionAt(text, text.lastIndexOf("Thing")), context: { includeDeclaration: false } }, { timeoutMs: 20_000 })
      const response = await ask(use)
      const marker = path.join(fixture.directory, "module-negative-owner-mutated.json")
      assert.ok(fs.existsSync(marker), "consume a real negative lookup before creating its previously absent SDK file")
      const observed = JSON.parse(fs.readFileSync(marker, "utf8"))
      assert.equal(observed.pid, session.transport.child.pid)
      assert.ok(observed.threadId > 0)
      assert.equal(observed.operation, "references")
      assert.equal(observed.entryFile, "reference-verifier-worker.cjs")
      assert.equal(observed.firstNativeError, "ENOENT")
      assert.equal(observed.createdFile, path.join(api, "Absent", "Probe0.ets"))
      assert.equal(fs.readFileSync(observed.createdFile, "utf8"), "export interface MissingType { value: string }\n")
      assert.equal(response.error?.code, -32803, JSON.stringify(response))
      assert.equal(response.result, undefined, "a later directory epoch must not certify earlier negative loads")
      fs.unlinkSync(control)
      const recoveredSdk = path.join(fixture.directory, "sdk-recovered")
      fs.cpSync(fixture.suite.sdk, recoveredSdk, { recursive: true })
      session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
        params: { settings: { arkts: { sdk: { path: recoveredSdk } } } } })
      const changed = `// recovered 👩‍💻\n${use}`
      session.changeDocument({ uri: uri("Use.ets"), version: 2, text: changed })
      const recovered = await ask(changed)
      assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
      assert.deepEqual(recovered.result, [changed.indexOf("Thing"), changed.lastIndexOf("Thing")].map(start => ({
        uri: uri("Use.ets"), range: { start: positionAt(changed, start), end: positionAt(changed, start + 5) },
      })))
      const latest = await session.transport.notification("textDocument/publishDiagnostics",
        message => message.params.uri === uri("Use.ets") && message.params.version === 2, 10_000)
      assert.deepEqual(latest.params.diagnostics, [])
      t.diagnostic(JSON.stringify({ reuse: reuse ?? "default", observed, rejected: response.error.code }))
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    }
  })

test("batched references preserve the legacy Location set while bounding compiler roots", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-batching-"))
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  await fs.promises.mkdir(workspace)

  const sources = new Map([
    ["Target.ets", "export class Thing {}\n"],
    ["Barrel.ets", 'export { Thing as PublicThing } from "./Target"\n'],
    ["Query.ets", [
      'import { PublicThing } from "./Barrel"',
      "export const query: PublicThing = new PublicThing()",
      "",
    ].join("\n")],
    ["SameName.ets", "export class PublicThing {}\nexport const unrelated = new PublicThing()\n"],
    ...Array.from({ length: 6 }, (_, index) => [
      `Use${index}.ets`,
      [
        'import { PublicThing } from "./Barrel"',
        `export const use${index}: PublicThing = new PublicThing()`,
        "",
      ].join("\n"),
    ]),
  ])
  await Promise.all([...sources].map(([name, source]) => (
    fs.promises.writeFile(path.join(workspace, name), source, "utf8")
  )))

  const queryPath = path.join(workspace, "Query.ets")
  const queryText = sources.get("Query.ets")
  const queryUri = pathToFileURL(queryPath).href
  const useFivePath = path.join(workspace, "Use5.ets")
  const useFiveDisk = sources.get("Use5.ets")
  const useFiveOverlay = useFiveDisk + "export const overlayOnly = new PublicThing()\n"
  const position = positionAt(queryText, queryText.lastIndexOf("PublicThing") + 1)

  const legacy = await runReferences(t, {
    root,
    workspace,
    queryUri,
    queryText,
    useFivePath,
    useFiveOverlay,
    position,
    strategy: "legacy",
  })
  const batched = await runReferences(t, {
    root,
    workspace,
    queryUri,
    queryText,
    useFivePath,
    useFiveOverlay,
    position,
    strategy: "batched",
  })

  assert.deepEqual(batched.withDeclaration, legacy.withDeclaration)
  assert.deepEqual(batched.withoutDeclaration, legacy.withoutDeclaration)
  assert.ok(
    batched.withDeclaration.some((location) => (
      location.uri === pathToFileURL(useFivePath).href
      && textInRange(useFiveOverlay, location.range) === "PublicThing"
      && location.range.start.line === 2
    )),
    "the batched result omitted the unsaved overlay-only reference",
  )
  assert.equal(
    batched.withDeclaration.some((location) => location.uri.endsWith("/SameName.ets")),
    false,
    "a same-named symbol leaked into the batched result",
  )

  assert.equal(legacy.batchEvents.length, 0)
  assert.ok(batched.batchEvents.length >= 8, "both requests must cross multiple batches")
  const queueEvents = batched.referenceEvents.filter(entry => entry.event === "references.queue.start")
  assert.ok(queueEvents.length >= 2 && queueEvents.length <= 4,
    "each public query has one fallback and at most one useful resident trial")
  assert.equal(new Set(queueEvents.map(entry => entry.requestId)).size, queueEvents.length)
  assert.ok(queueEvents.every(entry => Number.isFinite(entry.queueWaitMs)
    && entry.queueWaitMs >= 0))
  const traceIds = queueEvents.map(entry => entry.traceId)
  assert.ok(traceIds.every(id => typeof id === "string" && id.length > 0))
  assert.equal(new Set(traceIds).size, 2)
  for (const traceId of new Set(traceIds)) {
    const count = queueEvents.filter(entry => entry.traceId === traceId).length
    assert.ok(count >= 1 && count <= 2, "physical work stays bounded per logical request")
  }
  const requestIds = new Set(batched.batchEvents.map((entry) => entry.referenceSession))
  assert.equal(requestIds.size, 2)
  for (const session of requestIds) {
    const events = batched.batchEvents.filter((entry) => entry.referenceSession === session)
    assert.ok(events.length > 1)
    assert.ok(events.every((entry) => entry.batchCount === events.length))
    assert.ok(events.every((entry) => entry.verifierIsolation === "sdk-cache-worker"))
    assert.ok(events.every((entry) => entry.batchRootFiles <= 4))
    assert.ok(events.every((entry) => entry.programProjectFiles < entry.membershipFiles))
    assert.ok(events.every(entry => ["workerPrepareHostMs", "workerProgramReadyMs",
      "workerQueryMs"].every(field => Number.isFinite(entry[field]) && entry[field] >= 0)))
    assert.ok(events.every(entry => ["workerGetProgramMs", "workerGetTypeCheckerMs"]
      .every(field => Number.isFinite(entry[field]) && entry[field] >= 0)))
    assert.ok(events.every(entry => Number.isFinite(entry.workerCreateProgramMs)
      && entry.workerCreateProgramMs > 0))
    assert.ok(events.every(entry => entry.workerGetProgramMs + entry.workerGetTypeCheckerMs
      <= entry.workerProgramReadyMs))
    const timeline = batched.referenceEvents.filter(entry => entry.referenceSession === session
      && ["references.plan.complete", "references.batch.start", "references.batch.complete",
        "references.merge.complete"].includes(entry.event))
    assert.equal(timeline[0]?.event, "references.plan.complete")
    assert.equal(timeline.at(-1)?.event, "references.merge.complete")
    assert.ok(timeline.every(entry => traceIds.includes(entry.traceId)))
    assert.equal(new Set(timeline.map(entry => entry.traceId)).size, 1)
    assert.equal(timeline.filter(entry => entry.event === "references.batch.start").length,
      events.length)
    assert.ok(timeline.every((entry, index) => Number.isFinite(entry.elapsedMs)
      && (index === 0 || entry.elapsedMs >= timeline[index - 1].elapsedMs)))
  }
})

async function runReferences(t, {
  root,
  workspace,
  queryUri,
  queryText,
  useFivePath,
  useFiveOverlay,
  position,
  strategy,
}) {
  const logDirectory = path.join(root, `logs-${strategy}`)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      HOME: path.join(root, "missing-home"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ...(strategy ? { ARKTS_REFERENCES_STRATEGY: strategy } : {}),
      ARKTS_REFERENCES_BATCH_ROOTS: "2",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: pathToFileURL(useFivePath).href, version: 1, text: useFiveOverlay })
  session.openDocument({ uri: queryUri, version: 1, text: queryText })

  const withDeclaration = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  const withoutDeclaration = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position: { ...position, character: position.character + 1 },
    context: { includeDeclaration: false },
  }, { timeoutMs: 20_000 })
  assert.equal(withDeclaration.error, undefined, JSON.stringify(withDeclaration.error))
  assert.equal(withoutDeclaration.error, undefined, JSON.stringify(withoutDeclaration.error))
  await session.close({ timeoutMs: 5_000 })

  const logPath = path.join(logDirectory, "server.log")
  const logs = fs.readFileSync(logPath, "utf8").trim().split("\n").map(JSON.parse)
  return {
    withDeclaration: sortedLocations(withDeclaration.result),
    withoutDeclaration: sortedLocations(withoutDeclaration.result),
    batchEvents: logs.filter((entry) => entry.event === "references.batch.complete"),
    referenceEvents: logs.filter((entry) => entry.event.startsWith("references.")),
  }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
}

function textInRange(source, range) {
  const lines = source.split("\n")
  if (range.start.line !== range.end.line) return ""
  return lines[range.start.line].slice(range.start.character, range.end.character)
}

function sortedLocations(locations) {
  return [...locations].sort((left, right) => (
    left.uri.localeCompare(right.uri)
      || left.range.start.line - right.range.start.line
      || left.range.start.character - right.range.start.character
      || left.range.end.line - right.range.end.line
      || left.range.end.character - right.range.end.character
  ))
}
