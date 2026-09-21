import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("initial catalog phase trace is opt-in and preserves LSP search", async t => {
  const silent = await catalogSession(t, false)
  const traced = await catalogSession(t, true)

  assert.deepEqual(silent.phaseEvents, [], "the default run must not emit phase trace events")
  assert.deepEqual(traced.phaseEvents.map(entry => entry.phase), [
    "discovering", "activating", "ready",
  ], "activation heartbeats must not duplicate a phase transition")
  assert.ok(traced.phaseEvents.every(entry => /^\d+$/.test(entry.monotonicNs)))
  assert.ok(traced.phaseEvents.every((entry, index, events) => (
    index === 0 || BigInt(entry.monotonicNs) > BigInt(events[index - 1].monotonicNs)
  )), "phase timestamps must increase monotonically")
  assert.deepEqual(traced.phaseEvents.map(entry => [
    entry.discoveredFiles, entry.indexedFiles,
  ]), [[0, 0], [1, 1], [1, 1]])
  assert.deepEqual(traced.phaseEvents.slice(1).map(entry => entry.totalFiles), [1, 1])
  assert.deepEqual(traced.phaseEvents.map(entry => [
    entry.buildingGeneration, entry.committedGeneration,
  ]), [[1, 0], [1, 0], [null, 1]],
  "building and committed generations must remain distinct")
})

async function catalogSession(t, traceEnabled) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-catalog-phase-trace-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logs = path.join(root, "logs")
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, "ProductionIndexedType.ets"),
    "class ProductionIndexedType {}\n")
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
        "scripted-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_SCENARIO: "activation-heartbeats",
      ARKTS_LSP_LOG_DIR: logs,
      ARKTS_INDEX_CATALOG_TRACE: traceEnabled ? "1" : "0",
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  const initialized = await session.initialize({ timeoutMs: 10_000 })
  assert.equal(initialized.result.capabilities.workspaceSymbolProvider, true)
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(
    create.params.token, message => message.params.value.kind === "end", 10_000,
  )
  const response = await session.request("workspace/symbol", {
    query: "ProductionIndexedType",
  }, { timeoutMs: 5_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.length, 1, "framed LSP search remains usable after cataloging")
  await session.close({ timeoutMs: 5_000 })
  const phaseEvents = readPhaseEvents(logs)
  return { phaseEvents }
}

function readPhaseEvents(logs) {
  const file = path.join(logs, "server.log")
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
    .filter(entry => entry.event === "index.catalog.phase")
}
