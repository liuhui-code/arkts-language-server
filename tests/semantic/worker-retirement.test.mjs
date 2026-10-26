import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import path from "node:path"
import { auditFixture, until, rows, workerLifetime, exactDefinition } from "../support/worker-recovery-audit.mjs"

test("an unconfirmed termination failure cannot allow a parallel replacement", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "terminate-before-effect")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("audit-controls.json", { terminate: { mode: "before", remaining: 1 } })
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1 })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + f.sources["Main.ets"] })
  await until(() => rows(f).some(row => row.event === "terminate-fault"), "injected pre-effect termination failure")
  f.report.observations.blocked = await f.readiness(false)
  assert.ok(f.events().some(e => e.event === "semantic.worker.retirement.failed" && e.exitConfirmed === false),
    "an unconfirmed exit must be observable as retirement failure")
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: "// corrected input\n" + f.sources["Main.ets"] })
  const response = await f.definition()
  f.report.observations.afterNewInput = response
  assert.deepEqual(response.result, exactDefinition(f, "neverQueried", 0), JSON.stringify(response))
  f.report.observations.beforeCleanup = workerLifetime(f)
  assert.ok(workerLifetime(f).peak <= 1, "old Worker exit must be confirmed before allocating a replacement: "
    + JSON.stringify(workerLifetime(f)))
})

test("an error reported after confirmed Worker exit permits a bounded later probe", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "terminate-after-effect")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("audit-controls.json", { terminate: { mode: "after", remaining: 1 } })
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1 })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + f.sources["Main.ets"] })
  await until(() => rows(f).some(row => row.event === "terminate-fault"), "post-effect termination seam")
  f.report.observations.blocked = await f.readiness(false)
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: "// corrected input\n" + f.sources["Main.ets"] })
  const response = await f.definition()
  f.report.observations.beforeCleanup = workerLifetime(f)
  assert.deepEqual(response.result, exactDefinition(f, "neverQueried", 0), JSON.stringify(response))
  assert.equal(workerLifetime(f).peak, 1)
})

test("a caller can cancel while physical termination remains pending without starting another Worker", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "terminate-pending-cancellation")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("audit-controls.json", { terminate: { mode: "delay", remaining: 1 } })
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1 })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + f.sources["Main.ets"] })
  await until(() => rows(f).some(row => row.event === "terminate-fault"), "pending physical termination")
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: "// newest input\n" + f.sources["Main.ets"] })
  const id = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/definition", params: {
    textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 23 } } })
  await f.barrier()
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
  f.report.observations.cancelled = await f.session.transport.response(id, 2500)
  assert.equal(f.report.observations.cancelled.error?.code, -32800)
  f.report.observations.pending = workerLifetime(f)
  assert.equal(rows(f).filter(row => row.event === "created").length, 1)
  fs.writeFileSync(path.join(f.directory, "audit-terminate-release"), "released")
  assert.deepEqual((await f.definition()).result, exactDefinition(f, "neverQueried", 0))
  assert.equal(workerLifetime(f).peak, 1)
})
