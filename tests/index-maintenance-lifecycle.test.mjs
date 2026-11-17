import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"
import { DriverProcess, makeExecutableFixture, readAudit } from "./support/index-adapter-harness.mjs"

function setup(t, scenario) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-maintenance-lifecycle-"))
  const driverPath = path.join(root, "driver.cjs")
  buildSync({ entryPoints: [new URL("fixtures/index/catalog-adapter-driver.ts", import.meta.url).pathname],
    outfile: driverPath, bundle: true, platform: "node", format: "cjs" })
  const workspaceRoot = path.join(root, "workspace")
  fs.mkdirSync(workspaceRoot)
  const workspace = { id: pathToFileURL(workspaceRoot).href, rootUri: pathToFileURL(workspaceRoot).href }
  const audit = path.join(root, "audit.jsonl")
  const release = path.join(root, "release-start")
  const driver = new DriverProcess(driverPath, {
    ARKTS_INDEX_SIDECAR_PATH: makeExecutableFixture(root, "scripted-maintenance-sidecar.mjs"),
    ARKTS_INDEX_TEST_SCENARIO: scenario, ARKTS_INDEX_TEST_AUDIT: audit,
    ARKTS_INDEX_TEST_RELEASE: release,
  })
  t.after(async () => {
    if (driver.child.exitCode === null && driver.child.signalCode === null) {
      await driver.call("close", { workspaceId: workspace.id }, 1000).catch(() => {})
    }
    await driver.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  const catalog = requestKey => driver.call("catalog", { workspace, requestKey })
  const status = () => driver.call("status", { workspaceId: workspace.id })
  const search = requestKey => driver.call("search", { workspaceId: workspace.id, query: "Target", requestKey })
  const observed = async (method, count = 1) => {
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (fs.existsSync(audit) && readAudit(audit).filter(x => x.method === method).length >= count) return
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    assert.fail(`fixture did not observe ${method}`)
  }
  return { driver, workspace, audit, catalog, status, search, observed,
    releaseStart: () => fs.writeFileSync(release, "release"),
    observe: () => driver.call("observe", { workspaceId: workspace.id,
      batch: { rootUri: workspace.rootUri, rootDirty: false,
        changes: [{ uri: pathToFileURL(path.join(workspaceRoot, "Source.ets")).href, kind: "changed" }] } }),
    open: () => driver.call("open", { workspace, cacheDir: path.join(root, "cache") }) }
}

for (const scenario of ["terminal-before-ack", "reset-counters"]) {
  test(`accepts truthful terminal and traversal-local progress (${scenario})`, async t => {
    const f = setup(t, scenario)
    await f.open()
    const reports = await f.catalog("one")
    assert.equal(reports.at(-1).phase, "ready")
    const { indexProof, ...status } = await f.status()
    assert.deepEqual(status, { state: "ready", committedGeneration: 1 })
    assert.equal(indexProof.format, "versioned")
    assert.deepEqual(indexProof.qualification.input,
      readAudit(f.audit).find(x => x.method === "maintenance/start").params.input)
  })
}

for (const scenario of ["hold-start-ack", "cancel-terminal-before-ack"]) {
  test(`cancellation drains one terminal across ACK ordering (${scenario})`, async t => {
    const f = setup(t, scenario)
    await f.open()
    const pending = f.catalog("one")
    await f.observed("maintenance/start")
    await f.driver.call("abort", { requestKey: "one" })
    if (scenario === "hold-start-ack") f.releaseStart()
    const reports = await pending
    assert.equal(reports.at(-1).phase, "cancelled")
    const cancel = readAudit(f.audit).filter(x => x.method === "maintenance/cancel")
    assert.equal(cancel.length, 1)
    const start = readAudit(f.audit).find(x => x.method === "maintenance/start")
    assert.deepEqual(cancel[0].params, { attemptId: start.params.attemptId, input: start.params.input })
  })
}

for (const scenario of ["wrong-task", "wrong-proof"]) {
  test(`invalid maintenance identity retires the session (${scenario})`, async t => {
    const f = setup(t, scenario)
    await f.open()
    await assert.rejects(f.catalog("one"), { name: "SidecarProtocolError" })
    assert.equal((await f.status()).state, "degraded")
  })
}

test("a stalled maintenance task reaches a bounded failure", async t => {
  const f = setup(t, "silent")
  await f.open()
  await assert.rejects(f.catalog("one"), { name: "SidecarTimeoutError" })
  assert.equal((await f.status()).state, "degraded")
})

test("maintenance events cannot run before capability and workspace identity are acknowledged", async t => {
  const f = setup(t, "unnegotiated-event")
  await assert.rejects(f.open(), { name: "SidecarProtocolError" })
})

test("read cancellation targets epoch/id/token and leaves shared maintenance usable", async t => {
  const f = setup(t, "held-read")
  await f.open()
  await f.catalog("one")
  const pending = f.search("read").then(() => assert.fail("cancelled read must reject"), error => error)
  await f.observed("search")
  await f.driver.call("abort", { requestKey: "read" })
  assert.equal((await pending).name, "AbortError")
  await f.observed("index/cancel")
  const requests = readAudit(f.audit)
  const read = requests.find(x => x.method === "search")
  const cancel = requests.find(x => x.method === "index/cancel")
  assert.deepEqual(cancel.params, { readerEpoch: "fixture-reader-epoch", requestId: read.id,
    requestToken: read.params.requestToken })
  assert.equal(requests.filter(x => x.method === "maintenance/cancel").length, 0)
  assert.equal((await f.status()).state, "ready")
})

test("a mismatched read epoch is a protocol failure", async t => {
  const f = setup(t, "wrong-read-epoch")
  await f.open()
  await f.catalog("one")
  await assert.rejects(f.search("read"), { name: "SidecarProtocolError" })
  assert.equal((await f.status()).state, "degraded")
})

test("an old-input read arriving after a new task rejects locally without retiring the session", async t => {
  const f = setup(t, "late-read")
  await f.open()
  await f.catalog("one")
  const pending = f.search("read").then(() => assert.fail("old input must reject"), error => error)
  await f.observed("search")
  await f.catalog("two")
  assert.equal((await pending).name, "SidecarRequestError")
  assert.equal((await f.status()).state, "ready")
})

test("cancelling a read waiting for the input ACK does not cancel shared delivery or send a Native read", async t => {
  const f = setup(t, "hold-start-ack")
  await f.open()
  const catalog = f.catalog("one")
  await f.observed("maintenance/start")
  const read = f.search("read").then(() => assert.fail("cancelled wait must reject"), error => error)
  await f.driver.call("abort", { requestKey: "read" })
  assert.equal((await read).name, "AbortError")
  await f.driver.call("abort", { requestKey: "one" })
  f.releaseStart()
  assert.equal((await catalog).at(-1).phase, "cancelled")
  const sent = readAudit(f.audit)
  assert.equal(sent.filter(x => x.method === "search" || x.method === "index/cancel").length, 0)
  assert.equal(sent.filter(x => x.method === "maintenance/cancel").length, 1)
})

test("an already cancelled read after session failure must not create an unhandled rejected input wait", async t => {
  const f = setup(t, "wrong-task")
  await f.open()
  await assert.rejects(f.catalog("one"), { name: "SidecarProtocolError" })
  await assert.rejects(f.driver.call("abortedSearch", { workspaceId: f.workspace.id }), { name: "AbortError" })
  const status = await f.driver.call("status", { workspaceId: f.workspace.id }, 1000)
  assert.equal(status.state, "degraded")
})


test("a file terminal before a refused reconcile ACK retries the same logical task without losing its wakeup", async t => {
  const f = setup(t, "file-terminal-before-refusal")
  await f.open()
  await f.catalog("cold")
  await f.observe()
  const reports = await f.catalog("updated")
  assert.equal(reports.at(-1).phase, "ready")
  const sent = readAudit(f.audit)
  const starts = sent.filter(x => x.method === "maintenance/start")
  assert.equal(starts.length, 3)
  assert.deepEqual(starts[1].params, starts[2].params)
  assert.equal(sent.filter(x => x.method === "initialize").length, 1)
})

test("cancelling a queued reconcile preserves file mutation and does not assign another unobserved input on retry", async t => {
  const f = setup(t, "busy-file")
  await f.open()
  await f.catalog("cold")
  await f.observe()
  const waiting = f.catalog("queued")
  await f.observed("maintenance/start", 2)
  await f.driver.call("abort", { requestKey: "queued" })
  assert.equal((await waiting).at(-1).phase, "cancelled")
  const retry = f.catalog("retry").then(result => ({ result }), error => ({ error }))
  await f.observed("maintenance/start", 3)
  assert.equal((await f.status()).state, "warming", "cached reads must use the already observed mutation input")
  f.releaseStart()
  const completed = await retry
  assert.equal(completed.error, undefined)
  assert.equal(completed.result.at(-1).phase, "ready")
  const sent = readAudit(f.audit)
  const change = sent.find(x => x.method === "maintenance/changes")
  const starts = sent.filter(x => x.method === "maintenance/start").slice(1)
  assert.ok(starts.every(x => x.params.input.revision === change.params.input.revision))
  assert.equal(sent.filter(x => x.method === "maintenance/cancel").length, 0)
})


test("a superseded input waiter rejects before the shared held ACK and latest input still recovers", async t => {
  const f = setup(t, "hold-change-ack")
  await f.open()
  await f.catalog("cold")
  await f.observe()
  await f.observed("maintenance/changes")
  const obsolete = f.driver.call("search", { workspaceId: f.workspace.id,
    query: "Target", requestKey: "obsolete" }, 1000).then(result => ({ result }), error => ({ error }))
  // This response is an ordered driver barrier: search entered before observe.
  // The Native change ACK remains gated, independently of event-loop timing.
  await f.observe()
  const completed = await obsolete
  assert.equal(completed.error?.name, "SidecarRequestError")
  assert.match(completed.error.message, /input changed|superseded/)
  assert.equal(fs.existsSync(path.join(path.dirname(f.audit), "release-start")), false)
  let requests = readAudit(f.audit)
  assert.equal(requests.filter(x => x.method === "search").length, 0)
  assert.equal(requests.filter(x => x.method === "index/cancel" || x.method === "maintenance/cancel").length, 0)
  assert.equal(requests.filter(x => x.method === "maintenance/changes").length, 1)
  f.releaseStart()
  await f.observed("maintenance/changes", 2)
  const recovered = await f.catalog("latest")
  assert.equal(recovered.at(-1).phase, "ready")
  assert.equal((await f.status()).state, "ready")
  requests = readAudit(f.audit)
  assert.equal(requests.filter(x => x.method === "initialize").length, 1)
})

for (const event of ["superseded", "aborted"]) test(`full admission ${event} settles without owning a held change ACK`, async t => {
  const f = setup(t, "hold-change-ack")
  await f.open()
  await f.catalog("cold")
  await f.observe()
  await f.observed("maintenance/changes")
  const pending = f.driver.call("catalog", { workspace: f.workspace, requestKey: "waiting" }, 1000)
  if (event === "superseded") await f.observe()
  else await f.driver.call("abort", { requestKey: "waiting" })
  const reports = await pending
  assert.equal(reports.at(-1).phase, "cancelled")
  const beforeRelease = readAudit(f.audit)
  assert.equal(beforeRelease.filter(x => x.method === "maintenance/start").length, 1)
  assert.equal(beforeRelease.filter(x => x.method === "maintenance/cancel").length, 0)
  assert.equal(fs.existsSync(path.join(path.dirname(f.audit), "release-start")), false)
  f.releaseStart()
  const recovered = await f.catalog("latest")
  assert.equal(recovered.at(-1).phase, "ready")
  assert.equal(readAudit(f.audit).filter(x => x.method === "initialize").length, 1)
})


test("SQL validation metadata survives the public adapter without becoming qualification", async t => {
  const f = setup(t, "validation-valid")
  await f.open()
  const reports = await f.catalog("one")
  assert.deepEqual(reports.find(r => r.validation)?.validation,
    { stage: "QuickCheck", vmSteps: 1000, activitySequence: 1, stageElapsedMs: 4 })
  assert.equal(reports.at(-1).phase, "ready")
})

for (const scenario of ["validation-stage", "validation-steps", "validation-activity", "validation-elapsed"]) {
  test(`malformed SQL validation metadata retires the session (${scenario})`, async t => {
    const f = setup(t, scenario)
    await f.open()
    await assert.rejects(f.catalog("one"), { name: "SidecarProtocolError" })
    assert.equal((await f.status()).state, "degraded")
  })
}
