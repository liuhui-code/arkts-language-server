import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

const projectRoot = path.resolve(import.meta.dirname, "../..")

test("persists and restores workspace symbols through the release Rust sidecar", async (t) => {
  const sidecarPath = requireReleaseSidecar()
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-real-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  const cacheDir = path.join(temporaryRoot, "cache")
  fs.mkdirSync(workspace)
  const documentPath = path.join(workspace, "PersistedService.ets")
  const documentUri = pathToFileURL(documentPath).href
  const driver = new DriverProcess(buildDriver(temporaryRoot), {
    ARKTS_INDEX_SIDECAR_PATH: sidecarPath,
  })
  t.after(() => driver.close())
  const descriptor = { id: "real-workspace", rootUri: pathToFileURL(workspace).href }

  assert.deepEqual(await driver.call("open", { workspace: descriptor, cacheDir }), {
    state: "warming",
    committedGeneration: 0,
  })
  assert.deepEqual(await driver.call("refresh", {
    workspaceId: descriptor.id,
    generation: 1,
    changed: [{
      uri: documentUri,
      version: 1,
      text: "class PersistedNodeAdapterService { runTask() {} }\n",
      workspaceId: descriptor.id,
    }],
  }), { state: "ready", committedGeneration: 1 })
  const fresh = await driver.call("search", {
    workspaceId: descriptor.id,
    query: "PNAS",
    limit: 20,
  })
  assert.equal(fresh.items[0].name, "PersistedNodeAdapterService")
  assert.equal(fresh.servedGeneration, 1)
  assert.equal(fresh.completeness, "ready")
  await driver.call("close", { workspaceId: descriptor.id })

  assert.deepEqual(await driver.call("open", { workspace: descriptor, cacheDir }), {
    state: "warming",
    committedGeneration: 1,
  })
  const restored = await driver.call("search", {
    workspaceId: descriptor.id,
    query: "PNAS",
    limit: 20,
  })
  assert.equal(restored.items[0].name, "PersistedNodeAdapterService")
  assert.equal(restored.servedGeneration, 1)
  assert.equal(restored.completeness, "stale")
  await driver.call("close", { workspaceId: descriptor.id })
})

function requireReleaseSidecar() {
  const executable = process.platform === "win32"
    ? "arkts-index-sidecar.exe"
    : "arkts-index-sidecar"
  const configuredPath = process.env.ARKTS_INDEX_REAL_SIDECAR
  if (configuredPath !== undefined) {
    assert.ok(configuredPath.trim(), "ARKTS_INDEX_REAL_SIDECAR must not be empty")
  }
  const sidecarPath = configuredPath === undefined
    ? path.join(projectRoot, "target", "release", executable)
    : path.resolve(configuredPath)
  assert.ok(
    fs.existsSync(sidecarPath),
    `required release sidecar does not exist: ${sidecarPath}`,
  )
  assert.ok(
    fs.statSync(sidecarPath).isFile(),
    `required release sidecar is not a file: ${sidecarPath}`,
  )
  fs.accessSync(sidecarPath, fs.constants.X_OK)
  return fs.realpathSync(sidecarPath)
}

function buildDriver(temporaryRoot) {
  const outfile = path.join(temporaryRoot, "adapter-driver.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "tests", "fixtures", "index", "adapter-driver.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
  })
  return outfile
}

class DriverProcess {
  constructor(driverPath, env = {}) {
    this.child = spawn(process.execPath, [driverPath], {
      cwd: os.tmpdir(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.nextId = 1
    this.pending = new Map()
    this.stderr = ""
    this.child.stderr.setEncoding("utf8")
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk })
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      const response = JSON.parse(line)
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      clearTimeout(pending.timeout)
      if (response.ok) pending.resolve(response.result)
      else pending.reject(Object.assign(new Error(response.error.message), response.error))
    })
  }

  call(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`timed out waiting for driver ${method}; stderr: ${this.stderr}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.child.stdin.write(`${JSON.stringify({ id, method, ...params })}\n`)
    })
  }

  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return
    try {
      await this.call("exit")
    } catch {}
    this.child.stdin.end()
    this.child.kill("SIGTERM")
    await once(this.child, "close")
  }
}
