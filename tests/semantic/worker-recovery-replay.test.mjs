import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { auditFixture, until, exactDefinition, rows } from "../support/worker-recovery-audit.mjs"

test("recovery preserves both documents changed after the replay snapshot", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "cross-document")
  const dependency = f.sources["Unopened.ets"] + "export function latestQueried(): number { return 2 }\n"
  fs.writeFileSync(path.join(f.workspace, "Unopened.ets"), dependency)
  await f.initialize()
  for (const [name, text] of [["Main.ets", f.sources["Main.ets"]], ["Unopened.ets", dependency]]) {
    f.session.openDocument({ uri: f.uri(name), version: 1, text })
  }
  assert.equal((await f.readiness()).result?.semanticState, "ready")
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// start recovery\n" + f.sources["Main.ets"] })
  await until(() => {
    try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
  }, "replacement startup after snapshot")
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3,
    text: "// latest semantic input\n" + f.sources["Main.ets"].replaceAll("neverQueried", "latestQueried") })
  f.session.changeDocument({ uri: f.uri("Unopened.ets"), version: 2, text: "// dependency edit\n" + dependency })
  await f.barrier()
  f.release()
  const result = await f.definition()
  f.report.observations.first = result
  f.report.observations.readiness = await f.readiness()
  f.report.observations.repeated = await f.definition()
  assert.deepEqual(result.result, exactDefinition(f, "latestQueried", 2), JSON.stringify(result))
  assert.deepEqual(f.report.observations.repeated.result, exactDefinition(f, "latestQueried", 2))
})

test("closing and reopening after the recovery snapshot preserves a reset document version", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "reopen-after-snapshot")
  fs.appendFileSync(path.join(f.workspace, "Unopened.ets"), "export function latestQueried(): number { return 2 }\n")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + f.sources["Main.ets"] })
  await until(() => {
    try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
  }, "replacement startup")
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: "// old opening\n" + f.sources["Main.ets"] })
  f.closeDocument("Main.ets")
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1,
    text: "// reopened\n" + f.sources["Main.ets"].replaceAll("neverQueried", "latestQueried") })
  await f.barrier()
  f.release()
  const result = await f.definition()
  f.report.observations.readiness = await f.readiness()
  assert.deepEqual(result.result, exactDefinition(f))
  assert.deepEqual((await f.definition()).result, exactDefinition(f))
})

test("closing and reopening before the recovery snapshot preserves a reset document version", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "reopen-before-snapshot")
  fs.appendFileSync(path.join(f.workspace, "Unopened.ets"), "export function latestQueried(): number { return 2 }\n")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + f.sources["Main.ets"] })
  await until(() => f.events().some(e => e.event === "semantic.worker.unresponsive"), "first retirement")
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: "// old opening\n" + f.sources["Main.ets"] })
  f.closeDocument("Main.ets")
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1,
    text: "// reopened\n" + f.sources["Main.ets"].replaceAll("neverQueried", "latestQueried") })
  await f.barrier()
  assert.equal(rows(f).filter(row => row.event === "created").length, 1, "edits must precede replacement allocation and snapshot")
  await until(() => {
    try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
  }, "replacement startup")
  f.release()
  const result = await f.definition()
  f.report.observations.readiness = await f.readiness()
  assert.deepEqual(result.result, exactDefinition(f), JSON.stringify(result))
  assert.deepEqual((await f.definition()).result, exactDefinition(f))
})

test("closing during replay restores disk authority instead of the retired unsaved text", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "close-to-disk")
  fs.appendFileSync(path.join(f.workspace, "Unopened.ets"), "export function latestQueried(): number { return 2 }\n")
  await f.initialize()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness()
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2,
    text: "// unsaved\n" + f.sources["Main.ets"].replaceAll("neverQueried", "latestQueried") })
  await until(() => {
    try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
  }, "replacement snapshot containing unsaved input")
  f.closeDocument("Main.ets")
  await f.barrier()
  f.release()
  assert.deepEqual((await f.definition("Main.ets", 1)).result, exactDefinition(f, "neverQueried", 0))
  assert.deepEqual((await f.definition("Main.ets", 1)).result, exactDefinition(f, "neverQueried", 0))
  f.report.observations.readiness = await f.readiness()
})

test("A B A recovery edits cannot publish a definition from the old dependency overlay", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "dependency-overlay-aba")
  await f.initialize()
  for (const name of ["Main.ets", "Unopened.ets"]) {
    f.session.openDocument({ uri: f.uri(name), version: 1, text: f.sources[name] })
  }
  await f.readiness()
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + f.sources["Main.ets"] })
  await until(() => {
    try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
  }, "snapshot before interleaved edits")
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: "// Main v3\n" + f.sources["Main.ets"] })
  f.session.changeDocument({ uri: f.uri("Unopened.ets"), version: 2, text: "// dependency v2\n" + f.sources["Unopened.ets"] })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 4, text: "// Main v4\n" + f.sources["Main.ets"] })
  await f.barrier()
  f.release()
  const first = await f.definition()
  f.report.observations.first = first
  f.report.observations.readiness = await f.readiness()
  f.report.observations.repeated = await f.definition()
  assert.deepEqual(first.result, exactDefinition(f, "neverQueried", 1), JSON.stringify(first))
  assert.deepEqual(f.report.observations.repeated.result, exactDefinition(f, "neverQueried", 1))
})
