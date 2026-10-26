import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { auditFixture, until, rows, workerLifetime, exactDefinition } from "../support/worker-recovery-audit.mjs"

test("cleanup fault, duplicate fault and late old-Worker signal own one recovery", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-fault-dedup", { loader: "registry-release-audit.cjs" })
  fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
  f.write("build-fault.json", { stage: "snapshot", remaining: 1 })
  f.write("audit-release.json", { mode: "after", remaining: 1 })
  f.write("audit-controls.json", { duplicateFault: true })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10000)
  assert.equal((await f.readiness()).result?.semanticState, "ready")
  await until(() => rows(f).filter(r => r.event === "fault-copy").length === 2, "two fault copies including retired instance")
  assert.deepEqual((await f.definition("Main.ets", 1)).result, exactDefinition(f, "neverQueried", 0))
  assert.equal(rows(f).filter(r => r.event === "created").length, 2)
  assert.equal(f.events().filter(r => r.event === "semantic.worker.recovery.complete").length, 1)
  assert.equal(workerLifetime(f).peak, 1)
})

test("cleanup quarantine consumes the shared bounded recovery budget", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-shared-budget", { loader: "registry-release-audit.cjs" })
  fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
  f.write("build-fault.json", { stage: "snapshot", remaining: 4 })
  f.write("audit-release.json", { mode: "before", remaining: 4 })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10000)
  for (let i = 1; i <= 3; i++) {
    await until(() => f.events().filter(e => e.event === "semantic.worker.recovery.complete").length === i, "recovery " + i)
    assert.equal((await f.readiness()).error?.code, -32803)
  }
  await until(() => f.events().some(e => e.event === "semantic.worker.recovery.stopped"), "shared circuit open")
  assert.equal(f.read("audit-release.json").remaining, 0)
  f.configure()
  assert.equal((await f.readiness()).error?.code, -32803, "identical configuration cannot bypass the circuit")
  assert.equal(rows(f).filter(r => r.event === "created").length, 4)
  f.write("unresponsive-fault.json", { remaining: 0, clockOffset: 200000 })
  assert.equal((await f.readiness()).error?.code, -32803, "time alone cannot repair quarantined input")
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: "// fixed input\n" + f.sources["Main.ets"] })
  assert.equal((await f.readiness()).result?.semanticState, "ready")
  assert.deepEqual((await f.definition()).result, exactDefinition(f, "neverQueried", 0))
  assert.equal(rows(f).filter(r => r.event === "created").length, 5)
  assert.equal(workerLifetime(f).peak, 1)
})

test("cleanup uncertainty during shutdown still completes graceful shutdown once", { timeout: 15000 }, async t => {
  const f = await auditFixture(t, "cleanup-during-shutdown", { loader: "registry-release-audit.cjs" })
  await f.initialize()
  f.write("audit-release.json", { mode: "after", remaining: 1 })
  const closed = await f.session.close({ timeoutMs: 5000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.equal(f.read("audit-release.json").remaining, 0)
  assert.equal(rows(f).filter(r => r.event === "receive" && r.message.workerEvent === "shutdownComplete").length, 1)
  assert.equal(rows(f).filter(r => r.event === "created").length, 1, "closing never initiates a replacement")
  assert.equal(workerLifetime(f).active, 0)
})

test("uncertain cleanup quarantines a Registry shared with a healthy semantic group", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-shared-owner", { loader: "registry-release-audit.cjs" })
  const modules = ["Alpha", "Beta"]
  fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] }, modules: modules.map(name => ({ name, srcPath: "./" + name,
      targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
  for (const name of modules) {
    const directory = path.join(f.workspace, name)
    fs.mkdirSync(path.join(directory, "src/main/ets"), { recursive: true })
    fs.writeFileSync(path.join(directory, "build-profile.json5"), "{targets:[{name:'default'}]}")
    fs.writeFileSync(path.join(directory, "oh-package.json5"), JSON.stringify({ name,
      main: "./src/main/ets/A.ets", dependencies: {} }))
    fs.writeFileSync(path.join(directory, "src/main/ets/A.ets"), "export function chosen() { return 1 }\nexport const use = chosen()\n")
    if (name === "Beta") fs.writeFileSync(path.join(directory, "src/main/ets/Spare.ets"), "export const spare = 1\n")
  }
  f.write("build-fault.json", { stage: "snapshot", remaining: 1 })
  f.write("audit-release.json", { mode: "after", remaining: 1 })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10000)
  const fault = rows(f, "audit-release.ndjson")[0]
  assert.equal(fault.physical, fs.realpathSync(path.join(f.workspace, "Beta/src/main/ets/A.ets")))
  assert.ok(fault.projectBefore.some(row => row.physical === fs.realpathSync(path.join(f.workspace, "Alpha/src/main/ets/A.ets")) && row.refs === 1))
  assert.equal((await f.readiness()).result?.semanticState, "ready")
  for (const name of modules) {
    const response = await f.definition(name + "/src/main/ets/A.ets", 1, 20)
    assert.deepEqual(response.result, [{ uri: f.uri(name + "/src/main/ets/A.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 22 } } }])
  }
  f.configure(); await f.readiness(false)
  assert.equal(f.read("build-state.json").projectRefs, 0)
  assert.equal(rows(f).filter(r => r.event === "created").length, 2)
  assert.equal(workerLifetime(f).peak, 1)
})
