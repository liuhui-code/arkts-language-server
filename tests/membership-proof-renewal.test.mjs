import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { membershipValidationFixture as fixture } from "./support/membership-validation-fixture.mjs"

const control = { checkpoint() {} }
function admittedEdit(f, value = 2) {
  fs.writeFileSync(f.source, `export const value = ${value}\n`)
  f.catalog.diskIdentities.set(f.source, f.api.sourceStatIdentity(fs.lstatSync(f.source)))
  f.catalog.revision++
}

test("admitted disk generations have distinct member owners and never revive retired proof", t => {
  const f = fixture(t)
  admittedEdit(f)
  const next = f.proof.renew(f.catalog, [f.source], control)
  assert.ok(next)
  assert.notEqual(next, f.proof)
  assert.equal(f.proof.invalidated, true)
  assert.equal(f.proof.current(f.catalog, [], control), false)
  assert.equal(next.current(f.catalog, [], control), true)
  admittedEdit(f, 1)
  const undo = next.renew(f.catalog, [f.source], control)
  assert.ok(undo)
  assert.equal(next.current(f.catalog, [], control), false)
  assert.equal(f.proof.current(f.catalog, [], control), false)
  assert.equal(undo.current(f.catalog, [], control), true)
})

test("renewed owner keeps independent final raw check after same-size timestamp-restored edit", t => {
  const f = fixture(t)
  admittedEdit(f)
  const next = f.proof.renew(f.catalog, [f.source], control)
  assert.throws(() => f.api.withRequestInputValidation(() => {
    assert.equal(next.current(f.catalog, [], control), true)
    const before = fs.statSync(f.source)
    fs.writeFileSync(f.source, "export const value = 3\n")
    fs.utimesSync(f.source, before.atime, before.mtime)
    assert.equal(fs.statSync(f.source).size, before.size)
  }, () => { throw Error("renewed final fence rejected stale body") }), /renewed final fence rejected stale body/)
})

test("an already invalid proof cannot supply a replacement generation", t => {
  const f = fixture(t)
  fs.writeFileSync(f.source, "export const value = 2\n")
  assert.equal(f.proof.current(f.catalog, [], control), false)
  f.catalog.diskIdentities.set(f.source, f.api.sourceStatIdentity(fs.lstatSync(f.source)))
  assert.equal(f.proof.renew(f.catalog, [f.source], control), undefined)
})

test("partial, removed, unknown and unexplained member identities cannot be renewed", t => {
  const f = fixture(t)
  const other = path.join(path.dirname(f.source), "Other.ts")
  fs.writeFileSync(other, "export const other = 1\n")
  f.catalog.paths.push(other); f.catalog.paths.sort()
  f.catalog.diskIdentities.set(other, f.api.sourceStatIdentity(fs.lstatSync(other)))
  const directories = new f.api.WorkspaceNamespaceWitness(1024 * 1024)
  const root = path.dirname(f.source)
  directories.observe({ path: root, physicalPath: fs.realpathSync.native(root),
    identity: fs.lstatSync(root, { bigint: true }), root: false })
  const proof = f.api.captureCompleteMembershipProof(f.catalog, directories, () => true)
  assert.equal(proof.current(f.catalog, [], control), true)
  admittedEdit(f)
  assert.equal(proof.renew({ ...f.catalog, status: "partial" }, [f.source], control), undefined)
  assert.equal(proof.renew({ ...f.catalog, paths: [] }, [f.source], control), undefined)
  assert.equal(proof.renew(f.catalog, [path.join(path.dirname(other), "Unknown.ts")], control), undefined)
  const unexplained = { ...f.catalog, diskIdentities: new Map(f.catalog.diskIdentities) }
  unexplained.diskIdentities.set(other, "not-the-original-token")
  assert.equal(proof.renew(unexplained, [f.source], control), undefined)
  assert.equal(proof.invalidated, false, "failed metadata admission publishes no replacement")
})

test("renewal retains original namespace and configuration witnesses", t => {
  let valid = true
  const f = fixture(t, () => valid)
  admittedEdit(f)
  const next = f.proof.renew(f.catalog, [f.source], control)
  valid = false
  assert.equal(next.current(f.catalog, [], control), false)
  const g = fixture(t)
  admittedEdit(g)
  const other = g.proof.renew(g.catalog, [g.source], control)
  fs.writeFileSync(path.join(path.dirname(g.source), "UnnotifiedGlobal.ts"), "class Hidden {}\n")
  assert.equal(other.current(g.catalog, [], control), false, "changed directory cannot borrow an old member namespace")
})

test("metadata renewal cancellation cannot publish a half-built owner", t => {
  const f = fixture(t)
  admittedEdit(f)
  assert.throws(() => f.proof.renew(f.catalog, [f.source], {
    checkpoint() { throw Error("cancel metadata validation") },
  }), /cancel metadata validation/)
  assert.equal(f.proof.invalidated, false)
  assert.equal(f.proof.current(f.catalog, [], control), false, "old token still rejects the actual changed file")
})

test("a late weak-catalog proof rejection cannot revoke an admitted newer generation", t => {
  const f = fixture(t), root = path.dirname(f.source)
  const entries = new Map([[fs.realpathSync.native(root), f.catalog]])
  const scan = () => ({ ...f.catalog, paths: [...f.catalog.paths],
    diskIdentities: new Map([[f.source, f.api.sourceStatIdentity(fs.lstatSync(f.source))]]) })
  const capture = () => f.api.validateCachedMembershipBeforeCapture(root, entries, () => [], control,
    () => assert.fail("an admitted newer generation does not need recovery"), scan)
  const before = capture()
  admittedEdit(f)
  const after = capture()
  assert.equal(after.current(), true)
  assert.equal(before.current(), false, "old revision remains stale")
  assert.equal(after.current(), true, "late rejection must not poison the newer revision")
})

function weakCatalog(f) {
  const root = path.dirname(f.source), key = fs.realpathSync.native(root)
  const entries = new Map([[key, f.catalog]])
  let scans = 0
  const scan = () => { scans++; return { ...f.catalog, paths: [...f.catalog.paths],
    diskIdentities: new Map([[f.source, f.api.sourceStatIdentity(fs.lstatSync(f.source))]]) } }
  const capture = () => f.api.validateCachedMembershipBeforeCapture(root, entries, () => [], control,
    () => entries.set(key, { ...scan(), revision: entries.get(key).revision + 1 }), scan)
  return { capture, scans: () => scans }
}

test("weak metadata reuse never skips raw current scans or independent final enumeration", t => {
  const f = fixture(t), weak = weakCatalog(f)
  for (let round = 0; round < 2; round++) {
    const proof = weak.capture(), before = weak.scans()
    f.api.withRequestInputValidation(() => {
      assert.equal(proof.current(), true); assert.equal(proof.current(), true)
      assert.equal(weak.scans(), before + 1, "only same-query observation is shared")
    }, () => { throw Error("unexpected weak final failure") })
    assert.equal(weak.scans(), before + 2, "final raw scan is independent")
  }
})

test("weak original facts reject a timestamp-restored final edit and recover without reviving old proof", t => {
  const f = fixture(t), weak = weakCatalog(f), proof = weak.capture()
  assert.throws(() => f.api.withRequestInputValidation(() => {
    assert.equal(proof.current(), true)
    const before = fs.statSync(f.source)
    fs.writeFileSync(f.source, "export const value = 2\n")
    fs.utimesSync(f.source, before.atime, before.mtime)
    assert.equal(fs.statSync(f.source).size, before.size)
  }, () => { throw Error("weak final changed") }), /weak final changed/)
  const fresh = weak.capture()
  assert.equal(fresh.current(), true)
  assert.equal(proof.current(), false)
  assert.equal(fresh.current(), true, "old original proof cannot poison successful recovery")
})

test("weak catalog facts cannot be silently recaptured under an unchanged admitted revision", t => {
  const f = fixture(t), weak = weakCatalog(f)
  weak.capture()
  fs.writeFileSync(f.source, "export const value = 2\n")
  f.catalog.diskIdentities.set(f.source, f.api.sourceStatIdentity(fs.lstatSync(f.source)))
  assert.throws(() => weak.capture(), /current workspace inputs/)
})
