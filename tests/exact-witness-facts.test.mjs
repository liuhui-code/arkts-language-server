import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "exact-witness-facts-"))
const output = path.join(directory, "driver.cjs")
buildSync({ entryPoints: [path.resolve("src/project/exact-witness-facts.ts")], bundle: true,
  platform: "node", target: "node20", format: "cjs", outfile: output })
const { ExactEvidenceBudget, ExactWitnessFacts, ExactWitnessPaths, witnessFactBytes,
  ExactWitnessCapsule, ExactEvidenceCapacityError, CAPSULE_HEADER_BYTES } = createRequire(import.meta.url)(output)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

test("exact evidence charges UTF-16 strings and admits the exact byte boundary", () => {
  const file = "/文件/😀.ets", identity = "original identity"
  const cost = witnessFactBytes(file, identity)
  assert.equal(cost, 256 + 2 * (file.length + identity.length))
  const budget = new ExactEvidenceBudget(cost), facts = new ExactWitnessFacts(budget)
  assert.equal(facts.add(file, identity, true, true), true)
  assert.equal(budget.bytes, cost)
  assert.equal(facts.add("other", identity, true, true), false)
  assert.equal(facts.size, 1)
  assert.equal(budget.bytes, cost)
  assert.equal(new ExactWitnessFacts(new ExactEvidenceBudget(cost - 1)).add(file, identity, true, true), false)
})

test("content and path facts share one budget without sharing semantic meaning", () => {
  const cost = witnessFactBytes("file", "identity"), budget = new ExactEvidenceBudget(2 * cost)
  const content = new ExactWitnessFacts(budget), paths = new ExactWitnessFacts(budget)
  assert.equal(content.add("file", "identity", true, true), true)
  assert.equal(paths.add("file", "identity", false, false), true)
  assert.equal(budget.bytes, 2 * cost)
  assert.equal(content.get("file").sourceNamespace, true)
  assert.equal(paths.get("file").sourceNamespace, false)
  content.configurationConsumed("file")
  assert.equal(content.get("file").sourceNamespace, false)
  assert.equal(content.get("file").regularSource, false)
  assert.equal(budget.bytes, 2 * cost)
  content.clear()
  assert.equal(budget.bytes, cost)
  paths.clear()
  assert.equal(budget.bytes, 0)
})

test("identity replacement reserves its delta before changing the old exact fact", () => {
  const cost = witnessFactBytes("file", "old"), budget = new ExactEvidenceBudget(cost + 2)
  const facts = new ExactWitnessFacts(budget)
  assert.equal(facts.add("file", "old", true, false), true)
  const snapshot = facts.snapshot()
  assert.equal(facts.replace("file", "longer", true), false)
  assert.deepEqual(facts.get("file"), { identity: "old", sourceNamespace: true, regularSource: false })
  assert.equal(budget.bytes, cost)
  assert.equal(facts.replace("file", "new!", true), true)
  assert.equal(budget.bytes, cost + 2)
  assert.equal(snapshot[0][1].identity, "old", "validation snapshots do not alias mutable fact values")
  assert.equal(facts.replace("file", "x", true), true)
  assert.equal(budget.bytes, witnessFactBytes("file", "x"))
  facts.delete("file")
  facts.delete("file")
  assert.equal(budget.bytes, 0)
})

test("failure paths cannot grow outside the shared budget or charge duplicates", () => {
  const cost = witnessFactBytes("file", "identity"), budget = new ExactEvidenceBudget(cost + 134)
  const facts = new ExactWitnessFacts(budget), failures = new ExactWitnessPaths(budget)
  assert.equal(facts.add("file", "identity", true, true), true)
  assert.equal(failures.add("bad"), true)
  assert.equal(failures.add("bad"), true)
  assert.equal(budget.bytes, cost + 134)
  assert.equal(failures.add("another"), false)
  assert.equal(failures.size, 1)
  failures.clear()
  assert.equal(budget.bytes, cost)
  facts.clear()
  assert.equal(budget.bytes, 0)
})

test("invalid bookkeeping requests never manufacture evidence capacity", () => {
  const budget = new ExactEvidenceBudget(1)
  for (const [previous, next] of [[-1, 0], [0, -1], [2, 0], [0, Infinity], [0, 0.5]]) {
    assert.equal(budget.resize(previous, next), false)
    assert.equal(budget.bytes, 0)
  }
})

test("empty capsules have positive cost and partial copies can never become valid capsules", () => {
  assert.ok(CAPSULE_HEADER_BYTES > 0)
  assert.throws(() => new ExactWitnessCapsule(CAPSULE_HEADER_BYTES - 1), ExactEvidenceCapacityError)
  const empty = new ExactWitnessCapsule(CAPSULE_HEADER_BYTES).finish()
  assert.equal(empty.accountedBytes, CAPSULE_HEADER_BYTES)
  assert.deepEqual(empty.facts, [])
  assert.ok(Object.isFrozen(empty) && Object.isFrozen(empty.facts))
  const cost = CAPSULE_HEADER_BYTES + witnessFactBytes("path", "identity")
  const builder = new ExactWitnessCapsule(cost)
  builder.append("path", "identity", false)
  assert.throws(() => builder.append("other", "identity", true), ExactEvidenceCapacityError)
  assert.throws(() => builder.finish(), ExactEvidenceCapacityError)
  const exact = new ExactWitnessCapsule(cost)
  exact.append("path", "identity", false)
  const captured = exact.finish()
  assert.equal(captured.accountedBytes, cost)
  assert.ok(Object.isFrozen(captured.facts[0]))
  assert.throws(() => exact.append("other", "identity", true), /immutable/)
})
