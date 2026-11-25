import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { membershipValidationFixture as fixture } from "./support/membership-validation-fixture.mjs"
const control = { checkpoint() {} }

test("a pinned regular read returns descriptor mode alongside the original physical identity", t => {
  const { api, source, token } = fixture(t), physical = fs.realpathSync.native(source)
  const read = api.readDiskSource(source, Infinity, control, physical, token)
  assert.equal(read.status, "loaded")
  assert.equal(read.mode, fs.statSync(source).mode)
  assert.deepEqual(read.identity, api.diskIdentity(source))
  assert.equal(read.content, fs.readFileSync(source, "utf8"))
})

test("the admitted snapshot preserves actual mode instead of reconstructing it from an admission token", t => {
  const { api, source, token } = fixture(t), lexicalRoot = path.dirname(source)
  const read = api.readAdmittedProjectSourceSnapshot({ filePath: source,
    canonicalRootId: fs.realpathSync.native(lexicalRoot), token, operationControl: control,
    nativeCatalog: { scanRoot: lexicalRoot, status: "complete" } })
  assert.ok(read)
  assert.equal(read.mode, fs.statSync(source).mode)
  assert.deepEqual(read.identity, api.diskIdentity(source))
  assert.equal(token.split(":").length, 5, "the legacy admission token remains distinct from the six-field source provenance")
})

test("an unpinned legacy read does not invent qualified source provenance", t => {
  const { api, source } = fixture(t)
  const read = api.readDiskSource(source, Infinity, control)
  assert.equal(read.status, "loaded")
  assert.equal(read.identity, undefined)
  assert.equal(read.mode, undefined)
})

// Characterize existing lexical/physical ownership before extracting pure derivation.
test("source boundary classification preserves physical ownership, SDK overlap, escapes and missing overlays", t => {
  const { api, source } = fixture(t), root = path.dirname(source)
  const workspace = path.join(root, "workspace"), sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace); fs.mkdirSync(sdk)
  const member = path.join(workspace, "Member.ts"), library = path.join(sdk, "Library.ts")
  fs.writeFileSync(member, "export {}\n"); fs.writeFileSync(library, "export {}\n")
  const boundary = { rootPath: workspace, workspacePhysicalRoot: fs.realpathSync.native(workspace), sdkRoot: sdk, sdkPhysicalRoot: fs.realpathSync.native(sdk) }
  assert.equal(api.relativeModuleBoundary(member, true, boundary), workspace)
  assert.equal(api.relativeModuleBoundary(library, false, boundary), sdk)
  const missing = path.join(workspace, "new", "Overlay.ts")
  assert.equal(api.relativeModuleBoundary(missing, true, boundary), workspace)
  assert.equal(api.relativeModuleBoundary(missing, false, boundary), undefined)
  const escape = path.join(workspace, "Escape.ts")
  fs.symlinkSync(library, escape)
  assert.equal(api.relativeModuleBoundary(escape, true, boundary), undefined)
  const alias = path.join(root, "Alias.ts")
  fs.symlinkSync(member, alias)
  assert.equal(api.relativeModuleBoundary(alias, false, boundary), workspace)
  const nested = { ...boundary, rootPath: sdk, workspacePhysicalRoot: fs.realpathSync.native(sdk), sdkRoot: root, sdkPhysicalRoot: fs.realpathSync.native(root) }
  assert.equal(api.relativeModuleBoundary(library, false, nested), sdk, "narrower workspace wins")
  const invalid = { ...boundary, sdkComponents: [{ root: sdk, physicalRoot: fs.realpathSync.native(sdk), issue: "invalid" }] }
  assert.equal(api.relativeModuleBoundary(library, false, invalid), undefined)
  assert.equal(api.relativeModuleBoundary(source, false, boundary), undefined)
  for (const [file, script, environment] of [[member, true, boundary], [library, false, boundary],
    [missing, true, boundary], [escape, true, boundary], [alias, false, boundary],
    [library, false, nested], [library, false, invalid], [source, false, boundary]]) {
    const physical = script ? api.prospectiveRealPathSync(file) : fs.realpathSync.native(file)
    assert.equal(api.relativeModuleBoundaryFromPhysical(file, physical, environment),
      api.relativeModuleBoundary(file, script, environment))
  }
  // Changing the current namespace cannot rewrite a previously supplied physical origin.
  const admitted = fs.realpathSync.native(member)
  fs.unlinkSync(alias); fs.symlinkSync(library, alias)
  assert.equal(api.relativeModuleBoundaryFromPhysical(alias, admitted, boundary), workspace)
  assert.equal(api.relativeModuleBoundary(alias, false, boundary), sdk)
})

test("retained source origins keep the actual full identity and reject unknown producers", t => {
  const { api, source, token } = fixture(t), root = path.dirname(source), physicalRoot = fs.realpathSync.native(root)
  const snapshot = api.readAdmittedProjectSourceSnapshot({ filePath: source, canonicalRootId: physicalRoot, token,
    operationControl: control, nativeCatalog: { scanRoot: root, status: "complete" } })
  const origin = api.SourceReadOrigin.fromSnapshot(source, root, physicalRoot, snapshot)
  assert.ok(origin); assert.ok(Object.isFrozen(origin))
  const witness = new api.LoadedConfigurationWitness()
  witness.retainSourceRead(origin)
  assert.equal(witness.freshness(control.checkpoint)?.(), true)
  for (const changed of [null, { ...snapshot, mode: undefined }, { ...snapshot, mode: 0 },
    { ...snapshot, identity: { ...snapshot.identity, stamp: "[]" } },
    { ...snapshot, identity: { ...snapshot.identity, physicalPath: source + ".other" } }]) {
    assert.equal(api.SourceReadOrigin.fromSnapshot(source, root, physicalRoot, changed), undefined)
  }
  assert.equal(api.SourceReadOrigin.fromSnapshot(source, root, path.join(physicalRoot, "other"), snapshot), undefined)
  fs.chmodSync(source, fs.statSync(source).mode ^ 0o100)
  assert.equal(witness.freshness(control.checkpoint), undefined, "same bytes cannot refresh an old mode fact")
})

test("a stale original read is retained as stale rather than restamped from the live namespace", t => {
  const { api, source, token } = fixture(t), root = path.dirname(source), physicalRoot = fs.realpathSync.native(root)
  const snapshot = api.readAdmittedProjectSourceSnapshot({ filePath: source, canonicalRootId: physicalRoot, token,
    operationControl: control, nativeCatalog: { scanRoot: root, status: "complete" } })
  fs.renameSync(source, source + ".old"); fs.writeFileSync(source, snapshot.content)
  const origin = api.SourceReadOrigin.fromSnapshot(source, root, physicalRoot, snapshot)
  assert.ok(origin, "pure provenance reconstruction does not observe a new file")
  const witness = new api.LoadedConfigurationWitness(); witness.retainSourceRead(origin)
  assert.equal(witness.freshness(control.checkpoint), undefined)
})
