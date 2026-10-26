import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { auditFixture, exactDefinition, until } from "../support/worker-recovery-audit.mjs"

const effects = process.env.ARKTS_AUDIT_RELEASE_EFFECT ? [process.env.ARKTS_AUDIT_RELEASE_EFFECT] : ["none", "before", "after"]
assert.ok(effects.every(effect => ["none", "before", "after"].includes(effect)))

for (const effect of effects) {
test("partial initialization settles ownership after a release exception: " + effect, { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-" + effect, { loader: "registry-release-audit.cjs" })
  fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
  f.write("build-fault.json", { stage: "snapshot", remaining: 1 })
  f.write("audit-release.json", { mode: effect, remaining: effect === "none" ? 0 : 1 })
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10000)
  f.report.observations.initial = f.read("build-state.json")
  if (effect !== "none") {
    assert.equal(f.read("audit-release.json").remaining, 0, "the exception seam must actually execute")
    assert.ok(fs.existsSync(path.join(f.directory, "audit-release.ndjson")))
  }
  const retries = []
  for (let i = 0; i < 3; i++) retries.push({ response: await f.readiness(), counters: f.read("build-state.json") })
  f.report.observations.retries = retries
  f.configure()
  await f.readiness(false)
  f.report.observations.retired = f.read("build-state.json")
  f.report.observations.rebuilt = await f.readiness()
  f.report.observations.rebuiltCounters = f.read("build-state.json")
  const definition = await f.definition("Main.ets", 1)
  f.configure()
  await f.readiness(false)
  f.report.observations.finalRetirement = f.read("build-state.json")
  assert.deepEqual(definition.result, exactDefinition(f, "neverQueried", 0))
  assert.equal(f.report.observations.finalRetirement.projectRefs, 0,
    "configuration retirement cannot abandon failed-owner project leases")
  assert.ok(retries.some(row => row.response.result?.semanticState === "ready"), "same-input recovery must remain possible")
})
}

test("client cancellation cannot hide a cleanup ownership failure from later recovery", { timeout: 30000 }, async t => {
  const f = await auditFixture(t, "cleanup-during-cancellation", {
    loader: "registry-release-audit.cjs", env: { ARKTS_SEMANTIC_CANCEL_GRACE_MS: "1000" },
  })
  fs.writeFileSync(path.join(f.workspace, "Spare.ets"), "export const spare = 1\n")
  await f.initialize()
  f.configure()
  await f.readiness(false)
  f.write("build-fault.json", { stage: "pause-failure", remaining: 1 })
  f.write("audit-release.json", { mode: "after", remaining: 1 })
  const id = f.session.nextRequestId
  const pending = f.readiness()
  await until(() => fs.existsSync(path.join(f.directory, "build-entered.json")), "partial build inside Host snapshot")
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
  const cancelled = await pending
  f.report.observations.cancelled = cancelled
  assert.equal(cancelled.error?.code, -32800)
  assert.equal(f.read("audit-release.json").remaining, 0, "cleanup exception must occur after the actual cancellation")
  f.report.observations.afterCancellation = f.read("build-state.json")
  const retries = []
  for (let i = 0; i < 3; i++) retries.push({ response: await f.readiness(), counters: f.read("build-state.json") })
  f.report.observations.retries = retries
  f.configure()
  await f.readiness(false)
  f.report.observations.rebuilt = await f.readiness()
  f.configure()
  await f.readiness(false)
  f.report.observations.finalRetirement = f.read("build-state.json")
  assert.equal(f.report.observations.finalRetirement.projectRefs, 0)
  assert.ok(retries.some(row => row.response.result?.semanticState === "ready"), "cancelled caller cannot suppress recovery ownership")
})
