import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildDocumentStoreDriver } from "./support/build-document-store-driver.mjs"

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-membership-alias-"))
  const physical = path.join(directory, "physical"), replacement = path.join(directory, "replacement")
  for (const root of [physical, replacement]) fs.mkdirSync(root)
  const original = "export class OriginalTarget {}\n", changed = "export class ReplacementTarget {}\n"
  fs.writeFileSync(path.join(physical, "Target.ets"), original)
  fs.writeFileSync(path.join(replacement, "Target.ets"), changed)
  const aliases = ["first", "second"].map(name => path.join(directory, name))
  for (const alias of aliases) fs.symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir")
  const { SemanticDocumentStore } = buildDocumentStoreDriver(directory)
  const store = new SemanticDocumentStore()
  t.after(() => { store.dispose(); fs.rmSync(directory, { recursive: true, force: true }) })
  return { store, physical, replacement, aliases, original }
}

test("switching lexical aliases does not manufacture physical catalog changes or revoke tokens", t => {
  const { store, physical, aliases, original } = fixture(t)
  const first = store.membershipFor(aliases[0])
  assert.equal(first.status, "complete")
  const source = path.join(aliases[0], "Target.ets"), root = fs.realpathSync.native(physical)
  const token = store.tokenFor(root, first.revision, source)
  assert.ok(token)
  const second = store.refreshProjectMembership(aliases[1])
  assert.equal(second.changed, false, "same physical names and bytes cannot erase a valid delta history")
  assert.equal(second.catalogStamp.revision, first.revision)
  assert.equal(store.tokenFor(root, first.revision, source), token)
  assert.equal(store.read(root, first.revision, source, token), original)
})

test("a retargeted lexical scan origin cannot lend another physical projects source tokens", t => {
  const { store, physical, replacement, aliases, original } = fixture(t)
  assert.equal(store.membershipFor(aliases[0]).status, "complete")
  fs.unlinkSync(aliases[0])
  fs.symlinkSync(replacement, aliases[0], process.platform === "win32" ? "junction" : "dir")
  const current = store.refreshProjectMembership(aliases[1])
  const root = fs.realpathSync.native(physical), source = path.join(aliases[1], "Target.ets")
  assert.equal(current.catalogStamp.canonicalRootId, root)
  const token = store.tokenFor(root, current.catalogStamp.revision, source)
  assert.ok(token, "the intact alias must be rescanned when the original scan path changes physical identity")
  assert.equal(store.read(root, current.catalogStamp.revision, source, token), original)
})
