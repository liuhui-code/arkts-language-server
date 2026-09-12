import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

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
  const requestIds = new Set(batched.batchEvents.map((entry) => entry.referenceSession))
  assert.equal(requestIds.size, 2)
  for (const session of requestIds) {
    const events = batched.batchEvents.filter((entry) => entry.referenceSession === session)
    assert.ok(events.length > 1)
    assert.ok(events.every((entry) => entry.batchCount === events.length))
    assert.ok(events.every((entry) => entry.verifierIsolation === "transient-worker"))
    assert.ok(events.every((entry) => entry.batchRootFiles <= 4))
    assert.ok(events.every((entry) => entry.programProjectFiles < entry.membershipFiles))
  }
})

test("cancelling batched references stops the active verifier without poisoning recovery", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-batch-cancel-"))
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  await fs.promises.mkdir(workspace)
  const target = "export class CancelTarget {}\n"
  const query = [
    'import { CancelTarget } from "./Target"',
    "export const query = new CancelTarget()",
    "",
  ].join("\n")
  await fs.promises.writeFile(path.join(workspace, "Target.ets"), target, "utf8")
  await fs.promises.writeFile(path.join(workspace, "Query.ets"), query, "utf8")
  await Promise.all(Array.from({ length: 20 }, (_, index) => (
    fs.promises.writeFile(path.join(workspace, `Use${index}.ets`), [
      'import { CancelTarget } from "./Target"',
      `export const use${index} = new CancelTarget()`,
      "",
    ].join("\n"), "utf8")
  )))

  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = positionAt(query, query.lastIndexOf("CancelTarget") + 1)
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
      ARKTS_REFERENCES_STRATEGY: "batched",
      ARKTS_REFERENCES_BATCH_ROOTS: "1",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: queryUri, version: 1, text: query })

  const requestId = 100
  session.transport.send({
    jsonrpc: "2.0",
    id: requestId,
    method: "textDocument/references",
    params: {
      textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
    },
  })
  const firstBatch = await waitForBatchEvent(path.join(logDirectory, "server.log"), 10_000)
  session.transport.send({
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id: requestId },
  })
  const cancelled = await session.transport.response(requestId, 10_000)
  assert.deepEqual(cancelled.error, {
    code: -32800,
    message: "Request cancelled by client",
  })
  assert.equal(cancelled.result, undefined)

  const recovered = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 30_000 })
  assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
  assert.equal(recovered.result.length, 43)
  await session.close({ timeoutMs: 5_000 })

  const events = readBatchEvents(path.join(logDirectory, "server.log"))
  const cancelledEvents = events.filter((entry) => entry.referenceSession === firstBatch.referenceSession)
  assert.ok(cancelledEvents.length >= 1)
  assert.ok(cancelledEvents.length < firstBatch.batchCount, "cancellation must stop later batches")
  const recoveredEvents = events.filter((entry) => entry.referenceSession !== firstBatch.referenceSession)
  assert.equal(recoveredEvents.length, recoveredEvents[0].batchCount)
})

test("indexed batching narrows compiler batches but keeps the exact references result", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-indexed-"))
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  await fs.promises.mkdir(workspace)
  const queryText = [
    'import { PublicThing } from "./Barrel"',
    "export const query = new PublicThing()",
    "",
  ].join("\n")
  const sources = new Map([
    ["Target.ets", "export class Thing {}\n"],
    ["Barrel.ets", 'export { Thing as PublicThing } from "./Target"\n'],
    ["Query.ets", queryText],
    ["Use.ets", 'import { PublicThing as Alias } from "./Barrel"\nexport const use = new Alias()\n'],
    ["SameName.ets", "export class PublicThing {}\nexport const unrelated = new PublicThing()\n"],
    ["Overlay.ets", "export const beforeOverlay = 1\n"],
    ...Array.from({ length: 12 }, (_, index) => [
      `Unrelated${index}.ets`,
      `export class Other${index} {}\nexport const other${index} = new Other${index}()\n`,
    ]),
  ])
  await Promise.all([...sources].map(([name, source]) => (
    fs.promises.writeFile(path.join(workspace, name), source, "utf8")
  )))
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = positionAt(queryText, queryText.lastIndexOf("PublicThing") + 1)
  const overlayPath = path.join(workspace, "Overlay.ets")
  const overlayText = [
    'import { PublicThing } from "./Barrel"',
    "export const overlayOnly = new PublicThing()",
    "",
  ].join("\n")

  const conservative = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position, strategy: "batched",
    overlayPath, overlayText,
  })
  const indexed = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position, strategy: "indexed-batched",
    awaitIndexReady: true, overlayPath, overlayText,
  })

  assert.deepEqual(indexed.locations, conservative.locations)
  assert.ok(
    indexed.batchEvents.length < conservative.batchEvents.length,
    JSON.stringify({ indexed: indexed.batchEvents, indexEvents: indexed.indexEvents,
      conservative: conservative.batchEvents }),
  )
  assert.ok(indexed.batchEvents.every(event => event.candidateMode === "indexed"))
  assert.ok(indexed.batchEvents.every(event => event.candidateFiles === 5))
  const accepted = indexed.indexEvents.find(event => event.event === "references.index.accepted")
  assert.equal(accepted?.anchorMode, "compiler-definition-identity")
  assert.equal(accepted?.candidateFiles, 4)
  assert.equal(accepted?.conservativeCandidateFiles, 5)
  assert.ok(indexed.locations.some(location => (
    location.uri === pathToFileURL(overlayPath).href
    && location.range.start.line === 1
  )))
  const anchor = indexed.indexEvents.find(event => (
    event.event === "references.anchor.complete"
    && event.verifierIsolation === "transient-worker"
  ))
  assert.ok(anchor)
  assert.ok(anchor.preparedProgramSourceFiles > 0)
  assert.ok(anchor.preparedProjectTextCodeUnits > 0)
  assert.equal(typeof anchor.queryHeapUsedDelta, "number")
  assert.ok(indexed.batchEvents.every(event => event.preparedProgramSourceFiles > 0))
  assert.ok(indexed.batchEvents.every(event => (
    typeof event.preparedSdkTextCodeUnits === "number"
  )))
  assert.ok(indexed.batchEvents.every(event => typeof event.queryHeapUsedDelta === "number"))
})

test("indexed batching keeps declared project semantic units intact", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-units-"))
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const entryRoot = path.join(workspace, "entry")
  const sharedRoot = path.join(workspace, "shared")
  const unrelatedRoot = path.join(workspace, "unrelated")
  const entrySource = path.join(entryRoot, "src", "main", "ets")
  const sharedSource = path.join(sharedRoot, "src", "main", "ets")
  const unrelatedSource = path.join(unrelatedRoot, "src", "main", "ets")
  await Promise.all([entrySource, sharedSource, unrelatedSource].map(directory => (
    fs.promises.mkdir(directory, { recursive: true })
  )))
  await fs.promises.writeFile(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: [
      { name: "entry", srcPath: "./entry", targets: [{ name: "default", applyToProducts: ["default"] }] },
      { name: "shared", srcPath: "./shared", targets: [{ name: "default", applyToProducts: ["default"] }] },
      { name: "unrelated", srcPath: "./unrelated", targets: [{ name: "default", applyToProducts: ["default"] }] },
    ],
  }))
  await Promise.all([entryRoot, sharedRoot, unrelatedRoot].map(moduleRoot => (
    fs.promises.writeFile(path.join(moduleRoot, "build-profile.json5"),
      "{ targets: [{ name: 'default' }] }")
  )))
  await fs.promises.writeFile(path.join(entryRoot, "oh-package.json5"),
    "{ name: 'entry', dependencies: { shared: 'file:../shared' } }")
  await fs.promises.writeFile(path.join(sharedRoot, "oh-package.json5"),
    "{ name: 'shared', dependencies: {} }")
  await fs.promises.writeFile(path.join(unrelatedRoot, "oh-package.json5"),
    "{ name: 'unrelated', dependencies: {} }")
  const queryText = [
    'import { PublicThing } from "../../../../shared/src/main/ets/Barrel"',
    "export const query = new PublicThing()",
    "",
  ].join("\n")
  await Promise.all([
    fs.promises.writeFile(path.join(sharedSource, "Target.ets"), "export class Thing {}\n"),
    fs.promises.writeFile(path.join(sharedSource, "Barrel.ets"),
      'export { Thing as PublicThing } from "./Target"\n'),
    fs.promises.writeFile(path.join(entrySource, "Query.ets"), queryText),
    fs.promises.writeFile(path.join(entrySource, "Use.ets"), [
      'import { PublicThing } from "../../../../shared/src/main/ets/Barrel"',
      "export const use = new PublicThing()",
      "",
    ].join("\n")),
    ...Array.from({ length: 6 }, (_, index) => (
      fs.promises.writeFile(path.join(unrelatedSource, `Other${index}.ets`),
        `export class Other${index} {}\n`)
    )),
  ])
  const queryUri = pathToFileURL(path.join(entrySource, "Query.ets")).href
  const position = positionAt(queryText, queryText.lastIndexOf("PublicThing") + 1)
  const conservative = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position,
    strategy: "batched",
    batchRoots: "1",
  })
  const result = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position,
    strategy: "indexed-batched",
    awaitIndexReady: true,
    indexScenario: "semantic-units",
    batchRoots: "1",
  })

  assert.deepEqual(result.locations, conservative.locations)
  assert.equal(result.batchEvents.length, 2, JSON.stringify(result.batchEvents))
  assert.ok(result.batchEvents.every(event => event.semanticUnitMode === "project-graph"))
  assert.ok(result.batchEvents.every(event => event.semanticUnits === 3))
  assert.ok(result.batchEvents.every(event => event.admittedProjectFiles === 4))
  assert.ok(result.batchEvents.every(event => event.admittedProjectFiles < event.membershipFiles))
  assert.ok(result.batchEvents.some(event => event.batchCandidateRoots === 2),
    "Target and Barrel from the shared unit must stay in one batch")
  assert.deepEqual([...new Set(result.locations.map(location => (
    path.basename(new URL(location.uri).pathname)
  )))].sort(), [
    "Barrel.ets", "Query.ets", "Target.ets", "Use.ets",
  ])

  await fs.promises.writeFile(path.join(entryRoot, "oh-package.json5"),
    "{ name: 'entry', dependencies: {} }")
  const underdeclared = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position,
    strategy: "indexed-batched",
    awaitIndexReady: true,
    indexScenario: "semantic-units",
    batchRoots: "1",
    runId: "underdeclared",
  })
  assert.deepEqual(underdeclared.locations, conservative.locations)
  assert.ok(underdeclared.batchEvents.every(event => (
    event.semanticUnitMode === "conservative"
  )))
  assert.ok(underdeclared.referenceEvents.some(event => (
    event.event === "references.semantic-unit.fallback"
    && event.reason === "source-unavailable"
  )))
})

test("indexed batching proves a declared local package binding before narrowing", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-package-"))
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const entryRoot = path.join(workspace, "entry")
  const sharedRoot = path.join(workspace, "shared")
  const entrySource = path.join(entryRoot, "src", "main", "ets")
  const sharedSource = path.join(sharedRoot, "src", "main", "ets")
  await Promise.all([entrySource, sharedSource].map(directory => (
    fs.promises.mkdir(directory, { recursive: true })
  )))
  await fs.promises.writeFile(path.join(workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] },
    modules: [
      { name: "entry", srcPath: "./entry", targets: [{ name: "default", applyToProducts: ["default"] }] },
      { name: "shared", srcPath: "./shared", targets: [{ name: "default", applyToProducts: ["default"] }] },
    ],
  }))
  await Promise.all([entryRoot, sharedRoot].map(moduleRoot => (
    fs.promises.writeFile(path.join(moduleRoot, "build-profile.json5"),
      "{ targets: [{ name: 'default' }] }")
  )))
  await fs.promises.writeFile(path.join(entryRoot, "oh-package.json5"),
    "{ name: 'entry', dependencies: { shared: 'file:../shared' } }")
  await fs.promises.writeFile(path.join(sharedRoot, "oh-package.json5"),
    "{ name: 'shared', main: 'src/main/ets/Index.ets', dependencies: {} }")
  const queryText = [
    'import { PublicThing } from "./Barrel"',
    "export const query = new PublicThing()",
    "",
  ].join("\n")
  await Promise.all([
    fs.promises.writeFile(path.join(sharedSource, "Index.ets"), "export class Thing {}\n"),
    fs.promises.writeFile(path.join(entrySource, "Barrel.ets"),
      'export { Thing as PublicThing } from "shared"\n'),
    fs.promises.writeFile(path.join(entrySource, "Query.ets"), queryText),
    fs.promises.writeFile(path.join(entrySource, "Use.ets"), [
      'import { PublicThing } from "./Barrel"',
      "export const use = new PublicThing()",
      "",
    ].join("\n")),
    fs.promises.writeFile(path.join(entrySource, "SameName.ets"),
      "export class PublicThing {}\nexport const unrelated = new PublicThing()\n"),
  ])
  const queryUri = pathToFileURL(path.join(entrySource, "Query.ets")).href
  const position = positionAt(queryText, queryText.lastIndexOf("PublicThing") + 1)
  const conservative = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position, strategy: "batched", runId: "package-conservative",
  })
  const indexed = await runSingleReferenceRequest(t, {
    root, workspace, queryUri, queryText, position, strategy: "indexed-batched",
    awaitIndexReady: true, indexScenario: "reference-package-resolutions", runId: "package-indexed",
  })

  assert.deepEqual(indexed.locations, conservative.locations)
  const accepted = indexed.indexEvents.find(event => event.event === "references.index.accepted")
  assert.ok(accepted, JSON.stringify(indexed.referenceEvents))
  assert.equal(accepted?.anchorMode, "compiler-definition-identity")
  assert.equal(accepted?.candidateFiles, 4)
  assert.equal(accepted?.conservativeCandidateFiles, 5)
  assert.ok(indexed.referenceEvents.some(event => (
    event.event === "references.index.source-resolutions"
    && event.resolvedBindings === 1
  )))
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
      ARKTS_REFERENCES_STRATEGY: strategy,
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
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: false },
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
  }
}

async function runSingleReferenceRequest(t, {
  root,
  workspace,
  queryUri,
  queryText,
  position,
  strategy,
  awaitIndexReady = false,
  overlayPath,
  overlayText,
  indexScenario,
  batchRoots = "2",
  runId = strategy,
}) {
  const logDirectory = path.join(root, `logs-${runId}`)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      HOME: path.join(root, "missing-home"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, `cache-${runId}`),
      ...(awaitIndexReady ? {
        ARKTS_INDEX_SIDECAR_PATH: path.join(
          projectRoot,
          "tests",
          "fixtures",
          "index",
          "scripted-catalog-sidecar.mjs",
        ),
        ...(indexScenario ? { ARKTS_INDEX_TEST_SCENARIO: indexScenario } : {}),
      } : {}),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: strategy,
      ARKTS_REFERENCES_BATCH_ROOTS: batchRoots,
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: awaitIndexReady ? { window: { workDoneProgress: true } } : {},
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  if (awaitIndexReady) {
    const create = await session.transport.serverRequest(
      "window/workDoneProgress/create",
      () => true,
      10_000,
    )
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    await session.transport.progress(
      create.params.token,
      message => message.params.value.kind === "end",
      10_000,
    )
  }
  if (overlayPath && overlayText) {
    session.openDocument({ uri: pathToFileURL(overlayPath).href, version: 1, text: overlayText })
  }
  session.openDocument({ uri: queryUri, version: 1, text: queryText })
  const response = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 30_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  await session.close({ timeoutMs: 5_000 })
  const logs = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse)
  return {
    locations: sortedLocations(response.result),
    batchEvents: logs.filter(entry => entry.event === "references.batch.complete"),
    referenceEvents: logs.filter(entry => entry.event.startsWith("references.")),
    indexEvents: logs.filter(entry => (
      entry.event.startsWith("references.index.")
      || entry.event === "references.anchor.complete"
    )),
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

async function waitForBatchEvent(logPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const events = readBatchEvents(logPath)
    if (events.length > 0) return events[0]
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for a completed reference batch in ${logPath}`)
}

function readBatchEvents(logPath) {
  if (!fs.existsSync(logPath)) return []
  return fs.readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.event === "references.batch.complete")
}
