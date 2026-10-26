import assert from "node:assert/strict"
import test from "node:test"
import { auditFixture, rows, exactDefinition } from "../support/worker-recovery-audit.mjs"

test("ordinary SDK preparation and definition initialize the compiler only inside Workers", { timeout: 20000 }, async t => {
  const f = await auditFixture(t, "parent-compiler-isolation", { loader: "compiler-load-audit.cjs" })
  await f.initialize()
  assert.deepEqual((await f.definition("Main.ets", 1)).result, exactDefinition(f, "neverQueried", 0))
  const loaded = rows(f, "compiler-load.ndjson")
  assert.ok(loaded.some(row => row.threadId > 0), "the real compiler seam must execute inside a Worker")
  assert.deepEqual(loaded.filter(row => row.threadId === 0), [], "the parent must not import the compiler")
})
