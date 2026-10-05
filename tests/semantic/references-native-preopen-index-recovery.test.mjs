import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

const sidecarPath = path.join(projectRoot, "target", "release",
  process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
const serverPath = path.join(projectRoot, "dist/server.cjs")

test("native persisted pre-open catalog cannot omit a new reference and later recovers", async t => {
  assert.ok(fs.existsSync(sidecarPath), `build the native sidecar first: ${sidecarPath}`)
  assert.ok(fs.existsSync(serverPath), `build the server first: ${serverPath}`)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-native-preopen-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  fs.mkdirSync(workspace)
  const targetPath = path.join(workspace, "Target.ets")
  const queryPath = path.join(workspace, "Query.ets")
  const usePath = path.join(workspace, "Use.ets")
  const addedPath = path.join(workspace, "Added.ets")
  const target = "export class Thing {}\n"
  const query = 'import { Thing } from "./Target"\nexport const query = new Thing()\n'
  const use = 'import { Thing } from "./Target"\nexport const use = new Thing()\n'
  const updatedUse = `// watched before index open\n${use}`
  const added = 'import { Thing } from "./Target"\nexport const added = new Thing()\n'
  fs.writeFileSync(targetPath, target)
  fs.writeFileSync(queryPath, query)
  fs.writeFileSync(usePath, use)
  const queryUri = pathToFileURL(queryPath).href
  const position = positionAt(query, query.lastIndexOf("Thing") + 1)
  const expectedWithDeclaration = sortedLocations([
    ...locations(targetPath, target),
    ...locations(queryPath, query),
    ...locations(usePath, updatedUse),
    ...locations(addedPath, added),
  ])
  const expectedWithoutDeclaration = expectedWithDeclaration.filter(
    location => location.uri !== pathToFileURL(targetPath).href,
  )

  const firstLogs = path.join(root, "first-logs")
  const first = createSession(root, workspace, firstLogs)
  t.after(() => first.close().catch(() => {}))
  await first.initialize({ timeoutMs: 20_000 })
  const firstCreate = await first.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 20_000)
  first.transport.send({ jsonrpc: "2.0", id: firstCreate.id, result: null })
  await first.transport.progress(firstCreate.params.token,
    message => message.params.value.kind === "end", 20_000)
  await waitUntil(() => phaseEvents(firstLogs).some(event =>
    event.phase === "ready" && event.committedGeneration >= 1))
  const initialGeneration = phaseEvents(firstLogs)
    .findLast(event => event.phase === "ready").committedGeneration
  const indexed = await first.request("workspace/symbol", { query: "Thing" },
    { timeoutMs: 10_000 })
  assert.equal(indexed.error, undefined, JSON.stringify(indexed.error))
  assert.ok(indexed.result.some(symbol => symbol.name === "Thing"),
    "the first native catalog must contain the real declaration")
  await first.close({ timeoutMs: 10_000 })

  const secondLogs = path.join(root, "second-logs")
  const second = createSession(root, workspace, secondLogs)
  t.after(() => second.close().catch(() => {}))
  await second.initialize({ timeoutMs: 20_000 })
  const secondCreate = await second.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 20_000)
  const diagnostics = second.transport.notification("textDocument/publishDiagnostics",
    message => message.params?.uri === queryUri && message.params?.version === 1, 20_000)
  second.openDocument({ uri: queryUri, version: 1, text: query })
  assert.ok(Array.isArray((await diagnostics).params.diagnostics))
  assert.deepEqual(phaseEvents(secondLogs), [],
    "the second catalog must not start until its progress-create reply")

  fs.writeFileSync(usePath, updatedUse)
  fs.writeFileSync(addedPath, added)
  second.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [
      { uri: pathToFileURL(usePath).href, type: 2 },
      { uri: pathToFileURL(addedPath).href, type: 1 },
    ] } })
  const references = async includeDeclaration => {
    const response = await second.request("textDocument/references", {
      textDocument: { uri: queryUri }, position, context: { includeDeclaration },
    }, { timeoutMs: 30_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return sortedLocations(response.result)
  }
  assert.deepEqual(await references(false), expectedWithoutDeclaration,
    "old persisted candidates must not omit Added.ets")
  assert.deepEqual(await references(true), expectedWithDeclaration,
    "declaration policy must also remain complete before catalog open")
  assert.equal(referenceEvents(secondLogs).some(event =>
    event.event === "references.index.accepted"), false,
  "the old persisted generation must not be admitted for either query")
  assert.ok(referenceEvents(secondLogs).some(event =>
    event.event === "references.index.fallback" && event.reason === "workspace-changed"))

  second.transport.send({ jsonrpc: "2.0", id: secondCreate.id, result: null })
  await second.transport.progress(secondCreate.params.token,
    message => message.params.value.kind === "end", 30_000)
  await waitUntil(() => phaseEvents(secondLogs).some(event =>
    event.phase === "ready" && event.committedGeneration > initialGeneration))
  const readyGeneration = phaseEvents(secondLogs)
    .findLast(event => event.phase === "ready").committedGeneration
  assert.ok(phaseEvents(secondLogs).some(event => event.phase === "discovering"
    && event.committedGeneration === initialGeneration),
  "the second native process must reopen the prior committed generation")

  // Invalidate the exact-result cache without changing the indexed disk sources.
  second.changeDocument({ uri: queryUri, version: 2, text: `${query}// unsaved comment\n` })
  assert.deepEqual(await references(true), expectedWithDeclaration)
  second.changeDocument({ uri: queryUri, version: 3, text: `${query}// unsaved comment v2\n` })
  assert.deepEqual(await references(false), expectedWithoutDeclaration)
  const observed = referenceEvents(secondLogs)
  assert.ok(observed.some(event => event.event === "references.index.recovered"
    && event.committedGeneration === readyGeneration),
  "new committed generation must restore indexed planning")
  assert.equal(observed.filter(event => event.event === "references.index.accepted").length, 2,
    "both declaration policies must use the recovered index")
  await second.close({ timeoutMs: 10_000 })
})

function createSession(root, workspace, logs) {
  return new LspSession({
    command: process.execPath,
    args: [serverPath, "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: sidecarPath,
      ARKTS_INDEX_CATALOG_TRACE: "1",
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: { window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
  })
}

function phaseEvents(logs) {
  return readEvents(logs).filter(event => event.event === "index.catalog.phase")
}

function referenceEvents(logs) {
  return readEvents(logs).filter(event => event.event.startsWith("references.index."))
}

function readEvents(logs) {
  const file = path.join(logs, "server.log")
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

async function waitUntil(predicate, timeoutMs = 20_000) {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("timed out waiting for native catalog")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
}

function locations(filePath, source) {
  const found = []
  for (let offset = source.indexOf("Thing"); offset >= 0;
    offset = source.indexOf("Thing", offset + 5)) {
    const start = positionAt(source, offset)
    found.push({ uri: pathToFileURL(filePath).href,
      range: { start, end: { line: start.line, character: start.character + 5 } } })
  }
  return found
}

function sortedLocations(locations) {
  return [...locations].sort((left, right) => left.uri.localeCompare(right.uri)
    || left.range.start.line - right.range.start.line
    || left.range.start.character - right.range.start.character
    || left.range.end.line - right.range.end.line
    || left.range.end.character - right.range.end.character)
}
