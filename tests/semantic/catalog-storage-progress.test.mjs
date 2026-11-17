import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("framed LSP reports storage stages and elapsed time without retaining a fake 99 percent", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-storage-progress-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, "ProductionIndexedType.ets"), "class ProductionIndexedType {}")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true } },
    env: {
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests/fixtures/index/scripted-catalog-sidecar.mjs"),
      ARKTS_INDEX_TEST_SCENARIO: "storage-stages",
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  const reports = []
  for (;;) {
    const message = await session.transport.progress(create.params.token, () => true, 10_000)
    if (message.params.value.kind === "end") break
    reports.push(message.params.value)
  }
  assert.deepEqual(reports.filter(r => r.percentage !== undefined).map(r => r.percentage), [100])
  for (const stage of ["Writing index", "Committing index", "Saving index", "Validating index", "Publishing index"]) {
    assert.ok(reports.some(r => r.message?.includes(stage)), stage)
  }
  assert.ok(reports.some(r => /Saving index.*2s/.test(r.message)), "elapsed time advances during silent SQL I/O")
  assert.ok(reports.some(r => /1\/1 files/.test(r.message)), "committed file counts reach the UI")
  const search = await session.request("workspace/symbol", { query: "ProductionIndexedType" })
  assert.equal(search.result.length, 1)
})

test("framed LSP exposes real versioned cold SQL validation before exact indexed results", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-real-validation-progress-"))
  const folder = path.join(root, "workspace")
  fs.mkdirSync(folder)
  const workspace = fs.realpathSync(folder)
  const file = path.join(workspace, "Main.ets")
  fs.writeFileSync(file, Array.from({ length: 500 }, (_, i) => `export class Widget${i} { value: number = ${i} }`).join("\n"))
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true } },
    env: {
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
    },
  })
  t.after(async () => { await session.close(); fs.rmSync(root, { recursive: true, force: true }) })
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  const reports = []
  for (;;) {
    const message = await session.transport.progress(create.params.token, () => true, 20_000)
    if (message.params.value.kind === "end") break
    reports.push(message.params.value)
  }
  assert.ok(reports.some(r => r.message?.startsWith("Validating index")), JSON.stringify(reports))
  assert.ok(reports.some(r => r.message === "Indexed 1/1 files; skipped 0 entries"), JSON.stringify(reports))
  assert.deepEqual(reports.filter(r => r.percentage !== undefined).map(r => r.percentage), [100])
  const search = await session.request("workspace/symbol", { query: "Widget499" })
  assert.equal(search.error, undefined, JSON.stringify(search))
  assert.equal(search.result.length, 1)
  assert.equal(search.result[0].name, "Widget499")
  assert.equal(search.result[0].location.uri, pathToFileURL(file).href)
})
