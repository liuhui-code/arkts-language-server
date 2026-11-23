import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-facts-"))
const output = path.join(directory, "delta.cjs")
buildSync({ entryPoints: ["src/core/workspace/project-membership-fact-delta.ts"], bundle: true,
  platform: "node", target: "node20", format: "cjs", outfile: output })
const { noteKnownMembershipSources: note, publishMembershipFactSnapshot: publish,
  carryMembershipFactChanges: carry, changedMembershipFactSources: changed } = createRequire(import.meta.url)(output)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))
const a = path.join(directory, "A.ts"), b = path.join(directory, "B.ts")
const entry = () => ({ paths: [a, b], status: "complete", revision: 1,
  scanRoot: directory, diskIdentities: new Map([[a, "a1"], [b, "b1"]]) })
function capture(e) {
  const snapshot = Object.freeze({ paths: Object.freeze([...e.paths]), status: e.status, revision: e.revision++ })
  publish(e, snapshot); e.publicSnapshot = snapshot; return snapshot
}

test("coalesced producer changes bind exact snapshots and copy mutable path inputs", () => {
  const e = entry(), first = capture(e), files = [a]
  note(e, files); files.push(b)
  const second = capture(e)
  assert.deepEqual(changed(first, second), [a])
  note(e, [b]); const third = capture(e)
  assert.deepEqual(changed(first, third), [a, b])
  assert.deepEqual(changed(second, third), [b])
  assert.equal(changed({ ...first }, third), undefined)
  assert.equal(changed(third, first), undefined)
})

test("an uncertain update cannot be repaired by a later known event before publication", () => {
  const e = entry(), first = capture(e)
  note(e, [a]); note(e, undefined); note(e, [b])
  const reset = capture(e)
  assert.equal(changed(first, reset), undefined)
  note(e, [b]); const recovered = capture(e)
  assert.deepEqual(changed(reset, recovered), [b])
})

test("a complete refresh carries watched plus newly observed changes without forking its owner", () => {
  const e = entry(), first = capture(e)
  note(e, [a])
  const refresh = entry(); carry(e, refresh, [b], true)
  const after = capture(refresh)
  assert.deepEqual(changed(first, after), [a, b])
  const oldFork = capture(e)
  assert.equal(changed(after, oldFork), undefined)
  const namesChanged = entry(); carry(refresh, namesChanged, [], false)
  assert.equal(changed(after, capture(namesChanged)), undefined)
  const foreign = entry(); foreign.scanRoot += "-other"; carry(refresh, foreign, [a], true)
  assert.equal(changed(after, capture(foreign)), undefined)
})

test("old history and oversized changes fall back instead of returning an incomplete delta", () => {
  const e = entry(), snapshots = [capture(e)]
  for (let i = 0; i < 33; i++) { note(e, [a]); snapshots.push(capture(e)) }
  assert.equal(changed(snapshots[0], snapshots.at(-1)), undefined)
  assert.deepEqual(changed(snapshots[1], snapshots.at(-1)), [a])
  const before = snapshots.at(-1)
  note(e, Array.from({ length: 513 }, (_, i) => path.join(directory, `Large${i}.ts`)))
  assert.equal(changed(before, capture(e)), undefined)
})
