import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "./support/lsp-session.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"
import { closeProductionFixture, shutdownProductionSession } from "./support/production-session-lifecycle.mjs"

test("an unusable configured cache warns through public LSP without disabling local definitions", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-storage-lsp-"))
  const project = path.join(directory, "project")
  fs.mkdirSync(project)
  const text = "export const storageProbe = 1;\nstorageProbe;\n"
  const file = path.join(project, "Main.ets")
  fs.writeFileSync(file, text)
  const blocked = path.join(directory, "cache-is-a-file")
  fs.writeFileSync(blocked, "preserve configured input")
  const session = new LspSession({ rootUri: pathToFileURL(project).href,
    env: { ARKTS_INDEX_CACHE_DIR: blocked, ARKTS_LSP_LOG_DIR: path.join(directory, "logs") } })
  t.after(async () => { await session.close({ timeoutMs: 7000 }); fs.rmSync(directory, { recursive: true, force: true }) })
  await session.initialize()
  const warning = await session.transport.notification("window/showMessage",
    message => message.params.type === 2 && message.params.message.includes("ARKTS_INDEX_CACHE_DIR"), 3000)
  assert.ok(warning.params.message.includes(blocked))
  assert.match(warning.params.message, /configured.*Workspace indexing is unavailable/)
  const uri = pathToFileURL(file).href
  session.openDocument({ uri, version: 1, text })
  const result = await session.request("textDocument/definition", { textDocument: { uri }, position: { line: 1, character: 3 } })
  assert.deepEqual(result.result, [{ uri, range: { start: { line: 0, character: 13 }, end: { line: 0, character: 25 } } }])
  assert.equal(fs.readFileSync(blocked, "utf8"), "preserve configured input")
})

test("real native indexes share a configured root, isolate workspaces and reuse the same directories after restart", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-native-storage-"))
  const configured = path.join(directory, "Configured Index 用户")
  const roots = ["Alpha", "Beta"].map(name => {
    const root = path.join(directory, "Project" + name)
    fs.mkdirSync(root)
    fs.writeFileSync(path.join(root, "Main.ets"), `export class CacheRoot${name} {}\n`)
    return root
  })
  const sessions = []
  let succeeded = false
  t.after(async () => {
    const live = sessions.filter(s => s.child.exitCode === null && s.child.signalCode === null)
    if (succeeded) await closeProductionFixture(live, directory)
    else {
      for (const session of live) await shutdownProductionSession(session)
      t.diagnostic(`failed native fixture preserved: ${directory}`)
    }
  })
  const native = path.join(projectRoot, "target/release", process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  const launch = async name => {
    const logDirectory = path.join(directory, "logs-" + name)
    const server = new LspProcess({ env: { ARKTS_INDEX_CACHE_DIR: configured,
      ARKTS_INDEX_SIDECAR_PATH: native, ARKTS_LSP_LOG_DIR: logDirectory, ARKTS_INDEX_CACHE_GC: "auto" } })
    sessions.push(server)
    let id = 1
    const request = async (method, params) => {
      const requestId = id++
      server.send({ jsonrpc: "2.0", id: requestId, method, params })
      const result = await server.response(requestId, 10_000)
      assert.equal(result.error, undefined, JSON.stringify(result.error))
      return result.result
    }
    await request("initialize", { processId: process.pid, rootUri: pathToFileURL(roots[0]).href,
      workspaceFolders: roots.map((root, index) => ({ uri: pathToFileURL(root).href, name: `project-${index}` })), capabilities: {} })
    server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
    await waitUntil(async () => (await request("workspace/symbol", { query: "CacheRoot" })).length === 2)
      .catch(error => { t.diagnostic(server.stderr); throw error })
    const symbols = await request("workspace/symbol", { query: "CacheRoot" })
    for (const [index, name] of ["Alpha", "Beta"].entries()) {
      const symbol = symbols.find(item => item.name === `CacheRoot${name}`)
      assert.ok(symbol)
      assert.equal(symbol.kind, 5)
      assert.equal(symbol.location.uri, pathToFileURL(path.join(roots[index], "Main.ets")).href)
      assert.deepEqual(symbol.location.range, { start: { line: 0, character: 13 }, end: { line: 0, character: 13 + symbol.name.length } })
    }
    const log = () => fs.readFileSync(path.join(logDirectory, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
    await waitUntil(async () => log().some(item => item.event === "index.cache.gc.completed"))
    const selections = log().filter(item => item.event === "index.cache.directory.selected")
    assert.equal(selections.length, 1, "all roots share one startup selection")
    assert.equal(selections[0].directory, configured)
    assert.equal(selections[0].source, "environment")
    const maintenance = JSON.parse(fs.readFileSync(path.join(configured, ".gc-last-report.json"), "utf8"))
    assert.equal(maintenance.removedBytes, 0)
    assert.ok(maintenance.entries.length > 0)
    assert.ok(maintenance.entries.every(item => item.reason === "active-workspace"))
    assert.equal(log().some(item => item.event === "index.cache.directory.unavailable"), false)
    return server
  }
  const first = await launch("first")
  const keys = fs.readdirSync(path.join(configured, "workspaces")).sort()
  assert.equal(keys.length, 2)
  assert.ok(keys.every(key => /^[a-f0-9]{64}$/.test(key)))
  await shutdownProductionSession(first)
  const second = await launch("reopened")
  assert.deepEqual(fs.readdirSync(path.join(configured, "workspaces")).sort(), keys)
  assert.equal(fs.readdirSync(configured).some(name => name.startsWith(".arkts-index-probe-")), false)
  t.diagnostic(JSON.stringify({ kind: "Mac real-native framed LSP; Windows only when run there", root: configured,
    workspaceKeys: keys, nativeSha256: createHash("sha256").update(fs.readFileSync(native)).digest("hex"),
    windowsNative: process.platform === "win32", restartReusedDirectories: true, maintenanceRemovedBytes: 0 }))
  await shutdownProductionSession(second)
  succeeded = true
})

async function waitUntil(condition) {
  const end = Date.now() + 10_000
  while (Date.now() < end) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail("index startup did not reach the asserted public state")
}

test("cache administration keeps explicit CLI priority and readonly preview without startup probes", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-cache-path-cli-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const configuredFile = path.join(directory, "configured-not-a-directory")
  fs.writeFileSync(configuredFile, "preserve input")
  const requested = path.join(directory, "explicit-missing-cache")
  const native = path.join(projectRoot, "target/release", process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  const report = JSON.parse(execFileSync(process.execPath, [path.join(projectRoot, "dist/server.cjs"),
    "--index-cache", "preview", "--cache-dir", requested], { encoding: "utf8", timeout: 10_000,
    env: { ...process.env, ARKTS_INDEX_CACHE_DIR: configuredFile, ARKTS_INDEX_SIDECAR_PATH: native } }))
  assert.equal(report.schema, "arkts.index-cache-gc.v1")
  assert.equal(report.apply, false)
  assert.equal(report.scanned, 0)
  assert.equal(fs.existsSync(requested), false)
  assert.equal(fs.readFileSync(configuredFile, "utf8"), "preserve input")
})
