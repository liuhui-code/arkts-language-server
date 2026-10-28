import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"
import { waitForCatalog } from "../../scripts/bench/reference-replay-evidence.mjs"

test("recalls and semantically validates an auto-import beyond 4096 module exports", { timeout: 60_000 }, async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const sourceDirectory = path.join(
    materialized.workspaceRoot,
    "entry",
    "src",
    "main",
    "ets",
    "pages",
  )
  const exportPath = path.join(sourceDirectory, "ManyExports.ets")
  const filler = Array.from(
    { length: 4_999 },
    (_, index) => `export class AaaFillerExport${String(index).padStart(4, "0")} {}`,
  )
  await fs.promises.writeFile(
    exportPath,
    `${filler.join("\n")}\nexport class ExactNeedleExport {}\n`,
    "utf8",
  )
  const consumerPath = path.join(sourceDirectory, "Beyond4096Consumer.ets")
  const source = "const selected = ExactNeedle\n"
  await fs.promises.writeFile(consumerPath, source, "utf8")
  const uri = pathToFileURL(consumerPath).href
  const sidecarAuditPath = path.join(materialized.root, "semantic-over-4096.ndjson")
  const logDirectory = path.join(materialized.root, "semantic-over-4096-logs")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(
        projectRoot,
        "tests",
        "fixtures",
        "index",
        "scripted-catalog-sidecar.mjs",
      ),
      ARKTS_INDEX_TEST_SCENARIO: "semantic-over-4096",
      ARKTS_INDEX_TEST_AUDIT: sidecarAuditPath,
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE: "discovery",
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  session.openDocument({ uri, languageId: "arkts", version: 1, text: source })
  // Cached search remains live while cataloging; it cannot prove committed readiness.
  assert.equal(await waitForCatalog(session, 5_000), "Indexed 1/1 files; skipped 0 entries")
  let indexReady = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const discovery = await session.request("workspace/symbol", { query: "ProductionIndexedType" })
    if (discovery.result?.some((symbol) => symbol.name === "ProductionIndexedType")) {
      indexReady = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(indexReady, true, "scripted index session must open before completion discovery")

  const prefixOffset = source.indexOf("ExactNeedle")
  const replacement = {
    start: positionAt(source, prefixOffset),
    end: positionAt(source, prefixOffset + "ExactNeedle".length),
  }
  const response = await session.request("textDocument/completion", {
    textDocument: { uri },
    position: replacement.end,
  })
  assert.equal(response.error, undefined, `${JSON.stringify(response.error)}\n${session.transport.stderr}`)
  const exportSearch = fs.readFileSync(sidecarAuditPath, "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .find((request) => request.method === "exports/search")
  assert.deepEqual(exportSearch?.params, { query: "ExactNeedle", limit: 128 })
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const matches = items.filter((item) => item.label === "ExactNeedleExport")
  assert.equal(matches.length, 1, JSON.stringify(items))
  assert.deepEqual(matches[0].textEdit, {
    range: replacement,
    newText: "ExactNeedleExport",
  })
  const completionEvents = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((entry) => entry.event === "completion.program.complete")
  assert.equal(completionEvents.length, 1)
  assert.equal(completionEvents[0].programProjectRootFiles, 2)
  assert.equal(completionEvents[0].preResolvedCompletions, 1, JSON.stringify(completionEvents[0]))
  const resolved = await session.request("completionItem/resolve", matches[0])
  assert.equal(
    resolved.error,
    undefined,
    `${JSON.stringify(resolved.error)}\n${session.transport.stderr}`,
  )
  assert.match(resolved.result.additionalTextEdits?.[0]?.newText ?? "", /ManyExports/)
  const resolveEvents = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse)
    .filter((entry) => entry.event === "completion.resolve.program.complete")
  assert.equal(resolveEvents.length, 0)

  // A cached details payload is still owned by the namespace in which the
  // compiler produced it; a new package epoch cannot authorize its edits.
  const packagePath = path.join(materialized.workspaceRoot, "entry", "oh-package.json5")
  const packageSource = fs.readFileSync(packagePath, "utf8")
  fs.writeFileSync(packagePath, `${packageSource}\n// namespace lifecycle regression\n`)
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(packagePath).href, type: 2 }] } })
  const expiredCached = await session.request("completionItem/resolve", matches[0])
  assert.equal(expiredCached.error, undefined, JSON.stringify(expiredCached))
  assert.deepEqual(expiredCached.result, matches[0])
  assert.equal(expiredCached.result.additionalTextEdits, undefined)

  const staleLogDirectory = path.join(materialized.root, "semantic-over-4096-stale-logs")
  const staleSession = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(
        projectRoot,
        "tests",
        "fixtures",
        "index",
        "scripted-catalog-sidecar.mjs",
      ),
      ARKTS_INDEX_TEST_SCENARIO: "semantic-over-4096-stale",
      ARKTS_LSP_LOG_DIR: staleLogDirectory,
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE: "discovery",
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
  })
  t.after(() => staleSession.close().catch(() => {}))
  await staleSession.initialize()
  staleSession.openDocument({ uri, languageId: "arkts", version: 1, text: source })
  const staleResponse = await staleSession.request("textDocument/completion", {
    textDocument: { uri },
    position: replacement.end,
  })
  assert.equal(staleResponse.error, undefined, JSON.stringify(staleResponse.error))
  const staleItems = Array.isArray(staleResponse.result)
    ? staleResponse.result
    : staleResponse.result?.items ?? []
  const staleMatches = staleItems.filter((item) => item.label === "ExactNeedleExport")
  assert.equal(staleMatches.length, 1)
  const staleCompletionEvents = fs.readFileSync(
    path.join(staleLogDirectory, "server.log"),
    "utf8",
  ).trim().split("\n").map(JSON.parse)
    .filter((entry) => entry.event === "completion.program.complete")
  assert.equal(staleCompletionEvents.length, 1)
  assert.equal(staleCompletionEvents[0].programProjectRootFiles, 25)
  assert.equal(staleCompletionEvents[0].preResolvedCompletions, 0)
  assert.equal(staleCompletionEvents[0].preResolvedCompletions, 0)
  const staleResolved = await staleSession.request("completionItem/resolve", staleMatches[0])
  assert.equal(staleResolved.error, undefined, JSON.stringify(staleResolved.error))
  assert.match(staleResolved.result.additionalTextEdits?.[0]?.newText ?? "", /ManyExports/)
  const staleResolveEvents = fs.readFileSync(
    path.join(staleLogDirectory, "server.log"),
    "utf8",
  ).trim().split("\n").map(JSON.parse)
    .filter((entry) => entry.event === "completion.resolve.program.complete")
  assert.equal(staleResolveEvents.length, 1)
  assert.equal(staleResolveEvents[0].programProjectRootFiles, 25)
})

function positionAt(source, offset) {
  const before = source.slice(0, offset)
  const line = before.split("\n").length - 1
  const lineStart = before.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}
