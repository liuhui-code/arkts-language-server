import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { auditFixture, until } from "../support/worker-recovery-audit.mjs"

test("SDK configuration received during replay controls the exact definition target", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "sdk-during-replay")
  const main = "export const result = selectedSDK()\n"
  const declaration = "declare function selectedSDK(): number\n"
  fs.writeFileSync(path.join(f.workspace, "Main.ets"), main)
  fs.writeFileSync(path.join(f.sdk, "ets/component/common.d.ts"), declaration)
  const sdkB = path.join(f.directory, "sdk-b")
  fs.cpSync(f.sdk, sdkB, { recursive: true })
  const declarationB = path.join(sdkB, "ets/component/common.d.ts")
  fs.writeFileSync(declarationB, "// alternate SDK\n" + declaration)
  await f.initialize()
  f.report.observations.baseline = await f.readiness()
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: main })
  await f.readiness()
  f.write("unresponsive-fault.json", { stage: "mutation", remaining: 1, then: "startup" })
  f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2, text: "// trigger\n" + main })
  await until(() => {
    try { return f.read("unresponsive-entered.json").stage === "startup" } catch { return false }
  }, "replacement startup with original SDK")
  f.configure(sdkB)
  await f.barrier()
  f.release()
  const definition = await f.definition("Main.ets", 1, main.indexOf("selectedSDK") + 2)
  f.report.observations.final = await f.readiness()
  const character = declaration.indexOf("selectedSDK")
  assert.deepEqual(definition.result, [{ uri: pathToFileURL(declarationB).href, range: {
    start: { line: 1, character }, end: { line: 1, character: character + "selectedSDK".length },
  } }], JSON.stringify(definition))
  assert.notEqual(f.report.observations.final.result?.inputIdentity?.sdkSha256,
    f.report.observations.baseline.result?.inputIdentity?.sdkSha256)
})

test("explicit readiness cannot publish READY for a superseded SDK configuration", { timeout: 25000 }, async t => {
  const f = await auditFixture(t, "sdk-during-preparation")
  await f.initialize()
  f.report.observations.baseline = await f.readiness()
  f.configure()
  await f.readiness(false)
  f.write("audit-controls.json", { gate: { stage: "checker", remaining: 1 } })
  const pending = f.readiness()
  await until(() => fs.existsSync(path.join(f.directory, "audit-gate-entered.json")), "compiler checker gate")
  f.configure(path.join(f.directory, "missing-explicit-sdk"))
  await f.barrier()
  f.release()
  f.report.observations.overlapping = await pending
  f.report.observations.afterConfiguration = await f.readiness()
  f.configure()
  f.report.observations.restored = await f.readiness()
  assert.notEqual(f.report.observations.afterConfiguration.result?.semanticState, "ready")
  assert.equal(f.report.observations.restored.result?.semanticState, "ready")
  assert.notEqual(f.report.observations.overlapping.result?.semanticState, "ready",
    "a readiness certificate whose SDK was superseded before publication cannot certify current inputs")
})
