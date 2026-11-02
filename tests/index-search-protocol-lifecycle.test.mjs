import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildDriver, DriverProcess, makeExecutableFixture, readAudit } from "./support/index-adapter-harness.mjs"

test("retires malformed successful symbol search responses until explicit reopen", async (t) => {
  const { driver, workspace, cacheDir, auditPath } = setup(t, "invalid-search-result")
  const workspaceId = workspace.id
  await driver.call("open", { workspace, cacheDir })
  await driver.call("refresh", { workspaceId, generation: 7 })

  const searches = []
  for (const query of ["first", "second"]) {
    try {
      await driver.call("search", { workspaceId, query, limit: 20 })
      assert.fail("malformed successful payload must not resolve")
    } catch (error) {
      searches.push(error)
    }
  }
  const status = await driver.call("status", { workspaceId })
  const methods = readAudit(auditPath)
    .filter((entry) => entry.event === "request")
    .map((entry) => entry.request.method)
  await driver.call("close", { workspaceId })
  const retired = readAudit(auditPath)

  // Recovery is explicit, not an automatic respawn on the failed search.
  await driver.call("open", { workspace, cacheDir })
  await driver.call("refresh", { workspaceId, generation: 8 })
  assert.deepEqual(await driver.call("status", { workspaceId }), {
    state: "ready", committedGeneration: 8,
  })
  assert.equal(readAudit(auditPath).filter((entry) => entry.event === "started").length, 2)
  await driver.call("close", { workspaceId })

  assert.deepEqual(methods, ["initialize", "refresh", "search"],
    "failed session must reject later work locally without another protocol send")
  assert.deepEqual(status, {
    state: "degraded",
    committedGeneration: 7,
    message: "index sidecar returned an invalid symbol search result",
  })
  for (const error of searches) {
    assert.equal(error.name, "SidecarProtocolError")
    assert.match(error.message, /invalid symbol search result/)
  }
  assert.ok(retired.some((entry) => entry.event === "terminated" && entry.signal === "SIGTERM"))
})

test("business search rejections keep the same sidecar available", async (t) => {
  const { driver, workspace, cacheDir, auditPath } = setup(t, "request-error-on-search")
  const workspaceId = workspace.id
  await driver.call("open", { workspace, cacheDir })
  await driver.call("refresh", { workspaceId, generation: 7 })
  for (const query of ["first", "second"]) {
    await assert.rejects(driver.call("search", { workspaceId, query, limit: 20 }),
      (error) => error.name === "SidecarRequestError" && error.code === "busy")
  }
  assert.deepEqual(await driver.call("status", { workspaceId }), {
    state: "ready", committedGeneration: 7,
  })
  const audit = readAudit(auditPath)
  assert.equal(audit.filter((entry) => entry.event === "started").length, 1)
  assert.equal(audit.filter((entry) => entry.event === "terminated").length, 0)
  assert.deepEqual(audit.filter((entry) => entry.event === "request")
    .map((entry) => entry.request.method), ["initialize", "refresh", "search", "search", "status"])
  await driver.call("close", { workspaceId })
})

function setup(t, scenario) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-search-protocol-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const root = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(root)
  const auditPath = path.join(temporaryRoot, "audit.ndjson")
  const driver = new DriverProcess(buildDriver(temporaryRoot), {
    ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(temporaryRoot, "scripted-sidecar.mjs"),
    ARKTS_INDEX_TEST_SCENARIO: scenario,
    ARKTS_INDEX_TEST_AUDIT: auditPath,
  })
  t.after(() => driver.close())
  return {
    driver, auditPath,
    workspace: { id: "search-protocol-workspace", rootUri: pathToFileURL(root).href },
    cacheDir: path.join(temporaryRoot, "cache"),
  }
}
