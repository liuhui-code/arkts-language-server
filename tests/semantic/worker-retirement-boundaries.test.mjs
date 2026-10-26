import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { auditFixture, until, rows, workerLifetime, exactDefinition } from "../support/worker-recovery-audit.mjs"

test("failed physical stop retries are budgeted and shutdown still owns the handle", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "retirement-retry-budget")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("audit-controls.json", { terminate: { mode: "before", remaining: 10 } })
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1 })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// stalled\n" + f.sources["Main.ets"] })
  await until(() => rows(f).some(r => r.event === "terminate-fault"), "first failed stop")
  for (let version = 3; version <= 4; version++) {
    assert.equal((await f.readiness()).error?.code, -32803, "same input cannot retry a failed stop")
    f.session.changeDocument({ uri: f.uri("Main.ets"), version, text: "// input " + version + "\n" + f.sources["Main.ets"] })
    assert.equal((await f.readiness()).error?.code, -32803)
    assert.equal(rows(f).filter(r => r.event === "terminate-fault").length, version - 1)
  }
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 5, text: "// blocked by rate limit\n" + f.sources["Main.ets"] })
  assert.equal((await f.readiness()).error?.code, -32803)
  assert.equal(rows(f).filter(r => r.event === "terminate-fault").length, 3, "no unbudgeted retry in recovery catch")
  assert.equal(rows(f).filter(r => r.event === "created").length, 1)
  f.write("audit-controls.json", {})
  const closed = await f.session.close({ timeoutMs: 5000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.equal(workerLifetime(f).active, 0, "shutdown must still reach the old physical handle")
  assert.equal(workerLifetime(f).peak, 1)
})

test("late physical exit settles the old handle without replenishing admission", { timeout: 20000 }, async t => {
  const f = await auditFixture(t, "retirement-late-exit")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("audit-controls.json", { terminate: { mode: "before", remaining: 1 } })
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1 })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// stalled\n" + f.sources["Main.ets"] })
  await until(() => rows(f).some(r => r.event === "terminate-fault"), "failed stop")
  assert.equal((await f.readiness()).error?.code, -32803)
  f.write("audit-late-exit", {})
  await until(() => rows(f).some(r => r.event === "exited"), "controlled late physical exit")
  assert.equal((await f.readiness()).error?.code, -32803, "exit alone cannot admit unchanged input")
  assert.equal(rows(f).filter(r => r.event === "created").length, 1)
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: "// repaired\n" + f.sources["Main.ets"] })
  assert.deepEqual((await f.definition()).result, exactDefinition(f, "neverQueried", 0))
  assert.equal(workerLifetime(f).peak, 1)
})

test("closing while termination is pending shares retirement and cannot start a replacement", { timeout: 20000 }, async t => {
  const f = await auditFixture(t, "retirement-pending-close")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("audit-controls.json", { terminate: { mode: "delay", remaining: 1 } })
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1 })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + f.sources["Main.ets"] })
  await until(() => rows(f).some(r => r.event === "terminate-fault"), "pending terminate")
  let closed = false
  const closing = f.session.close({ timeoutMs: 5000 }).then(value => { closed = true; return value })
  await until(() => fs.readFileSync(path.join(f.output, "wire.jsonl"), "utf8").includes('"method":"shutdown"'), "shutdown was sent")
  assert.equal(closed, false)
  assert.equal(rows(f).filter(r => r.event === "created").length, 1)
  fs.writeFileSync(path.join(f.directory, "audit-terminate-release"), "released")
  assert.deepEqual((await closing).exit, { code: 0, signal: null })
  assert.equal(rows(f).filter(r => r.event === "terminate-fault").length, 1)
  assert.equal(rows(f).filter(r => r.event === "created").length, 1)
  assert.equal(workerLifetime(f).active, 0)
})
