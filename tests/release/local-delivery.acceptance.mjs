import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { assertInstalledSemanticSmoke } from "../support/installed-semantic-smoke.mjs"
import { LspProcess } from "../support/lsp-process.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const installer = path.join(projectRoot, "scripts", "install-local.sh")

function initialize(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["--stdio"], { cwd, stdio: ["pipe", "pipe", "pipe"] })
    let stdout = Buffer.alloc(0)
    let stderr = ""
    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      reject(new Error(`Timed out waiting for initialize response. stderr: ${stderr}`))
    }, 3_000)

    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.stdout.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, chunk])
      const headerEnd = stdout.indexOf("\r\n\r\n")
      if (headerEnd < 0) return
      const header = stdout.subarray(0, headerEnd).toString("ascii")
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1])
      const bodyStart = headerEnd + 4
      if (!Number.isFinite(length) || stdout.length < bodyStart + length) return
      clearTimeout(timeout)
      const response = JSON.parse(stdout.subarray(bodyStart, bodyStart + length).toString("utf8"))
      child.kill("SIGTERM")
      resolve(response)
    })

    const body = Buffer.from(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { processId: process.pid, rootUri: null, capabilities: {} },
    }))
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    child.stdin.write(body)
  })
}

test("one local command builds and idempotently installs a working Zed language server", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-local-delivery-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const binDirectory = path.join(temporaryRoot, "bin")

  const first = spawnSync(installer, [binDirectory], { cwd: os.tmpdir(), encoding: "utf8" })
  assert.equal(first.status, 0, first.stderr || first.error?.message)

  const serverBundle = path.join(projectRoot, "dist", "server.cjs")
  const extensionWasm = path.join(projectRoot, "editors", "zed", "extension.wasm")
  const sidecarBinary = path.join(
    projectRoot,
    "target",
    "release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar",
  )
  assert.ok(fs.statSync(serverBundle).size > 0)
  assert.deepEqual(fs.readFileSync(extensionWasm).subarray(0, 4), Buffer.from([0x00, 0x61, 0x73, 0x6d]))
  assert.ok(fs.statSync(sidecarBinary).size > 0)
  fs.accessSync(sidecarBinary, fs.constants.X_OK)

  const installedCommand = path.join(binDirectory, "arkts-language-server")
  const firstTarget = fs.realpathSync(installedCommand)
  const second = spawnSync(installer, [binDirectory], { cwd: os.tmpdir(), encoding: "utf8" })
  assert.equal(second.status, 0, second.stderr || second.error?.message)
  assert.equal(fs.realpathSync(installedCommand), firstTarget)

  const response = await initialize(installedCommand, os.tmpdir())
  assert.equal(response.result.serverInfo.name, "arkts-language-server")

  await assertInstalledSemanticSmoke({ installedCommand, temporaryRoot })

  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const source = "class InstalledProductionType { runTask() {} }\n"
  const sourceUri = pathToFileURL(path.join(workspace, "InstalledProductionType.ets")).href
  fs.writeFileSync(
    path.join(workspace, "InstalledProductionType.ets"),
    source,
  )
  const rootUri = pathToFileURL(workspace).href
  const server = new LspProcess({
    command: installedCommand,
    args: ["--stdio"],
    cwd: os.tmpdir(),
    env: {
      ARKTS_INDEX_SIDECAR_PATH: "",
      ARKTS_INDEX_CACHE_DIR: path.join(temporaryRoot, "index-cache"),
    },
  })
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 20,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      capabilities: { window: { workDoneProgress: true } },
    },
  })
  const productionInitialize = await server.response(20, 15_000)
  assert.equal(productionInitialize.result.capabilities.workspaceSymbolProvider, true)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const create = await server.serverRequest("window/workDoneProgress/create", () => true, 15_000)
  server.send({ jsonrpc: "2.0", id: create.id, result: null })
  const ready = await server.progress(
    create.params.token,
    (message) => message.params.value.kind === "report"
      && message.params.value.percentage === 100,
    30_000,
  )
  assert.match(ready.params.value.message, /^Indexed 1\/1 files; skipped 0 entries$/)
  await server.progress(
    create.params.token,
    (message) => message.params.value.kind === "end",
    30_000,
  )
  server.send({
    jsonrpc: "2.0",
    id: 21,
    method: "workspace/symbol",
    params: { query: "InstalledProductionType" },
  })
  const indexed = await server.response(21, 15_000)
  assert.equal(indexed.result.length, 1)
  assert.deepEqual(indexed.result[0], {
    name: "InstalledProductionType",
    kind: 5,
    location: {
      uri: sourceUri,
      range: {
        start: { line: 0, character: source.indexOf("InstalledProductionType") },
        end: {
          line: 0,
          character: source.indexOf("InstalledProductionType") + "InstalledProductionType".length,
        },
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 22,
    method: "workspace/symbol",
    params: { query: "runTask" },
  })
  const method = await server.response(22, 15_000)
  assert.deepEqual(method.result, [{
    name: "runTask",
    kind: 6,
    location: {
      uri: sourceUri,
      range: {
        start: { line: 0, character: source.indexOf("runTask") },
        end: { line: 0, character: source.indexOf("runTask") + "runTask".length },
      },
    },
    containerName: "InstalledProductionType",
  }])
  server.send({ jsonrpc: "2.0", id: 23, method: "shutdown", params: null })
  await server.response(23)
  const exited = once(server.child, "exit")
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  await exited

  const warm = new LspProcess({
    command: installedCommand,
    args: ["--stdio"],
    cwd: os.tmpdir(),
    env: {
      ARKTS_INDEX_SIDECAR_PATH: "",
      ARKTS_INDEX_CACHE_DIR: path.join(temporaryRoot, "index-cache"),
    },
  })
  t.after(() => warm.close())
  warm.send({
    jsonrpc: "2.0",
    id: 30,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      capabilities: { window: { workDoneProgress: true } },
    },
  })
  await warm.response(30, 15_000)
  warm.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  const warmCreate = await warm.serverRequest("window/workDoneProgress/create", () => true, 15_000)
  warm.send({ jsonrpc: "2.0", id: warmCreate.id, result: null })
  await warm.progress(
    warmCreate.params.token,
    (message) => message.params.value.kind === "report"
      && message.params.value.percentage !== 100,
    15_000,
  )
  const warmSearchStartedAt = performance.now()
  warm.send({
    jsonrpc: "2.0",
    id: 31,
    method: "workspace/symbol",
    params: { query: "InstalledProductionType" },
  })
  const warmResult = await warm.response(31, 2_000)
  assert.equal(warmResult.result[0].location.uri, sourceUri)
  assert.ok(
    performance.now() - warmSearchStartedAt < 400,
    "warm cached workspace search must complete within 400ms",
  )
  warm.send({ jsonrpc: "2.0", id: 32, method: "shutdown", params: null })
  await warm.response(32)
  const warmExited = once(warm.child, "exit")
  warm.send({ jsonrpc: "2.0", method: "exit", params: null })
  await warmExited
})
