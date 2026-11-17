import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"

test("a half-open recovery notifies consumers only after its explicit semantic proof succeeds", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-recovery-events-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const output = path.join(directory, "recovery.cjs")
  buildSync({ entryPoints: ["src/semantic/semantic-worker-failure-recovery.ts"],
    outfile: output, bundle: true, platform: "node", format: "cjs" })
  const { SemanticWorkerFailureRecovery } = createRequire(import.meta.url)(output)
  const calls = []
  const recovery = new SemanticWorkerFailureRecovery({
    recycle: { active: false, recover: async () => { calls.push("replay") }, retire: async () => 0 },
    mutations: { retire() {} }, disposed: () => false, options: () => ({}),
  })
  const unsubscribe = recovery.onDidRecover(() => calls.push("available"))
  recovery.fail(new Error("open circuit"))
  recovery.inputChanged()
  await recovery.admit(true)
  assert.deepEqual(calls, ["replay"], "background consumers must not steal the explicit half-open probe")
  assert.throws(() => recovery.assertHealthy(false))
  recovery.healthy()
  assert.deepEqual(calls, ["replay", "available"])
  recovery.healthy()
  assert.deepEqual(calls, ["replay", "available"], "ordinary successful operations do not refresh diagnostics")
  unsubscribe()
  recovery.fail(new Error("another circuit"))
  recovery.inputChanged()
  await recovery.admit(true)
  recovery.healthy()
  assert.deepEqual(calls, ["replay", "available", "replay"])
  await recovery.settle()
})
