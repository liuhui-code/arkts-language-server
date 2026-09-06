import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const sidecarFixturePath = path.join(
  projectRoot,
  "tests",
  "fixtures",
  "index",
  "scripted-catalog-sidecar.mjs",
)
test("production composition exposes cached search and terminal catalog progress", async (t) => {
  const cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-production-index-"))
  const serverPath = path.join(cacheDirectory, "production-index-server.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
  })
  const sidecarPath = path.join(cacheDirectory, "scripted-catalog-sidecar.mjs")
  fs.copyFileSync(sidecarFixturePath, sidecarPath)
  fs.chmodSync(sidecarPath, 0o755)
  const auditPath = path.join(cacheDirectory, "sidecar-audit.ndjson")
  const logDirectory = path.join(cacheDirectory, "logs")
  const server = new LspProcess({
    serverPath,
    env: {
      ARKTS_INDEX_SIDECAR_PATH: sidecarPath,
      ARKTS_INDEX_CACHE_DIR: cacheDirectory,
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "slow-catalog",
      ARKTS_LSP_LOG_DIR: logDirectory,
    },
  })
  t.after(async () => {
    await server.close()
    fs.rmSync(cacheDirectory, { recursive: true, force: true })
  })
  const workspaceAPath = path.join(cacheDirectory, "workspace-a")
  const workspaceBPath = path.join(cacheDirectory, "workspace-b")
  fs.mkdirSync(workspaceAPath)
  fs.mkdirSync(workspaceBPath)
  const rootUri = pathToFileURL(workspaceAPath).href
  const secondRootUri = pathToFileURL(workspaceBPath).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      workspaceFolders: [
        { uri: rootUri, name: "workspace-a" },
        { uri: secondRootUri, name: "workspace-b" },
      ],
      capabilities: { window: { workDoneProgress: true } },
    },
  })
  const initialized = await server.response(1)
  assert.equal(initialized.result.capabilities.workspaceSymbolProvider, true)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  const create = await server.serverRequest("window/workDoneProgress/create")
  server.send({ jsonrpc: "2.0", id: create.id, result: null })
  const begin = await server.progress(
    create.params.token,
    (message) => message.params.value.kind === "begin",
  )
  assert.equal("percentage" in begin.params.value, false)
  await waitUntil(() => fs.existsSync(auditPath)
    && fs.readFileSync(auditPath, "utf8").split("\n")
      .filter(Boolean)
      .map(JSON.parse)
      .filter((request) => request.method === "catalog/start").length === 2)
  const searchStartedAt = performance.now()
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "workspace/symbol",
    params: { query: "ProductionIndexedType" },
  })
  const duringCatalog = await server.response(2)
  assert.equal(duringCatalog.result.length, 2)
  assert.ok(
    performance.now() - searchStartedAt < 400,
    "cached workspace search must stay interactive while cataloging",
  )
  const end = await server.progress(
    create.params.token,
    (message) => message.params.value.kind === "end",
  )
  assert.equal(end.params.value.kind, "end")
  const indexTerminal = readStructuredLog(logDirectory)
    .find((entry) => entry.event === "index.catalog.terminal")
  assert.deepEqual(
    {
      phase: indexTerminal?.phase,
      workspaceCount: indexTerminal?.workspaceCount,
      discoveredFiles: indexTerminal?.discoveredFiles,
      indexedFiles: indexTerminal?.indexedFiles,
      skippedEntries: indexTerminal?.skippedEntries,
      totalFiles: indexTerminal?.totalFiles,
    },
    {
      phase: "ready",
      workspaceCount: 2,
      discoveredFiles: 3,
      indexedFiles: 3,
      skippedEntries: 0,
      totalFiles: 3,
    },
  )

  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "workspace/symbol",
    params: { query: "ProductionIndexedType" },
  })
  const search = await server.response(3)
  assert.equal(search.result.length, 2)
  assert.ok(search.result.every((item) => item.name === "ProductionIndexedType" && item.kind === 5))

  const openUri = pathToFileURL(path.join(workspaceBPath, "ProductionIndexedType.ets")).href
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: openUri,
        languageId: "arkts",
        version: 1,
        text: "\n\nclass ProductionIndexedType {}\n",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "workspace/symbol",
    params: { query: "ProductionIndexedType" },
  })
  const overlaySearch = await server.response(4)
  const audit = fs.readFileSync(auditPath, "utf8").trim().split("\n").map(JSON.parse)
  assert.equal(
    overlaySearch.result.length,
    2,
    JSON.stringify(audit.filter((request) => request.method === "search")),
  )
  const authoritativeOverlay = overlaySearch.result.find((item) => item.location.uri === openUri)
  assert.equal(authoritativeOverlay.location.range.start.line, 2)
})

async function waitUntil(predicate, timeoutMs = 5_000) {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("timed out waiting for catalog start")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function readStructuredLog(logDirectory) {
  return fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse)
}
