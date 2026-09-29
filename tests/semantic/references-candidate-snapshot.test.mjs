import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("a candidate-stage edit cannot roll back another query's authoritative buffer", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-candidate-snapshot-"))
  const workspace = path.join(root, "workspace")
  const auditPath = path.join(root, "index.ndjson")
  const releasePath = path.join(root, "release")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const target = "export type Thing = string\nexport type Other = number\n"
  const query = 'import { Thing } from "./Target"\nexport let query: Thing\n'
  const changed = 'import { Other } from "./Target"\nexport let query: Other\n'
  const use = 'import { Thing } from "./Target"\nexport let use: Thing\n'
  for (const [name, text] of [["Target.ets", target], ["Query.ets", query], ["Use.ets", use]]) {
    fs.writeFileSync(path.join(workspace, name), text)
  }
  const uri = name => pathToFileURL(path.join(workspace, name)).href
  const session = new LspSession({ command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"], cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: { ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests/fixtures/index/references-held-status.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath, ARKTS_INDEX_TEST_RELEASE: releasePath,
      ARKTS_LSP_LOG_DIR: logDirectory, ARKTS_REFERENCES_TRACE: "1",
      ARKTS_REFERENCES_STRATEGY: "indexed-batched" },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(async () => {
    fs.writeFileSync(releasePath, "release")
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: target })
  session.openDocument({ uri: uri("Query.ets"), version: 1, text: query })

  const references = (file, position) => session.request("textDocument/references", {
    textDocument: { uri: uri(file) }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  const old = references("Query.ets", { line: 1, character: 18 })
  await waitUntil(() => readEvents(auditPath).some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: readEvents(auditPath),
      logs: readEvents(path.join(logDirectory, "server.log")), stderr: session.transport.stderr }))
  session.changeDocument({ uri: uri("Query.ets"), version: 2, text: changed })
  const hover = await session.request("textDocument/hover", {
    textDocument: { uri: uri("Query.ets") }, position: { line: 1, character: 18 },
  }, { timeoutMs: 10_000 })
  assert.equal(hover.error, undefined, JSON.stringify(hover.error))
  fs.writeFileSync(releasePath, "release")
  assert.equal((await old).error?.code, -32801)

  // Do not resync Query through another request: that would conceal old-text rollback.
  const current = await references("Target.ets", { line: 0, character: 13 })
  assert.equal(current.error, undefined, JSON.stringify(current.error))
  assert.deepEqual(normalize(current.result), normalize([
    location(uri("Target.ets"), 0, 12, 17), location(uri("Use.ets"), 0, 9, 14),
    location(uri("Use.ets"), 1, 16, 21),
  ]))
  const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri("Query.ets") && message.params.version === 2, 10_000)
  assert.equal(diagnostics.params.version, 2, "normal current-version diagnostics remain enabled")
  await session.close({ timeoutMs: 5_000 })
  assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
})

test("a nested-workspace candidate-stage edit makes the parent references snapshot stale", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-nested-candidate-snapshot-"))
  const workspace = path.join(root, "workspace")
  const nested = path.join(workspace, "nested")
  const auditPath = path.join(root, "index.ndjson")
  const releasePath = path.join(root, "release")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(nested, { recursive: true })
  const target = "export type Thing = string\nexport type Other = number\n"
  const query = 'import { Thing } from "./Target"\nexport let query: Thing\n'
  const use = 'import { Thing } from "../Target"\nexport let use: Thing\n'
  const changed = 'import { Other } from "../Target"\nexport let use: Other\n'
  for (const [name, text] of [["Target.ets", target], ["Query.ets", query], ["nested/Use.ets", use]]) {
    fs.writeFileSync(path.join(workspace, name), text)
  }
  const uri = name => pathToFileURL(path.join(workspace, name)).href
  const workspaceUri = pathToFileURL(workspace).href
  const nestedUri = pathToFileURL(nested).href
  const session = new LspSession({ command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"], cwd: projectRoot,
    rootUri: workspaceUri,
    env: { ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests/fixtures/index/references-held-status.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath, ARKTS_INDEX_TEST_RELEASE: releasePath,
      ARKTS_INDEX_TEST_USE_PATH: "nested/Use.ets",
      ARKTS_LSP_LOG_DIR: logDirectory, ARKTS_REFERENCES_TRACE: "1",
      ARKTS_REFERENCES_STRATEGY: "indexed-batched" },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(async () => {
    fs.writeFileSync(releasePath, "release")
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  const initializeId = session.nextRequestId++
  session.transport.send({ jsonrpc: "2.0", id: initializeId, method: "initialize", params: {
    processId: process.pid, rootUri: workspaceUri, capabilities: session.capabilities,
    workspaceFolders: [{ name: "parent", uri: workspaceUri }, { name: "nested", uri: nestedUri }],
  } })
  const initialized = await session.transport.response(initializeId, 10_000)
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
  session.initialized = true
  session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: uri("Target.ets"), version: 1, text: target })
  session.openDocument({ uri: uri("Query.ets"), version: 1, text: query })
  session.openDocument({ uri: uri("nested/Use.ets"), version: 1, text: use })

  const references = (file, position) => session.request("textDocument/references", {
    textDocument: { uri: uri(file) }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  const old = references("Query.ets", { line: 1, character: 18 })
  await waitUntil(() => readEvents(auditPath).some(event => event.event === "status.held"),
    () => JSON.stringify({ audit: readEvents(auditPath),
      logs: readEvents(path.join(logDirectory, "server.log")), stderr: session.transport.stderr }))
  session.changeDocument({ uri: uri("nested/Use.ets"), version: 2, text: changed })
  const hover = await session.request("textDocument/hover", {
    textDocument: { uri: uri("nested/Use.ets") }, position: { line: 1, character: 16 },
  }, { timeoutMs: 10_000 })
  assert.equal(hover.error, undefined, JSON.stringify(hover.error))
  assert.ok(hover.result, "the nested hover observes the changed authoritative buffer")
  fs.writeFileSync(releasePath, "release")
  const stale = await old
  assert.equal(stale.error?.code, -32801, JSON.stringify(stale.error))
  assert.equal(stale.result, undefined, "the changed nested snapshot must not publish parent Locations")

  const current = await references("Target.ets", { line: 0, character: 13 })
  assert.equal(current.error, undefined, JSON.stringify(current.error))
  assert.deepEqual(normalize(current.result), normalize([
    location(uri("Target.ets"), 0, 12, 17), location(uri("Query.ets"), 0, 9, 14),
    location(uri("Query.ets"), 1, 18, 23),
  ]))
  const diagnostics = await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri("nested/Use.ets") && message.params.version === 2, 10_000)
  assert.equal(diagnostics.params.version, 2, "normal nested current-version diagnostics remain enabled")
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.equal(closed.shutdown.error, undefined)
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
})

function location(uri, line, start, end) {
  return { uri, range: { start: { line, character: start }, end: { line, character: end } } }
}
function normalize(locations) {
  return locations.map(({ uri, range }) => JSON.stringify([uri, range.start.line,
    range.start.character, range.end.line, range.end.character])).sort()
}
function readEvents(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []
}
async function waitUntil(predicate, diagnostic = () => "") {
  const deadline = performance.now() + 10_000
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for held index status: ${diagnostic()}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
