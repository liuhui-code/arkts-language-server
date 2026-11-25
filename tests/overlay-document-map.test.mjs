import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-overlay-map-"))
const bundle = path.join(directory, "map.cjs")
buildSync({ entryPoints: ["src/core/workspace/overlay-document-map.ts"], bundle: true,
  platform: "node", target: "node20", format: "cjs", outfile: bundle })
const { OverlayDocumentMap, changedOverlayPaths } = createRequire(import.meta.url)(bundle)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))
const file = path.resolve("source", "File.ts"), disk = content => ({ overlay: false, content })
const overlay = (content, documentVersion = 1) => ({ overlay: true, content, documentVersion })

test("disk cache writes and eviction cannot masquerade as live text changes", () => {
  const records = new OverlayDocumentMap(), proof = records.overlayState()
  records.set(file, disk("old")); records.set(file, disk("new")); records.delete(file); records.clear()
  assert.equal(proof.current(), true)
  assert.equal(records.overlayFor(file), undefined)
})

test("open edit close and same-number reopen monotonically revoke original overlay receipts", () => {
  const records = new OverlayDocumentMap(), empty = records.overlayState()
  records.set(file, overlay("first"))
  assert.equal(empty.current(), false)
  const opened = records.overlayState()
  assert.deepEqual(records.overlayFor(file), { content: "first", documentVersion: 1 })
  records.set(file, overlay("edit", 2)); assert.equal(opened.current(), false)
  const edited = records.overlayState()
  records.delete(file); assert.equal(edited.current(), false)
  const closed = records.overlayState()
  records.set(file, overlay("first")); assert.equal(closed.current(), false)
  assert.equal(opened.current(), false, "reopen cannot resurrect an old receipt")
  assert.equal(empty.current(), false)
})

test("rollback replacement, disk authority replacement and disposal revoke retained receipts", () => {
  const records = new OverlayDocumentMap(), original = overlay("first")
  records.set(file, original)
  let proof = records.overlayState()
  records.set(file, overlay("draft", 2)); records.set(file, original)
  assert.equal(proof.current(), false, "rollback does not resurrect the earlier lifecycle")
  proof = records.overlayState(); records.set(file, disk("first"))
  assert.equal(proof.current(), false)
  assert.equal(records.overlayFor(file), undefined)
  records.set(file, overlay("first")); proof = records.overlayState()
  records.clear(); assert.equal(proof.current(), false)
  assert.equal(records.size, 0)
})


test("genuine overlay observations report every edit and removal without disk-cache noise", () => {
  const records = new OverlayDocumentMap(), other = path.resolve("source", "Other.ts")
  const empty = records.overlayState()
  assert.equal(records.overlayState(), empty, "unchanged reads allocate no new metadata snapshot")
  records.set(file, overlay("first")); const opened = records.overlayState()
  assert.deepEqual(changedOverlayPaths(empty, opened), [file])
  records.set(file, overlay("edited", 2)); records.set(other, overlay("second"))
  const edited = records.overlayState()
  assert.deepEqual([...changedOverlayPaths(opened, edited)].sort(), [file, other].sort())
  records.set(path.resolve("source", "Cached.ts"), disk("unrelated"))
  assert.equal(records.overlayState(), edited)
  assert.deepEqual(changedOverlayPaths(edited, records.overlayState()), [])
  records.delete(file)
  assert.deepEqual(changedOverlayPaths(edited, records.overlayState()), [file])
})

test("different producers, clones and already-stale current observations cannot lend a delta", () => {
  const records = new OverlayDocumentMap(), other = new OverlayDocumentMap()
  const previous = records.overlayState(); records.set(file, overlay("first"))
  const current = records.overlayState()
  assert.equal(changedOverlayPaths(other.overlayState(), current), undefined)
  assert.equal(changedOverlayPaths({ ...previous }, current), undefined)
  assert.equal(changedOverlayPaths(previous, Object.freeze({ ...current })), undefined)
  records.set(file, overlay("next", 2))
  assert.equal(changedOverlayPaths(previous, current), undefined)
  assert.deepEqual(changedOverlayPaths(previous, records.overlayState()), [file])
})

test("rollback and clear keep old epochs revoked even when the net overlay set is equal", () => {
  const records = new OverlayDocumentMap(), empty = records.overlayState(), first = overlay("original")
  records.set(file, first); const opened = records.overlayState()
  records.set(file, overlay("draft", 2)); records.set(file, first)
  assert.equal(opened.current(), false)
  assert.deepEqual(changedOverlayPaths(opened, records.overlayState()), [file])
  records.clear(); const closed = records.overlayState()
  assert.deepEqual(changedOverlayPaths(opened, closed), [file])
  assert.deepEqual(changedOverlayPaths(empty, closed), [], "net equality is dispatch metadata, not old proof validity")
  assert.equal(empty.current(), false)
  assert.equal(opened.current(), false)
  assert.equal(closed.current(), true)
})
