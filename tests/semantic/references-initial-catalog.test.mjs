import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("first references waits for the initial catalog, then returns exact compiler locations", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-initial-catalog-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const sources = new Map([
    ["Target.ets", "export class Thing {}\n"],
    ["Query.ets", 'import { Thing } from "./Target"\nexport const query = new Thing()\n'],
    ["Use.ets", 'import { Thing } from "./Target"\nexport const use = new Thing()\n'],
  ])
  for (const [name, source] of sources) fs.writeFileSync(path.join(workspace, name), source)
  const uri = name => pathToFileURL(path.join(workspace, name)).href
  const queryUri = uri("Query.ets")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests", "fixtures", "index",
        "references-initial-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS: "30000",
    },
    capabilities: {
      window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } },
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await waitUntil(() => readAudit(auditPath).some(entry => entry.method === "catalog/start"))
  session.openDocument({ uri: queryUri, version: 1, text: sources.get("Query.ets") })
  const diagnostics = session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === queryUri && message.params.version === 1, 20_000)
  const response = await session.request("textDocument/references", {
    textDocument: { uri: queryUri },
    position: { line: 1, character: 26 },
    context: { includeDeclaration: true },
  }, { timeoutMs: 30_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(normalized(response.result, workspace), [
    "Query.ets:0:9:0:14",
    "Query.ets:1:25:1:30",
    "Target.ets:0:13:0:18",
    "Use.ets:0:9:0:14",
    "Use.ets:1:23:1:28",
  ])
  const published = await diagnostics
  assert.equal(published.params.version, 1)
  assert.ok(Array.isArray(published.params.diagnostics))
  await session.close({ timeoutMs: 5_000 })

  const audit = readAudit(auditPath)
  const warmingStatus = audit.findIndex(entry => entry.event === "status-served"
    && entry.status.state === "warming" && entry.status.committedGeneration === 0)
  const ready = audit.findIndex(entry => entry.event === "catalog-ready")
  const indexedQuery = audit.findIndex((entry, index) => index > ready
    && entry.method === "references/candidates")
  assert.ok(warmingStatus >= 0 && warmingStatus < ready,
    "the first references request must observe initial generation-zero warming")
  assert.ok(indexedQuery > ready,
    "the request must fetch index candidates after the first catalog commits")
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.ok(events.some(entry => entry.event === "references.index.accepted"),
    "the ready candidate set must be accepted for bounded verification")
})

test("cancelling references during initial catalog wait returns no partial result", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-initial-cancel-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const query = 'import { Thing } from "./Target"\nexport const query = new Thing()\n'
  fs.writeFileSync(path.join(workspace, "Target.ets"), "export class Thing {}\n")
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests", "fixtures", "index",
        "references-initial-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "stalled-catalog",
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS: "30000",
    },
    capabilities: {
      window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } },
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await waitUntil(() => readAudit(auditPath).some(entry => entry.method === "catalog/start"))
  session.openDocument({ uri: queryUri, version: 1, text: query })
  const diagnostics = session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === queryUri && message.params.version === 1, 20_000)
  const requestId = 100
  session.transport.send({
    jsonrpc: "2.0", id: requestId, method: "textDocument/references",
    params: {
      textDocument: { uri: queryUri },
      position: { line: 1, character: 26 },
      context: { includeDeclaration: true },
    },
  })
  await waitUntil(() => readAudit(auditPath).some(entry => entry.event === "status-served"
    && entry.status.state === "warming" && entry.status.committedGeneration === 0), 10_000)
  assert.equal(readAudit(auditPath).filter(entry => entry.method === "references/candidates").length,
    0, "the cancelled request must still be waiting for the first catalog")
  const cancelledAt = performance.now()
  session.transport.send({
    jsonrpc: "2.0", method: "$/cancelRequest", params: { id: requestId },
  })
  const cancelled = await session.transport.response(requestId, 3_000)
  assert.equal(cancelled.error?.code, -32800)
  assert.equal(cancelled.result, undefined)
  assert.ok(performance.now() - cancelledAt < 3_000)
  const published = await diagnostics
  assert.equal(published.params.version, 1)
  assert.ok(Array.isArray(published.params.diagnostics))
  session.changeDocument({ uri: queryUri, version: 2, text: `${query}// unsaved comment\n` })
  const afterCancel = await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === queryUri && message.params.version === 2, 20_000)
  assert.ok(Array.isArray(afterCancel.params.diagnostics),
    "automatic diagnostics must continue after the cancelled global request")
  await session.close({ timeoutMs: 5_000 })
  assert.equal(readAudit(auditPath).some(entry => entry.event === "catalog-ready"), false)
})

test("initial catalog wait expiry falls back to complete compiler references", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-initial-timeout-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const sources = new Map([
    ["Target.ets", "export class Thing {}\n"],
    ["Query.ets", 'import { Thing } from "./Target"\nexport const query = new Thing()\n'],
    ["Use.ets", 'import { Thing } from "./Target"\nexport const use = new Thing()\n'],
  ])
  for (const [name, source] of sources) fs.writeFileSync(path.join(workspace, name), source)
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests", "fixtures", "index",
        "references-initial-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "stalled-catalog",
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS: "250",
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await waitUntil(() => readAudit(auditPath).some(entry => entry.method === "catalog/start"))
  session.openDocument({ uri: queryUri, version: 1, text: sources.get("Query.ets") })
  const response = await session.request("textDocument/references", {
    textDocument: { uri: queryUri },
    position: { line: 1, character: 26 },
    context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(normalized(response.result, workspace), [
    "Query.ets:0:9:0:14",
    "Query.ets:1:25:1:30",
    "Target.ets:0:13:0:18",
    "Use.ets:0:9:0:14",
    "Use.ets:1:23:1:28",
  ])
  await session.close({ timeoutMs: 5_000 })
  const audit = readAudit(auditPath)
  assert.ok(audit.some(entry => entry.event === "status-served"
    && entry.status.state === "warming" && entry.status.committedGeneration === 0))
  assert.equal(audit.some(entry => entry.event === "catalog-ready"), false)
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(events.filter(entry => entry.event === "references.index.accepted").length, 0,
    "an uncommitted index must never narrow the final Location set")
})

test("first references waits when the workspace index has not opened yet", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-index-opening-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const sources = new Map([
    ["Target.ets", "export class Thing {}\n"],
    ["Query.ets", 'import { Thing } from "./Target"\nexport const query = new Thing()\n'],
    ["Use.ets", 'import { Thing } from "./Target"\nexport const use = new Thing()\n'],
  ])
  for (const [name, source] of sources) fs.writeFileSync(path.join(workspace, name), source)
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests", "fixtures", "index",
        "references-initial-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "delayed-open",
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS: "30000",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: queryUri, version: 1, text: sources.get("Query.ets") })
  assert.equal(readAudit(auditPath).some(entry => entry.event === "open-complete"), false,
    "the references request must start before the sidecar opens")
  const response = await session.request("textDocument/references", {
    textDocument: { uri: queryUri },
    position: { line: 1, character: 26 },
    context: { includeDeclaration: true },
  }, { timeoutMs: 30_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(normalized(response.result, workspace), [
    "Query.ets:0:9:0:14",
    "Query.ets:1:25:1:30",
    "Target.ets:0:13:0:18",
    "Use.ets:0:9:0:14",
    "Use.ets:1:23:1:28",
  ])
  await waitUntil(() => readAudit(auditPath).some(entry => entry.event === "catalog-ready"),
    10_000)
  await session.close({ timeoutMs: 5_000 })
  const audit = readAudit(auditPath)
  const ready = audit.findIndex(entry => entry.event === "catalog-ready")
  assert.ok(audit.findIndex((entry, index) => index > ready
    && entry.method === "references/candidates") > ready,
  "the same request must fetch the first committed candidate generation")
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.ok(events.some(entry => entry.event === "references.index.accepted"))
})

test("cancelling references while the first index status is held returns promptly", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-held-status-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const query = 'import { Thing } from "./Target"\nexport const query = new Thing()\n'
  fs.writeFileSync(path.join(workspace, "Target.ets"), "export class Thing {}\n")
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests", "fixtures", "index",
        "references-initial-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "held-status",
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS: "30000",
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await waitUntil(() => readAudit(auditPath).some(entry => entry.method === "catalog/start"))
  assert.equal(readAudit(auditPath).some(entry => entry.event === "status-held"), false)
  session.openDocument({ uri: queryUri, version: 1, text: query })
  const requestId = 100
  session.transport.send({
    jsonrpc: "2.0", id: requestId, method: "textDocument/references",
    params: {
      textDocument: { uri: queryUri },
      position: { line: 1, character: 26 },
      context: { includeDeclaration: true },
    },
  })
  await waitUntil(() => readAudit(auditPath).some(entry => entry.event === "status-held"), 10_000)
  const cancelledAt = performance.now()
  session.transport.send({
    jsonrpc: "2.0", method: "$/cancelRequest", params: { id: requestId },
  })
  const cancelled = await session.transport.response(requestId, 2_000)
  assert.equal(cancelled.error?.code, -32800)
  assert.equal(cancelled.result, undefined)
  assert.ok(performance.now() - cancelledAt < 2_000)
  assert.equal(readAudit(auditPath).some(entry => entry.method === "references/candidates"), false)
  await session.close({ timeoutMs: 5_000 })
})

test("initial catalog wait budget bounds a held status request", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-held-status-budget-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const sources = new Map([
    ["Target.ets", "export class Thing {}\n"],
    ["Query.ets", 'import { Thing } from "./Target"\nexport const query = new Thing()\n'],
    ["Use.ets", 'import { Thing } from "./Target"\nexport const use = new Thing()\n'],
  ])
  for (const [name, source] of sources) fs.writeFileSync(path.join(workspace, name), source)
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests", "fixtures", "index",
        "references-initial-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "held-status",
      ARKTS_INDEX_TEST_STATUS_HOLD_MS: "3000",
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_INITIAL_CATALOG_WAIT_MS: "250",
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await waitUntil(() => readAudit(auditPath).some(entry => entry.method === "catalog/start"))
  session.openDocument({ uri: queryUri, version: 1, text: sources.get("Query.ets") })
  const started = performance.now()
  const response = await session.request("textDocument/references", {
    textDocument: { uri: queryUri },
    position: { line: 1, character: 26 },
    context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  const elapsedMs = performance.now() - started
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(normalized(response.result, workspace), [
    "Query.ets:0:9:0:14",
    "Query.ets:1:25:1:30",
    "Target.ets:0:13:0:18",
    "Use.ets:0:9:0:14",
    "Use.ets:1:23:1:28",
  ])
  assert.ok(elapsedMs < 2_500, `held status exceeded wait budget: ${elapsedMs.toFixed(1)} ms`)
  await session.close({ timeoutMs: 5_000 })
  assert.ok(readAudit(auditPath).some(entry => entry.event === "status-held"))
  const events = fs.readFileSync(path.join(logs, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(events.filter(entry => entry.event === "references.index.accepted").length, 0)
})

function readAudit(file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

async function waitUntil(predicate, timeoutMs = 5_000) {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("timed out waiting for catalog start")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

function normalized(locations, workspace) {
  return locations.map(location => {
    const filename = path.relative(workspace, fileURLToPath(location.uri))
    const { start, end } = location.range
    return `${filename}:${start.line}:${start.character}:${end.line}:${end.character}`
  }).sort()
}
