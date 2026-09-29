import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { createClassBindingInputFixture } from "./support/class-binding-input-fixture.mjs"

test("an independently captured parent input expires after a managed nested workspace edit", async t => {
  const fixture = await createClassBindingInputFixture(t)
  const { state, workspace, input } = fixture
  const snapshot = state.capture(workspace.rootUri, input.documents,
    input.projectConfiguration, input.sdkConfiguration)
  assert.equal(state.isCurrent(snapshot), true)
  const held = await fixture.holdStatus()
  state.changed(fixture.uri("nested"))
  await held.release()
  assert.equal(state.isCurrent(snapshot), false,
    "capturing a root must register its unchanged revision before a nested edit")
})

test("captures physical availability and owned caller inputs before a held discovery status", async t => {
  const fixture = await createClassBindingInputFixture(t)
  const { input, state, index } = fixture
  assert.equal(fs.existsSync(path.join(fixture.physicalRoot, "Base")), false,
    "the ordinary extensionless import must keep its missing index parent")
  const original = structuredClone({ workspace: input.workspace, query: input.query,
    document: input.documents[0], project: input.projectConfiguration, sdk: input.sdkConfiguration })
  const captured = state.captureClassBindingInput(input)
  const held = await fixture.holdStatus()
  input.query.documentUris.splice(1)
  input.query.classNamePosition.line = 99
  input.query.expectedGeneration = 8
  input.documents[0].text = "class Child {}"
  input.documents[0].version = 2
  input.documents.splice(0)
  input.projectConfiguration.targets.module = "desktop"
  input.sdkConfiguration.apiVersion = 23
  input.workspace.rootUri = "file:///elsewhere"
  await held.release()
  captured.assertCurrent()
  assert.deepEqual(await index.resolveClassBaseBinding(captured.workspace.id, captured.query), {
    servedGeneration: 7, completeness: "ready", binding: { kind: "unknown" },
  })
  captured.assertCurrent()
  const request = fixture.audit().find(entry => entry.method === "class-bindings/resolve")
  const physicalUri = pathToFileURL(fs.realpathSync.native(fixture.physicalRoot)).href
  const rebase = uri => uri.replace(original.workspace.rootUri, physicalUri)
  assert.deepEqual(request.params, {
    workspaceIdentity: physicalUri, expectedGeneration: 7,
    documentUris: original.query.documentUris.map(rebase), documentUri: rebase(original.query.documentUri),
    classNamePosition: original.query.classNamePosition,
    overlays: [{ uri: rebase(original.document.uri), text: original.document.text }],
    sourceAvailability: original.query.documentUris.map((uri, i) => ({ uri: rebase(uri),
      state: i < 2 ? "present" : i < 5 ? "absent" : "unknown" })),
  })
  assert.deepEqual(captured.inputs.projectConfiguration, original.project)
  assert.deepEqual(captured.inputs.sdkConfiguration, original.sdk)
  assert.equal(captured.inputs.rootUri, original.workspace.rootUri)
})

test("rejects an unwatched source modification before accepting captured availability", async t => {
  const fixture = await createClassBindingInputFixture(t)
  const captured = fixture.state.captureClassBindingInput(fixture.input)
  const held = await fixture.holdStatus()
  fs.writeFileSync(path.join(fixture.physicalRoot, "Base.ets"), "export class DifferentBase {}\n")
  await held.release()
  assert.equal(fixture.state.isCurrent(captured.inputs), true,
    "no managed source or configuration revision was advanced")
  assert.throws(captured.assertCurrent, error => error.code === "content-modified",
    "a matching index/managed generation cannot certify unwatched disk freshness")
  assert.equal(fixture.audit().some(entry => entry.method === "class-bindings/resolve"), false)
})

test("admits a canonical diskless overlay for the requested client-root alias", async t => {
  const fixture = await createClassBindingInputFixture(t)
  const physicalUri = pathToFileURL(path.join(fs.realpathSync.native(fixture.physicalRoot), "Base.ts")).href
  const document = { uri: physicalUri, workspaceId: fixture.workspace.id, version: 3,
    text: "export class UnsavedBase {}\n" }
  fixture.input.documents.push(document)
  const captured = fixture.state.captureClassBindingInput(fixture.input)
  const held = await fixture.holdStatus()
  await held.release()
  captured.assertCurrent()
  await fixture.index.resolveClassBaseBinding(captured.workspace.id, captured.query)
  captured.assertCurrent()
  const request = fixture.audit().find(entry => entry.method === "class-bindings/resolve")
  assert.deepEqual(request.params.sourceAvailability.find(entry => entry.uri === physicalUri),
    { uri: physicalUri, state: "present" }, "an authoritative diskless buffer is not absent")
  assert.deepEqual(request.params.overlays.find(entry => entry.uri === physicalUri),
    { uri: physicalUri, text: document.text })
})

test("does not silently exclude a foreign owner or competing physical overlay", async t => {
  const fixture = await createClassBindingInputFixture(t)
  const uri = pathToFileURL(path.join(fs.realpathSync.native(fixture.physicalRoot), "Base.ts")).href
  const document = { uri, workspaceId: "nested-owner", version: 1, text: "export class Base {}" }
  fixture.input.documents.push(document)
  assert.throws(() => fixture.state.captureClassBindingInput(fixture.input), RangeError)
  document.workspaceId = fixture.workspace.id
  fixture.input.documents.push({ ...document, uri: fixture.uri("Base.ts"), version: 2 })
  assert.throws(() => fixture.state.captureClassBindingInput(fixture.input), RangeError)
  assert.equal(fixture.audit().some(entry => entry.method === "class-bindings/resolve"), false)
})

for (const [name, mutate] of [
  ["creation of an absent competing source", fixture =>
    fs.writeFileSync(path.join(fixture.physicalRoot, "Base.ts"), "export class Base {}")],
  ["deletion of a captured present source", fixture =>
    fs.unlinkSync(path.join(fixture.physicalRoot, "Base.ets"))],
  ["client-root alias retargeting", fixture => {
    const replacement = path.join(fixture.root, "replacement")
    fs.mkdirSync(replacement)
    fs.unlinkSync(fixture.clientRoot)
    fs.symlinkSync(replacement, fixture.clientRoot, "dir")
  }],
]) test(`rejects unwatched ${name} after discovery IO`, async t => {
  const fixture = await createClassBindingInputFixture(t)
  const captured = fixture.state.captureClassBindingInput(fixture.input)
  captured.assertCurrent()
  await fixture.index.resolveClassBaseBinding(captured.workspace.id, captured.query)
  mutate(fixture)
  assert.equal(fixture.state.isCurrent(captured.inputs), true)
  assert.throws(captured.assertCurrent, error => error.code === "content-modified")
})

test("capture owns configuration copies and uses managed root/configuration fences", async t => {
  const fixture = await createClassBindingInputFixture(t)
  const captured = fixture.state.captureClassBindingInput(fixture.input)
  assert.throws(() => { captured.query.classNamePosition.line = 10 }, TypeError)
  assert.throws(() => { captured.query.overlays[0].text = "different" }, TypeError)
  assert.throws(() => { captured.inputs.sdkConfiguration.apiVersion = 23 }, TypeError)
  const unrelated = path.join(fixture.root, "unrelated")
  fs.mkdirSync(unrelated)
  fixture.state.changed(pathToFileURL(unrelated).href)
  captured.assertCurrent()
  fixture.state.configurationChanged()
  assert.throws(captured.assertCurrent, error => error.code === "content-modified")
  const recaptured = fixture.state.captureClassBindingInput(fixture.input)
  fixture.state.changed(fixture.uri("nested"))
  assert.throws(recaptured.assertCurrent, error => error.code === "content-modified")
  fixture.input.sdkConfiguration = { unsupported: () => "must not become default" }
  assert.throws(() => fixture.state.captureClassBindingInput(fixture.input),
    error => error.name === "DataCloneError")
})

test("existing non-file objects and missing parents remain unknown", async t => {
  const fixture = await createClassBindingInputFixture(t)
  fs.mkdirSync(path.join(fixture.physicalRoot, "Base.d.ets"))
  fs.symlinkSync(path.join(fixture.physicalRoot, "nonexistent"), path.join(fixture.physicalRoot, "Base.d.ts"))
  const captured = fixture.state.captureClassBindingInput(fixture.input)
  assert.deepEqual(captured.query.sourceAvailability.map(entry => entry.state),
    ["present", "present", "absent", "unknown", "unknown", "unknown", "unknown", "unknown", "unknown"])
  captured.assertCurrent()
  await fixture.index.resolveClassBaseBinding(captured.workspace.id, captured.query)
  captured.assertCurrent()
})

test("availability follows the actual filesystem probe, including permission failure", async t => {
  const fixture = await createClassBindingInputFixture(t)
  const restricted = path.join(fixture.physicalRoot, "restricted")
  fs.mkdirSync(restricted)
  fixture.input.query.documentUris.push(fixture.uri("restricted/Base.ts"))
  fs.chmodSync(restricted, 0)
  try {
    let failure
    try { fs.lstatSync(path.join(restricted, "Base.ts")) } catch (error) { failure = error }
    assert.ok(failure?.code === "EACCES" || failure?.code === "ENOENT")
    // Privileged/Windows hosts may still permit traversal; do not claim EACCES there.
    t.diagnostic(`physical permission probe: ${failure.code}`)
    const captured = fixture.state.captureClassBindingInput(fixture.input)
    assert.equal(captured.query.sourceAvailability.at(-1).state,
      failure.code === "EACCES" ? "unknown" : "absent")
    captured.assertCurrent()
    await fixture.index.resolveClassBaseBinding(captured.workspace.id, captured.query)
    captured.assertCurrent()
  } finally { fs.chmodSync(restricted, 0o700) }
})

test("captured current inputs compose with real Rust discovery without treating missing parents as absence", async t => {
  const sidecarPath = path.resolve(import.meta.dirname, "../target/release",
    process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")
  assert.ok(fs.existsSync(sidecarPath), "build the release sidecar for public composition")
  const fixture = await createClassBindingInputFixture(t, { sidecarPath })
  const { index, workspace, state, input, document } = fixture
  await index.refresh(workspace.id, 7, [document, { ...document,
    uri: fixture.uri("Base.ets"), text: "export class Base {}\n" }], [])
  const conservative = state.captureClassBindingInput(input)
  conservative.assertCurrent()
  assert.equal((await index.resolveClassBaseBinding(workspace.id, conservative.query)).binding.kind, "unknown")
  conservative.assertCurrent()
  assert.equal(fs.existsSync(path.join(fixture.physicalRoot, "Base")), false)
  document.text = "import { Base } from './Base.ets';\nclass Child extends Base {}"
  input.query.documentUris.splice(2)
  // This unwatched edit precedes capture: a presence witness alone cannot
  // certify the older persisted range at unchanged generation 7.
  fs.writeFileSync(path.join(fixture.physicalRoot, "Base.ets"), "/* 😀 */ export class Base {}\n")
  const captured = state.captureClassBindingInput(input)
  captured.assertCurrent()
  const result = await index.resolveClassBaseBinding(workspace.id, captured.query)
  captured.assertCurrent()
  assert.deepEqual(result.binding, { kind: "resolved", name: "Base",
    declarationUri: fixture.uri("Base.ets"),
    nameRange: { start: { line: 0, character: 22 }, end: { line: 0, character: 26 } },
    supportUris: [fixture.uri("Base.ets"), fixture.uri("Child.ets")] })
  assert.equal(result.servedGeneration, 7)
})
