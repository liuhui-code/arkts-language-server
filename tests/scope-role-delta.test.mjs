import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-role-delta-"))
const output = path.join(directory, "delta.cjs")
buildSync({ entryPoints: ["src/core/types/scope-role-delta.ts"], bundle: true,
  platform: "node", target: "node20", format: "cjs", outfile: output })
const { createScopeRoleDelta, isScopeRoleDelta } = createRequire(import.meta.url)(output)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))
const a = path.join(directory, "A.ts"), b = path.join(directory, "B.ts")
const role = Object.freeze({ dependencies: "opaque-test-value-not-consumed-by-lineage-check" })

test("a completed fact delta binds exact producer snapshots and copies its source list", () => {
  const before = new Map([[a, role]]), after = new Map([[a, role]]), files = [a, a]
  const delta = createScopeRoleDelta(before, after, files)
  assert.ok(delta)
  files.push(b)
  assert.deepEqual(delta.files, [a])
  assert.ok(Object.isFrozen(delta)); assert.ok(Object.isFrozen(delta.files))
  assert.equal(isScopeRoleDelta(delta, before, after), true)
  assert.equal(isScopeRoleDelta(delta, new Map(before), after), false)
  assert.equal(isScopeRoleDelta(delta, before, new Map(after)), false)
})

test("lookalike legacy receipts and unknown source membership cannot authorize delta reuse", () => {
  const before = new Map([[a, role]]), after = new Map([[a, role]])
  assert.equal(isScopeRoleDelta({ before, after, files: [a] }, before, after), false)
  assert.equal(isScopeRoleDelta(undefined, before, after), false)
  assert.equal(createScopeRoleDelta(before, new Map([[a, role], [b, role]]), [a]), undefined)
  assert.equal(createScopeRoleDelta(before, new Map([[b, role]]), [a]), undefined)
  assert.equal(createScopeRoleDelta(before, after, [b]), undefined)
})

test("relative or removed paths retain full reconciliation and an empty known delta stays scoped", () => {
  const relative = new Map([["A.ts", role]])
  assert.equal(createScopeRoleDelta(relative, relative, ["A.ts"]), undefined)
  const before = new Map([[a, role]])
  assert.equal(createScopeRoleDelta(before, new Map(), [a]), undefined)
  const delta = createScopeRoleDelta(before, before, [])
  assert.ok(delta)
  assert.equal(isScopeRoleDelta(delta, before, before), true)
})
