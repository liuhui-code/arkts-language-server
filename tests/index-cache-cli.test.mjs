import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"
import { pathToFileURL } from "node:url"
import { closeProductionFixture, shutdownProductionSession } from "./support/production-session-lifecycle.mjs"

test("the bundled server entry exposes an explicit read-only index-cache command", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-cache-cli-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const cache = path.join(directory, "index")
  const stdout = execFileSync(process.execPath, [path.join(projectRoot, "dist/server.cjs"),
    "--index-cache", "preview", "--cache-dir", cache], { cwd: os.tmpdir(),
    env: { ...process.env, ARKTS_INDEX_CACHE_DIR: cache, ARKTS_LSP_LOG_DIR: path.join(directory, "logs"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target", "release",
        process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar") },
    encoding: "utf8", timeout: 10_000 })
  const report = JSON.parse(stdout)
  assert.equal(report.schema, "arkts.index-cache-gc.v1")
  assert.equal(report.apply, false)
  assert.equal(report.scanned, 0)
  await assert.rejects(fs.stat(cache), { code: "ENOENT" })
})

test("a real LSP session starts bounded automatic maintenance while preserving active symbols", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-cache-lsp-auto-"))
  const cache = path.join(directory, "index")
  const root = path.join(directory, "workspace")
  const logs = path.join(directory, "logs")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "Target.ets"), "export class CacheFeatureTarget {}\n")
  const server = new LspProcess({ env: { ARKTS_INDEX_CACHE_DIR: cache, ARKTS_LSP_LOG_DIR: logs,
    ARKTS_INDEX_CACHE_GC: "auto" } })
  t.after(async () => { await server.close(); await fs.rm(directory, { recursive: true, force: true }) })
  server.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    processId: process.pid, rootUri: pathToFileURL(root).href,
    capabilities: { window: { workDoneProgress: true } } } })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const create = await server.serverRequest("window/workDoneProgress/create")
  server.send({ jsonrpc: "2.0", id: create.id, result: null })
  await server.progress(create.params.token, item => item.params.value.kind === "end", 10_000)
  const deadline = Date.now() + 5_000
  let records = []
  while (Date.now() < deadline) {
    records = (await fs.readFile(path.join(logs, "server.log"), "utf8"))
      .split("\n").filter(Boolean).map(JSON.parse)
    if (records.some(item => item.event === "index.cache.gc.completed")) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(records.some(item => item.event === "index.cache.gc.completed"), "automatic maintenance did not finish")
  server.send({ jsonrpc: "2.0", id: 2, method: "workspace/symbol", params: { query: "CacheFeatureTarget" } })
  const symbols = await server.response(2)
  assert.equal(symbols.result[0].name, "CacheFeatureTarget")
  const report = JSON.parse(await fs.readFile(path.join(cache, ".gc-last-report.json"), "utf8"))
  assert.equal(report.removedBytes, 0)
  assert.equal(report.entries[0].reason, "active-workspace")
  server.send({ jsonrpc: "2.0", id: 3, method: "shutdown", params: null })
  await server.response(3)
  server.send({ jsonrpc: "2.0", method: "exit" })
})

test("orderly LSP disposal releases the actual native cache lease before fixture deletion", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-cache-orderly-close-"))
  const cache = path.join(directory, "index")
  const root = path.join(directory, "workspace")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "Target.ets"), "export class ClosedCacheTarget {}\n")
  const server = new LspProcess({ env: { ARKTS_INDEX_CACHE_DIR: cache,
    ARKTS_LSP_LOG_DIR: path.join(directory, "logs") } })
  let disposed = false
  t.after(async () => {
    if (!disposed) await closeProductionFixture([server], directory)
    else await fs.rm(directory, { recursive: true, force: true })
  })
  server.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    processId: process.pid, rootUri: pathToFileURL(root).href,
    capabilities: { window: { workDoneProgress: true } } } })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const create = await server.serverRequest("window/workDoneProgress/create")
  server.send({ jsonrpc: "2.0", id: create.id, result: null })
  await server.progress(create.params.token, item => item.params.value.kind === "end", 10_000)
  await shutdownProductionSession(server)
  disposed = true
  const native = path.join(projectRoot, "target", "release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  const report = JSON.parse(execFileSync(native, ["--cache-gc", "--cache-dir", cache,
    "--idle-ms", "0"], { encoding: "utf8" }))
  assert.equal(report.entries.length, 1)
  assert.equal(report.entries[0].outcome, "eligible", JSON.stringify(report))
  assert.equal(report.entries[0].reason, "idle-workspace")
  await fs.rm(cache, { recursive: true })
  await assert.rejects(fs.stat(cache), { code: "ENOENT" })
})
