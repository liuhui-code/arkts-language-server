import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("pre-open edits reject stale candidates and recover after their catalog commits", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-preopen-resync-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const targetPath = path.join(workspace, "Target.ets")
  const queryPath = path.join(workspace, "Query.ets")
  const usePath = path.join(workspace, "Use.ets")
  const addedPath = path.join(workspace, "Added.ets")
  const target = "export class Thing {}\n"
  const query = 'import { Thing } from "./Target"\nexport const query = new Thing()\n'
  const use = 'import { Thing } from "./Target"\nexport const use = new Thing()\n'
  const added = 'import { Thing } from "./Target"\nexport const added = new Thing()\n'
  const updatedUse = `// watched before index open\n${use}`
  fs.writeFileSync(targetPath, target)
  fs.writeFileSync(queryPath, query)
  fs.writeFileSync(usePath, use)

  const queryUri = pathToFileURL(queryPath).href
  const expected = sortedLocations([
    ...locations(targetPath, target),
    ...locations(queryPath, query),
    ...locations(usePath, updatedUse),
    ...locations(addedPath, added),
  ])
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(
        projectRoot, "tests", "fixtures", "index", "scripted-catalog-sidecar.mjs",
      ),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "reference-preopen-stale",
      ARKTS_INDEX_CATALOG_TRACE: "1",
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.openDocument({ uri: queryUri, version: 1, text: query })
  fs.writeFileSync(usePath, updatedUse)
  fs.writeFileSync(addedPath, added)
  session.transport.send({
    jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [
      { uri: pathToFileURL(usePath).href, type: 2 },
      { uri: pathToFileURL(addedPath).href, type: 1 },
    ] },
  })

  const references = (includeDeclaration) => session.request("textDocument/references", {
    textDocument: { uri: queryUri },
    position: positionAt(query, query.lastIndexOf("Thing") + 1),
    context: { includeDeclaration },
  }, { timeoutMs: 20_000 })
  const fallback = await references(false)
  assert.equal(fallback.error, undefined, JSON.stringify(fallback.error))
  assert.deepEqual(sortedLocations(fallback.result), expected.filter(location => (
    location.uri !== pathToFileURL(targetPath).href
  )))
  assert.equal(fs.existsSync(auditPath), false, "catalog must not start before progress reply")

  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await waitUntil(() => events(logDirectory).some(({ event, phase, committedGeneration }) => (
    event === "index.catalog.phase" && phase === "activating" && committedGeneration === 1
  )), () => ({ events: events(logDirectory), audit: audits(auditPath) }))
  const beforeStale = events(logDirectory).length
  const stale = await references(true)
  assert.equal(stale.error, undefined, JSON.stringify(stale.error))
  assert.deepEqual(sortedLocations(stale.result), expected)
  const staleEvents = events(logDirectory).slice(beforeStale)
  assert.ok(staleEvents.some(({ event, reason }) => (
    event === "references.index.fallback" && reason === "workspace-changed"
  )))
  assert.equal(staleEvents.some(({ event }) => event === "references.index.accepted"), false)
  assert.equal(audits(auditPath, "references/candidates").length, 0)

  fs.writeFileSync(`${auditPath}.release-2`, "ready\n")
  await session.transport.progress(
    create.params.token, message => message.params.value.kind === "end", 10_000,
  )
  session.changeDocument({ uri: queryUri, version: 2, text: `${query}// unsaved comment\n` })
  const recovered = await references(true)
  assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
  assert.deepEqual(sortedLocations(recovered.result), expected)
  session.changeDocument({ uri: queryUri, version: 3, text: `${query}// unsaved comment v2\n` })
  const recoveredWithoutDeclaration = await references(false)
  assert.equal(recoveredWithoutDeclaration.error, undefined,
    JSON.stringify(recoveredWithoutDeclaration.error))
  assert.deepEqual(sortedLocations(recoveredWithoutDeclaration.result),
    sortedLocations(fallback.result))
  await session.close({ timeoutMs: 5_000 })

  const observed = events(logDirectory)
  assert.ok(observed.some(({ event, reason }) => (
    event === "references.index.fallback" && reason === "workspace-changed"
  )))
  assert.ok(observed.some(({ event }) => event === "references.index.recovered"))
  assert.equal(observed.filter(({ event }) => event === "references.index.accepted").length, 2,
    JSON.stringify(observed.filter(({ event }) => event.startsWith("references.index."))))
  const audit = audits(auditPath)
  assert.equal(audit.filter(request => request.method === "catalog/start").length, 1)
  assert.equal(audit.filter(request => request.method === "references/candidates").length, 4)
})

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
}

function events(directory) {
  const file = path.join(directory, "server.log")
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

function audits(file, method) {
  if (!fs.existsSync(file)) return []
  const requests = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
  return method ? requests.filter(request => request.method === method) : requests
}

async function waitUntil(predicate, details) {
  const deadline = performance.now() + 10_000
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(
      `timed out waiting for catalog activation: ${JSON.stringify(details?.())}`,
    )
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function locations(filePath, source) {
  const found = []
  for (let offset = source.indexOf("Thing"); offset >= 0; offset = source.indexOf("Thing", offset + 5)) {
    const start = positionAt(source, offset)
    found.push({
      uri: pathToFileURL(filePath).href,
      range: { start, end: { line: start.line, character: start.character + 5 } },
    })
  }
  return found
}

function sortedLocations(locations) {
  return [...locations].sort((left, right) => (
    left.uri.localeCompare(right.uri)
      || left.range.start.line - right.range.start.line
      || left.range.start.character - right.range.start.character
  ))
}
