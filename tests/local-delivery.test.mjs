import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
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
  assert.ok(fs.statSync(serverBundle).size > 0)
  assert.deepEqual(fs.readFileSync(extensionWasm).subarray(0, 4), Buffer.from([0x00, 0x61, 0x73, 0x6d]))

  const installedCommand = path.join(binDirectory, "arkts-language-server")
  const firstTarget = fs.realpathSync(installedCommand)
  const second = spawnSync(installer, [binDirectory], { cwd: os.tmpdir(), encoding: "utf8" })
  assert.equal(second.status, 0, second.stderr || second.error?.message)
  assert.equal(fs.realpathSync(installedCommand), firstTarget)

  const response = await initialize(installedCommand, os.tmpdir())
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
})
