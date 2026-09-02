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

test("times out silent initialize and terminates the wedged sidecar", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-timeout-initialize-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const auditPath = path.join(temporaryRoot, "audit.ndjson")
  const driver = new DriverProcess(
    buildDriver(temporaryRoot),
    {
      ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "silent-sidecar.sh"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_REQUEST_TIMEOUT_MS: "1500",
    },
  )
  t.after(() => driver.close())

  const startedAt = performance.now()
  await assert.rejects(
    driver.call("open", {
      workspace: { id: "silent-workspace", rootUri: pathToFileURL(workspace).href },
      cacheDir: path.join(temporaryRoot, "cache"),
    }, 4_000),
    (error) => error.name === "SidecarTimeoutError" && /initialize.*1500ms/i.test(error.message),
  )
  assert.ok(performance.now() - startedAt < 4_000)

  const audit = fs.readFileSync(auditPath, "utf8").trim().split("\n").map(JSON.parse)
  assert.equal(audit.filter((entry) => entry.event === "request").length, 1)
  assert.ok(audit.some((entry) => entry.event === "terminated" && entry.signal === "SIGTERM"))
})

test("times out silent search, rejects all pending work, and preserves degraded generation", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-timeout-search-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const auditPath = path.join(temporaryRoot, "audit.ndjson")
  const driver = new DriverProcess(
    buildDriver(temporaryRoot),
    {
      ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "silent-sidecar.sh"),
      ARKTS_INDEX_TEST_SCENARIO: "silent-search",
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_REQUEST_TIMEOUT_MS: "1000",
    },
  )
  t.after(() => driver.close())
  const workspaceId = "silent-search-workspace"
  await driver.call("open", {
    workspace: { id: workspaceId, rootUri: pathToFileURL(workspace).href },
    cacheDir: path.join(temporaryRoot, "cache"),
  })
  assert.deepEqual(await driver.call("refresh", {
    workspaceId,
    generation: 7,
    changed: [],
    removedUris: [],
  }), { state: "ready", committedGeneration: 7 })

  const [search, pendingStatus] = await Promise.allSettled([
    driver.call("search", { workspaceId, query: "never", limit: 20 }),
    driver.call("status", { workspaceId }),
  ])
  for (const result of [search, pendingStatus]) {
    assert.equal(result.status, "rejected")
    if (result.status === "rejected") {
      assert.equal(result.reason.name, "SidecarTimeoutError")
      assert.match(result.reason.message, /search.*1000ms/i)
    }
  }

  assert.deepEqual(await driver.call("status", { workspaceId }), {
    state: "degraded",
    committedGeneration: 7,
    message: "index sidecar search timed out after 1000ms",
  })
  assert.equal(await driver.call("close", { workspaceId }), undefined)
  assert.equal(await driver.call("close", { workspaceId }), undefined)
  const audit = fs.readFileSync(auditPath, "utf8").trim().split("\n").map(JSON.parse)
  assert.ok(audit.some((entry) => entry.event === "terminated" && entry.signal === "SIGTERM"))
})

test("bounds silent shutdown, falls back to SIGKILL, and keeps close idempotent", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-timeout-shutdown-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const auditPath = path.join(temporaryRoot, "audit.ndjson")
  const driver = new DriverProcess(
    buildDriver(temporaryRoot),
    {
      ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "silent-sidecar.sh"),
      ARKTS_INDEX_TEST_SCENARIO: "silent-shutdown-ignore-term",
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_REQUEST_TIMEOUT_MS: "3000",
      ARKTS_INDEX_TEST_TERMINATION_TIMEOUT_MS: "250",
    },
  )
  t.after(async () => {
    await driver.close()
    if (!fs.existsSync(auditPath)) return
    const started = readAudit(auditPath).find((entry) => entry.event === "started")
    if (!started) return
    try { process.kill(started.pid, "SIGKILL") } catch {}
  })
  const workspaceId = "silent-shutdown-workspace"
  await driver.call("open", {
    workspace: { id: workspaceId, rootUri: pathToFileURL(workspace).href },
    cacheDir: path.join(temporaryRoot, "cache"),
  })

  const startedAt = performance.now()
  const [firstClose, secondClose] = await Promise.all([
    driver.call("close", { workspaceId }, 7_000),
    driver.call("close", { workspaceId }, 7_000),
  ])
  assert.equal(firstClose, undefined)
  assert.equal(secondClose, undefined)
  assert.ok(performance.now() - startedAt < 7_000)

  const audit = readAudit(auditPath)
  assert.equal(audit.filter((entry) => entry.event === "request").length, 2)
  assert.ok(audit.some((entry) => entry.event === "terminated" && entry.signal === "SIGTERM"))
  const pid = audit.find((entry) => entry.event === "started").pid
  assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH")
})

test("maps one workspace session to protocol-v1 requests with canonical paths and monotonic IDs", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-adapter-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  const workspaceAlias = path.join(temporaryRoot, "workspace-alias")
  const cache = path.join(temporaryRoot, "cache")
  const cacheAlias = path.join(temporaryRoot, "cache-alias")
  fs.mkdirSync(workspace)
  fs.mkdirSync(cache)
  fs.symlinkSync(workspace, workspaceAlias, "dir")
  fs.symlinkSync(cache, cacheAlias, "dir")

  const auditPath = path.join(temporaryRoot, "sidecar-audit.ndjson")
  const sidecarPath = makeExecutableFixture(temporaryRoot, "scripted-sidecar.mjs")
  const driverPath = buildDriver(temporaryRoot)
  const driver = new DriverProcess(driverPath, {
    ARKTS_INDEX_SIDECAR_PATH: sidecarPath,
    ARKTS_INDEX_TEST_AUDIT: auditPath,
    ARKTS_INDEX_TEST_REQUEST_TIMEOUT_MS: "5000",
  })
  t.after(() => driver.close())

  const workspaceDescriptor = { id: "workspace-1", rootUri: pathToFileURL(workspaceAlias).href }
  assert.deepEqual(await driver.call("open", { workspace: workspaceDescriptor, cacheDir: cacheAlias }), {
    state: "warming",
    committedGeneration: 0,
  })
  assert.deepEqual(await driver.call("refresh", {
    workspaceId: "workspace-1",
    generation: 1,
    changed: [{
      uri: "file:///workspace/FixtureService.ets",
      version: 7,
      text: "class FixtureService {}\n",
      workspaceId: "workspace-1",
    }],
    removedUris: ["file:///workspace/Removed.ets"],
  }), { state: "ready", committedGeneration: 1 })
  assert.deepEqual(await driver.call("search", {
    workspaceId: "workspace-1",
    query: "FS",
    limit: 20,
  }), {
    items: [
      {
        name: "FixtureService",
        kind: "class",
        uri: "file:///workspace/FixtureService.ets",
        range: {
          start: { line: 2, character: 1 },
          end: { line: 2, character: 15 },
        },
        containerName: "FixtureModule",
      },
      {
        name: "topLevel",
        kind: "function",
        uri: "file:///workspace/functions.ets",
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 8 },
        },
      },
    ],
    servedGeneration: 1,
    completeness: "ready",
  })
  assert.deepEqual(await driver.call("status", { workspaceId: "workspace-1" }), {
    state: "ready",
    committedGeneration: 1,
  })
  assert.equal(await driver.call("close", { workspaceId: "workspace-1" }), undefined)
  assert.equal(await driver.call("close", { workspaceId: "workspace-1" }), undefined)

  const audit = fs.readFileSync(auditPath, "utf8").trim().split("\n").map(JSON.parse)
  assert.equal(audit.filter((entry) => entry.event === "started").length, 1)
  const requests = audit.filter((entry) => entry.event === "request").map((entry) => entry.request)
  assert.deepEqual(requests.map((request) => request.id), [1, 2, 3, 4, 5])
  assert.ok(requests.every((request) => request.protocol === 1))
  assert.deepEqual(requests.map((request) => request.method), [
    "initialize",
    "refresh",
    "search",
    "status",
    "shutdown",
  ])
  assert.equal(requests[0].params.workspaceRoot, fs.realpathSync(workspace))
  assert.equal(requests[0].params.cacheDirectory, fs.realpathSync(cache))
  assert.deepEqual(requests[1].params, {
    generation: 1,
    changed: [{ uri: "file:///workspace/FixtureService.ets", text: "class FixtureService {}\n" }],
    removedUris: ["file:///workspace/Removed.ets"],
  })
  await driver.gracefulExit()
})

test("rejects an aborted request promptly and drains its late response without corrupting the session", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-cancel-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const driver = new DriverProcess(
    buildDriver(temporaryRoot),
    {
      ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "scripted-sidecar.mjs"),
      ARKTS_INDEX_TEST_SCENARIO: "delayed-search",
      ARKTS_INDEX_TEST_REQUEST_TIMEOUT_MS: "5000",
    },
  )
  t.after(() => driver.close())
  await driver.call("open", {
    workspace: { id: "workspace-1", rootUri: pathToFileURL(workspace).href },
    cacheDir: path.join(temporaryRoot, "cache"),
  })

  const rejected = assert.rejects(
    driver.call("search", {
      workspaceId: "workspace-1",
      query: "first",
      limit: 20,
      requestKey: "slow-search",
    }, 1_000),
    (error) => error.name === "AbortError" && /aborted/i.test(error.message),
  )
  await driver.call("abort", { requestKey: "slow-search" })
  await rejected

  assert.deepEqual(await driver.call("status", { workspaceId: "workspace-1" }), {
    state: "warming",
    committedGeneration: 0,
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal((await driver.call("search", {
    workspaceId: "workspace-1",
    query: "second",
    limit: 20,
  })).items[0].name, "FixtureService")
  await driver.call("close", { workspaceId: "workspace-1" })
  await driver.gracefulExit()
})

test("cleans a rejected request timer after a sidecar business error", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-error-timer-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const driver = new DriverProcess(
    buildDriver(temporaryRoot),
    {
      ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "scripted-sidecar.mjs"),
      ARKTS_INDEX_TEST_SCENARIO: "request-error-on-search",
      ARKTS_INDEX_TEST_REQUEST_TIMEOUT_MS: "5000",
    },
  )
  t.after(() => driver.close())
  const workspaceId = "request-error-workspace"
  await driver.call("open", {
    workspace: { id: workspaceId, rootUri: pathToFileURL(workspace).href },
    cacheDir: path.join(temporaryRoot, "cache"),
  })

  await assert.rejects(
    driver.call("search", { workspaceId, query: "busy", limit: 20 }),
    (error) => error.name === "SidecarRequestError" && error.code === "busy",
  )
  assert.deepEqual(await driver.call("status", { workspaceId }), {
    state: "warming",
    committedGeneration: 0,
  })
  await driver.call("close", { workspaceId })
  await driver.gracefulExit()
})

test("rejects pending work and reports degraded without exposing stderr after the sidecar exits", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-exit-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const driver = new DriverProcess(
    buildDriver(temporaryRoot),
    {
      ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "scripted-sidecar.mjs"),
      ARKTS_INDEX_TEST_SCENARIO: "exit-on-search",
    },
  )
  t.after(() => driver.close())
  await driver.call("open", {
    workspace: { id: "workspace-1", rootUri: pathToFileURL(workspace).href },
    cacheDir: path.join(temporaryRoot, "cache"),
  })

  const [search, inFlightStatus] = await Promise.allSettled([
    driver.call("search", { workspaceId: "workspace-1", query: "secret", limit: 20 }),
    driver.call("status", { workspaceId: "workspace-1" }),
  ])
  assert.equal(search.status, "rejected")
  assert.equal(inFlightStatus.status, "rejected")
  for (const result of [search, inFlightStatus]) {
    if (result.status === "rejected") {
      assert.match(result.reason.message, /exited.*code=17/i)
      assert.doesNotMatch(result.reason.message, /SECRET_SOURCE_TEXT/)
    }
  }

  const degraded = await driver.call("status", { workspaceId: "workspace-1" })
  assert.equal(degraded.state, "degraded")
  assert.equal(degraded.committedGeneration, 0)
  assert.match(degraded.message, /exited.*code=17/i)
  assert.doesNotMatch(degraded.message, /SECRET_SOURCE_TEXT/)
  assert.equal(await driver.call("close", { workspaceId: "workspace-1" }), undefined)
  assert.equal(await driver.call("close", { workspaceId: "workspace-1" }), undefined)
})

for (const [scenario, message] of [
  ["malformed-response", /malformed JSON/i],
  ["protocol-mismatch", /invalid protocol response/i],
  ["unknown-response-id", /unknown response id/i],
  ["blank-protocol-line", /empty protocol line/i],
  ["unknown-event", /unrecognized sidecar event/i],
]) {
  test(`rejects ${scenario} as a strict sidecar protocol error`, async (t) => {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `arkts-index-${scenario}-`))
    t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
    const workspace = path.join(temporaryRoot, "workspace")
    fs.mkdirSync(workspace)
    const driver = new DriverProcess(
      buildDriver(temporaryRoot),
      {
        ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "scripted-sidecar.mjs"),
        ARKTS_INDEX_TEST_SCENARIO: scenario,
      },
    )
    t.after(() => driver.close())
    await driver.call("open", {
      workspace: { id: "workspace-1", rootUri: pathToFileURL(workspace).href },
      cacheDir: path.join(temporaryRoot, "cache"),
    })

    await assert.rejects(
      driver.call("search", { workspaceId: "workspace-1", query: "query", limit: 20 }),
      (error) => error.name === "SidecarProtocolError" && message.test(error.message),
    )
    const degraded = await driver.call("status", { workspaceId: "workspace-1" })
    assert.equal(degraded.state, "degraded")
    assert.match(degraded.message, message)
  })
}

test("resolves explicit and portable sidecar paths plus platform-native index cache directories", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-paths-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const driver = new DriverProcess(buildDriver(temporaryRoot))
  t.after(() => driver.close())
  const executable = process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"

  assert.equal(await driver.call("resolveSidecar", {
    options: { sidecarPath: "/explicit/arkts-sidecar", projectRoot: "/ignored", env: {} },
  }), path.resolve("/explicit/arkts-sidecar"))
  assert.equal(await driver.call("resolveSidecar", {
    options: { projectRoot: "/portable/arkts-language-server", env: {} },
  }), path.join("/portable/arkts-language-server", "target", "release", executable))
  assert.equal(await driver.call("resolveSidecar", {
    options: {
      projectRoot: "/ignored",
      env: { ARKTS_INDEX_SIDECAR_PATH: "/environment/arkts-sidecar" },
    },
  }), path.resolve("/environment/arkts-sidecar"))

  assert.equal(await driver.call("resolveCache", {
    options: {
      platform: "darwin",
      homeDirectory: "/Users/fixture",
      env: {},
    },
  }), "/Users/fixture/Library/Caches/arkts-language-server/index")
  assert.equal(await driver.call("resolveCache", {
    options: {
      platform: "linux",
      homeDirectory: "/home/fixture",
      env: { XDG_CACHE_HOME: "/xdg/cache" },
    },
  }), "/xdg/cache/arkts-language-server/index")
  assert.equal(await driver.call("resolveCache", {
    options: {
      platform: "win32",
      homeDirectory: "C:\\Users\\fixture",
      env: { LOCALAPPDATA: "C:\\LocalAppData" },
    },
  }), path.win32.join("C:\\LocalAppData", "arkts-language-server", "index"))
  assert.equal(await driver.call("resolveCache", {
    options: {
      platform: "linux",
      homeDirectory: "/ignored",
      env: { ARKTS_INDEX_CACHE_DIR: "/override/index-cache" },
    },
  }), path.resolve("/override/index-cache"))
})

test("persists and restores workspace symbols through the real Rust sidecar", async (t) => {
  const sidecarPath = process.env.ARKTS_INDEX_REAL_SIDECAR
    ?? path.join(projectRoot, "target", "debug", process.platform === "win32"
      ? "arkts-index-sidecar.exe"
      : "arkts-index-sidecar")
  if (!fs.existsSync(sidecarPath)) {
    t.skip("build arkts-index-sidecar or set ARKTS_INDEX_REAL_SIDECAR")
    return
  }

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

test("routes a valid id-less sidecar event without corrupting pending request responses", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-event-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const workspace = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspace)
  const driver = new DriverProcess(
    buildDriver(temporaryRoot),
    {
      ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "scripted-sidecar.mjs"),
      ARKTS_INDEX_TEST_SCENARIO: "event-before-search",
    },
  )
  t.after(() => driver.close())
  await driver.call("open", {
    workspace: { id: "workspace-1", rootUri: pathToFileURL(workspace).href },
    cacheDir: path.join(temporaryRoot, "cache"),
  })

  const search = await driver.call("search", {
    workspaceId: "workspace-1",
    query: "FixtureService",
    limit: 20,
  })
  assert.equal(search.items[0].name, "FixtureService")
  assert.deepEqual(await driver.call("events"), [{
    protocol: 1,
    event: "catalog/progress",
    params: {
      workspaceIdentity: "file:///workspace",
      status: { phase: "indexing", discovered: 42, indexed: 21 },
    },
  }])
})

function readAudit(auditPath) {
  return fs.readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
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

function makeExecutableFixture(temporaryRoot, fixtureName) {
  const source = path.join(projectRoot, "tests", "fixtures", "index", fixtureName)
  const destination = path.join(temporaryRoot, fixtureName)
  fs.copyFileSync(source, destination)
  fs.chmodSync(destination, 0o755)
  return destination
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
    if (this.child.exitCode !== null) return
    try {
      await this.call("exit")
    } catch {}
    this.child.stdin.end()
    this.child.kill("SIGTERM")
    await once(this.child, "close")
  }

  async gracefulExit(timeoutMs = 2_000) {
    if (this.child.exitCode !== null) return
    await this.call("exit")
    this.child.stdin.end()
    if (this.child.exitCode !== null) return
    await new Promise((resolve, reject) => {
      const onClose = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        this.child.off("close", onClose)
        reject(new Error("adapter driver retained a completed request timer"))
      }, timeoutMs)
      this.child.once("close", onClose)
    })
  }
}
