import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-source-plan-"))
const bundle = path.join(directory, "plan.cjs")
buildSync({ entryPoints: ["src/project/configuration-source-plan.ts"], bundle: true,
  platform: "node", target: "node20", format: "cjs", outfile: bundle })
const { configurationSourcePlan } = createRequire(import.meta.url)(bundle)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))
const file = path.resolve("source", "File.ts"), physical = path.resolve("physical", "File.ts")
const fields = [1, 2, 0o100644, 10, 123.25, 124.5]
const receipt = () => [file, [], physical, null, fields, fields]

test("a parsed receipt retains the exact original spelling and immutable numerical metadata", () => {
  const identity = JSON.stringify(receipt()), plan = configurationSourcePlan(identity)
  assert.equal(plan.identity, identity)
  assert.equal(plan.file, file)
  assert.equal(plan.physical, physical)
  assert.equal(plan.parent, path.dirname(file))
  assert.equal(plan.physicalParent, path.dirname(physical))
  assert.deepEqual(plan.stamp, fields)
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.stamp))
})

for (const [name, change] of [
  ["absent descendant", v => { v[1] = ["missing"] }],
  ["symbolic link", v => { v[3] = "elsewhere" }],
  ["weak inode", v => { v[4] = v[5] = [1, 0, ...fields.slice(2)] }],
  ["different observations", v => { v[5] = [...fields.slice(0, 5), 125] }],
  ["non-finite metadata", v => { v[4] = v[5] = [...fields.slice(0, 5), NaN] }],
  ["relative path", v => { v[0] = "File.ts" }],
  ["different physical spelling", v => { v[2] = path.join(path.dirname(physical), "FILE.ts") }],
]) test(`${name} cannot use the direct-source representation shortcut`, () => {
  const value = receipt()
  change(value)
  assert.equal(configurationSourcePlan(JSON.stringify(value)), undefined)
})
