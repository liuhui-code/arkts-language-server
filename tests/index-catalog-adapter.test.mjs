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

const projectRoot = path.resolve(import.meta.dirname, "..")

test("routes catalog progress to two workspace sessions and reaches truthful terminals", async (t) => {
  const fixture = createFixture(t)
  const workspaceA = fixture.workspace("workspace-a")
  const workspaceB = fixture.workspace("workspace-b")
  await fixture.driver.call("open", { workspace: workspaceA, cacheDir: fixture.cache })
  await fixture.driver.call("open", { workspace: workspaceB, cacheDir: fixture.cache })

  const [reportsA, reportsB] = await Promise.all([
    fixture.driver.call("catalog", { workspace: workspaceA, requestKey: "a" }),
    fixture.driver.call("catalog", { workspace: workspaceB, requestKey: "b" }),
  ])
  assert.deepEqual(reportsA.at(-1), {
    phase: "ready",
    discoveredFiles: 1,
    indexedFiles: 1,
    skippedEntries: 0,
    totalFiles: 1,
  })
  assert.deepEqual(reportsB.at(-1), {
    phase: "ready",
    discoveredFiles: 2,
    indexedFiles: 2,
    skippedEntries: 0,
    totalFiles: 2,
  })
})

test("turns AbortSignal into catalog/cancel and waits for the cancelled terminal", async (t) => {
  const fixture = createFixture(t, { ARKTS_INDEX_TEST_SCENARIO: "slow-catalog" })
  const workspace = fixture.workspace("workspace-a")
  await fixture.driver.call("open", { workspace, cacheDir: fixture.cache })

  const catalog = fixture.driver.call("catalog", { workspace, requestKey: "slow" })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await fixture.driver.call("abort", { requestKey: "slow" })
  const reports = await catalog
  assert.equal(reports.at(-1).phase, "cancelled")

  const requests = fs.readFileSync(fixture.auditPath, "utf8").trim().split("\n").map(JSON.parse)
  assert.deepEqual(requests.map((request) => request.method), [
    "initialize",
    "catalog/start",
    "catalog/cancel",
  ])
  assert.deepEqual(requests[2].params, { generation: 1 })
})

test("bounds cancellation when the sidecar acknowledges cancel but omits its terminal event", async (t) => {
  const fixture = createFixture(t, { ARKTS_INDEX_TEST_SCENARIO: "cancel-without-terminal" })
  const workspace = fixture.workspace("workspace-a")
  await fixture.driver.call("open", { workspace, cacheDir: fixture.cache })

  const catalog = fixture.driver.call("catalog", { workspace, requestKey: "wedged" }, 2_000)
  await new Promise((resolve) => setTimeout(resolve, 100))
  await fixture.driver.call("abort", { requestKey: "wedged" })
  await assert.rejects(
    catalog,
    (error) => error.name === "SidecarTimeoutError" && /catalog.*terminal/i.test(error.message),
  )
  assert.deepEqual(await fixture.driver.call("status", { workspaceId: workspace.id }), {
    state: "degraded",
    committedGeneration: 0,
    message: "index sidecar catalog/cancel terminal timed out after 250ms",
  })
})

test("fails and terminates a catalog worker that stops making progress", async (t) => {
  const fixture = createFixture(t, { ARKTS_INDEX_TEST_SCENARIO: "stalled-catalog" })
  const workspace = fixture.workspace("workspace-a")
  await fixture.driver.call("open", { workspace, cacheDir: fixture.cache })
  await assert.rejects(
    fixture.driver.call("catalog", { workspace, requestKey: "stalled" }, 2_000),
    (error) => error.name === "SidecarTimeoutError" && /catalog progress.*250ms/i.test(error.message),
  )
  assert.deepEqual(await fixture.driver.call("status", { workspaceId: workspace.id }), {
    state: "degraded",
    committedGeneration: 0,
    message: "index sidecar catalog progress timed out after 250ms",
  })
})

test("preserves the committed catalog generation when the child exits after ready", async (t) => {
  const fixture = createFixture(t, { ARKTS_INDEX_TEST_SCENARIO: "exit-after-ready" })
  const workspace = fixture.workspace("workspace-a")
  await fixture.driver.call("open", { workspace, cacheDir: fixture.cache })
  await fixture.driver.call("catalog", { workspace, requestKey: "ready" })
  await new Promise((resolve) => setTimeout(resolve, 100))
  const status = await fixture.driver.call("status", { workspaceId: workspace.id })
  assert.equal(status.state, "degraded")
  assert.equal(status.committedGeneration, 1)
})

test("allows only one concurrent open for the same workspace id", async (t) => {
  const fixture = createFixture(t)
  const workspace = fixture.workspace("workspace-a")
  const opened = await Promise.allSettled([
    fixture.driver.call("open", { workspace, cacheDir: fixture.cache }),
    fixture.driver.call("open", { workspace, cacheDir: fixture.cache }),
  ])
  assert.equal(opened.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(opened.filter((result) => result.status === "rejected").length, 1)
  const requests = fs.readFileSync(fixture.auditPath, "utf8").trim().split("\n").map(JSON.parse)
  assert.equal(requests.filter((request) => request.method === "initialize").length, 1)
})

test("rejects new search as soon as shutdown starts", async (t) => {
  const fixture = createFixture(t, { ARKTS_INDEX_TEST_SCENARIO: "delayed-shutdown" })
  const workspace = fixture.workspace("workspace-a")
  await fixture.driver.call("open", { workspace, cacheDir: fixture.cache })
  const closing = fixture.driver.call("close", { workspaceId: workspace.id })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await assert.rejects(
    fixture.driver.call("search", { workspaceId: workspace.id, query: "after-close" }),
    /closed/i,
  )
  await closing
  const requests = fs.readFileSync(fixture.auditPath, "utf8").trim().split("\n").map(JSON.parse)
  assert.deepEqual(requests.map((request) => request.method), ["initialize", "shutdown"])
})

function createFixture(t, env = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-catalog-adapter-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const sidecarPath = path.join(temporaryRoot, "scripted-catalog-sidecar.mjs")
  fs.copyFileSync(
    path.join(projectRoot, "tests", "fixtures", "index", "scripted-catalog-sidecar.mjs"),
    sidecarPath,
  )
  fs.chmodSync(sidecarPath, 0o755)
  const driverPath = path.join(temporaryRoot, "catalog-adapter-driver.cjs")
  buildSync({
    entryPoints: [path.join(
      projectRoot,
      "tests",
      "fixtures",
      "index",
      "catalog-adapter-driver.ts",
    )],
    outfile: driverPath,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
  })
  const auditPath = path.join(temporaryRoot, "audit.ndjson")
  const driver = new DriverProcess(driverPath, {
    ARKTS_INDEX_SIDECAR_PATH: sidecarPath,
    ARKTS_INDEX_TEST_AUDIT: auditPath,
    ...env,
  })
  t.after(() => driver.close())
  const cache = path.join(temporaryRoot, "cache")
  return {
    auditPath,
    cache,
    driver,
    workspace(name) {
      const root = path.join(temporaryRoot, name)
      fs.mkdirSync(root)
      return { id: pathToFileURL(root).href, rootUri: pathToFileURL(root).href }
    },
  }
}

class DriverProcess {
  constructor(driverPath, env) {
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

  call(method, params = {}, timeoutMs = 12_000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`timed out waiting for ${method}; stderr: ${this.stderr}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.child.stdin.write(`${JSON.stringify({ id, method, ...params })}\n`)
    })
  }

  async close() {
    if (this.child.exitCode !== null) return
    try { await this.call("exit") } catch {}
    this.child.stdin.end()
    this.child.kill("SIGTERM")
    await once(this.child, "close")
  }
}
