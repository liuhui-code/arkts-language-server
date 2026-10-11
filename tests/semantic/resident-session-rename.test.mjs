import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { selectedL03Policy } from "../support/resident-interactive-lsp.mjs"

test("promoted barrel rename preserves the origin and applies the complete versioned public edit set",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const observations = []
    for (const enabled of [false, true]) {
      const session = await startSession(t, fixture, enabled)
      await warmAndPromote(session, fixture)
      const barrel = fixture.sources["ZBarrel.ets"]
      const params = { textDocument: { uri: fixture.uri("ZBarrel.ets") },
        position: positionAt(barrel, barrel.indexOf("Profile") + 1) }
      const prepare = await session.request("textDocument/prepareRename", params, { timeoutMs: 20_000 })
      assert.equal(prepare.error, undefined, JSON.stringify(prepare.error))
      assert.deepEqual(prepare.result, { range: rangeAt(barrel, barrel.indexOf("Profile"), "Profile"),
        placeholder: "Profile" })
      const response = await session.request("textDocument/rename", { ...params, newName: "Account" },
        { timeoutMs: 20_000 })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const expected = [{ textDocument: { uri: fixture.uri("ZBarrel.ets"), version: 1 },
        edits: [{ range: prepare.result.range, newText: "Profile as Account" }] }]
      for (const [name, version] of [["ZConsumer.ets", 1], ["ZHidden.ets", null]]) {
        expected.push({ textDocument: { uri: fixture.uri(name), version },
          edits: [...fixture.sources[name].matchAll(/Profile/g)].map(match =>
            ({ range: rangeAt(fixture.sources[name], match.index, "Profile"), newText: "Account" })) })
      }
      expected.sort((a, b) => a.textDocument.uri < b.textDocument.uri ? -1 : 1)
      assert.deepEqual(response.result, { documentChanges: expected })
      const documents = new Map(Object.entries(fixture.sources).map(([name, text]) => [fixture.uri(name), text]))
      const versions = new Map([...documents.keys()].map(uri => [uri, session.documentVersions.get(uri) ?? null]))
      const updated = applyWorkspaceEdit(documents, response.result, { documentVersions: versions })
      assert.equal(updated.get(fixture.uri("ZOrigin.ets")), fixture.sources["ZOrigin.ets"])
      assert.equal(updated.get(fixture.uri("ZHomonym.ets")), fixture.sources["ZHomonym.ets"])
      assert.equal(updated.get(fixture.uri("ZBarrel.ets")), barrel.replace("Profile", "Profile as Account"))
      const diagnostics = []
      for (const name of ["ZBarrel.ets", "ZConsumer.ets", "ZHidden.ets"]) {
        const uri = fixture.uri(name)
        const version = (session.documentVersions.get(uri) ?? 0) + 1
        if (version === 1) session.openDocument({ uri, version, text: updated.get(uri) })
        else session.changeDocument({ uri, version, text: updated.get(uri) })
      }
      for (const name of ["ZBarrel.ets", "ZConsumer.ets", "ZHidden.ets"]) {
        const uri = fixture.uri(name)
        const publication = (await diagnostic(session, uri, session.documentVersions.get(uri))).params
        assert.deepEqual(publication.diagnostics, [])
        diagnostics.push(publication)
      }
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri: fixture.uri("ZConsumer.ets") },
        position: positionAt(updated.get(fixture.uri("ZConsumer.ets")),
          updated.get(fixture.uri("ZConsumer.ets")).lastIndexOf("Account") + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      const origin = fixture.sources["ZOrigin.ets"]
      assert.deepEqual(definition.result, [{ uri: fixture.uri("ZOrigin.ets"),
        range: rangeAt(origin, origin.indexOf("Profile"), "Profile") }])
      observations.push({ prepare: prepare.result, edit: response.result, diagnostics, definition: definition.result })
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      if (enabled) assertPromoted(fixture)
    }
    assert.deepEqual(observations[1], observations[0])
  })

test("promoted renames keep consumer-local and barrel-public explicit alias layers distinct",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t, { aliases: true })
    const session = await startSession(t, fixture, true)
    await warmAndPromote(session, fixture)
    const consumer = fixture.sources["ZConsumer.ets"]
    const local = await session.request("textDocument/rename", {
      textDocument: { uri: fixture.uri("ZConsumer.ets") },
      position: positionAt(consumer, consumer.lastIndexOf("LocalProfile") + 1), newName: "PrivateProfile",
    }, { timeoutMs: 20_000 })
    assert.equal(local.error, undefined, JSON.stringify(local.error))
    assert.deepEqual(local.result, { documentChanges: [{
      textDocument: { uri: fixture.uri("ZConsumer.ets"), version: 1 },
      edits: [...consumer.matchAll(/LocalProfile/g)].map(match =>
        ({ range: rangeAt(consumer, match.index, "LocalProfile"), newText: "PrivateProfile" })),
    }] })
    const barrel = fixture.sources["ZBarrel.ets"]
    const publicRename = await session.request("textDocument/rename", {
      textDocument: { uri: fixture.uri("ZBarrel.ets") },
      position: positionAt(barrel, barrel.indexOf("PublicProfile") + 1), newName: "SharedProfile",
    }, { timeoutMs: 20_000 })
    assert.equal(publicRename.error, undefined, JSON.stringify(publicRename.error))
    const changes = ["ZBarrel.ets", "ZConsumer.ets", "ZHidden.ets"].map(name => ({
      textDocument: { uri: fixture.uri(name), version: session.documentVersions.get(fixture.uri(name)) ?? null },
      edits: [{ range: rangeAt(fixture.sources[name], fixture.sources[name].indexOf("PublicProfile"), "PublicProfile"),
        newText: "SharedProfile" }],
    })).sort((a, b) => a.textDocument.uri < b.textDocument.uri ? -1 : 1)
    assert.deepEqual(publicRename.result, { documentChanges: changes })
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assertPromoted(fixture)
  })

test("promoted rename rejects conflicts and invalid identifiers atomically without disabling valid origin edits",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true)
    await warmAndPromote(session, fixture)
    const origin = fixture.sources["ZOrigin.ets"]
    session.openDocument({ uri: fixture.uri("ZOrigin.ets"), version: 1, text: origin })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZOrigin.ets"), 1)).params.diagnostics, [])
    const params = { textDocument: { uri: fixture.uri("ZOrigin.ets") },
      position: positionAt(origin, origin.indexOf("Profile") + 1) }
    for (const [newName, error] of [
      ["Occupied", { code: -32803, message: "Rename is not available at this position." }],
      ["not valid", { code: -32602, message: "Rename requires a valid identifier." }],
    ]) {
      const response = await session.request("textDocument/rename", { ...params, newName }, { timeoutMs: 20_000 })
      assert.deepEqual(response.error, error)
      assert.equal(response.result, undefined)
    }
    const valid = await session.request("textDocument/rename", { ...params, newName: "Account" }, { timeoutMs: 20_000 })
    assert.equal(valid.error, undefined, JSON.stringify(valid.error))
    assert.deepEqual(valid.result, { documentChanges: [
      { textDocument: { uri: fixture.uri("ZBarrel.ets"), version: 1 },
        edits: [{ range: rangeAt(fixture.sources["ZBarrel.ets"], fixture.sources["ZBarrel.ets"].indexOf("Profile"), "Profile"),
          newText: "Account as Profile" }] },
      { textDocument: { uri: fixture.uri("ZOrigin.ets"), version: 1 },
        edits: [{ range: rangeAt(origin, origin.indexOf("Profile"), "Profile"), newText: "Account" }] },
    ] })
    for (const [name, text] of Object.entries(fixture.sources)) {
      assert.equal(fs.readFileSync(path.join(fixture.workspace, name), "utf8"), text)
    }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("promoted rename preserves the complete current versioned edit set after a post-L3 Worker replacement",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true,
      { ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1", ARKTS_MEMORY_BUDGET_MB: "64" })
    await warmAndPromote(session, fixture)
    await assertBarrelRename(session, fixture)
    const consumer = `// consumer changed before recycle 😀\n${fixture.sources["ZConsumer.ets"]}`
      + "export const added = new Profile()\n"
    session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 2, text: consumer })
    await assertBarrelRename(session, fixture, { consumer, version: 2 })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZConsumer.ets"), 2)).params.diagnostics, [])
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(fixture, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    const recycle = await session.request("arkts/benchmark/recycleSemanticWorker", {}, { timeoutMs: 20_000 })
    assert.equal(recycle.error, undefined, JSON.stringify(recycle.error))
    assert.equal(recycle.result.recycled, true)
    assert.ok(recycle.result.oldThreadId > 0 && recycle.result.newThreadId > 0)
    assert.notEqual(recycle.result.newThreadId, recycle.result.oldThreadId)
    await assertBarrelRename(session, fixture, { consumer, version: 2 })
    const restored = `// consumer changed after recycle 😀\n${fixture.sources["ZConsumer.ets"]}`
    session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 3, text: restored })
    await assertBarrelRename(session, fixture, { consumer: restored, version: 3 })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZConsumer.ets"), 3)).params.diagnostics, [])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

test("early prepareRename and rename cancellation never leak edits and the complete rename recovers",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true)
    await warmAndPromote(session, fixture)
    const barrel = fixture.sources["ZBarrel.ets"]
    const params = { textDocument: { uri: fixture.uri("ZBarrel.ets") },
      position: positionAt(barrel, barrel.indexOf("Profile") + 1) }
    const ids = new Set()
    for (const [method, extra] of [["textDocument/prepareRename", {}], ["textDocument/rename", { newName: "Account" }]]) {
      const id = session.nextRequestId
      ids.add(id)
      const pending = session.request(method, { ...params, ...extra }, { timeoutMs: 20_000 })
      session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
      const response = await pending
      assert.equal(response.error?.code, -32800, `${method}: ${JSON.stringify(response)}`)
      assert.equal(response.result, undefined)
    }
    await assertBarrelRename(session, fixture)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.ok(!session.transport.messages.some(message => ids.has(message.id)), "no duplicate terminal response")
  })

test("promoted consumer-alias rename rejects a same-scope collision before publishing any edits",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t, { aliases: true })
    const session = await startSession(t, fixture, true)
    await warmAndPromote(session, fixture)
    const consumer = fixture.sources["ZConsumer.ets"] + "export class Occupied {}\n"
    session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 2, text: consumer })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZConsumer.ets"), 2)).params.diagnostics, [])
    const params = { textDocument: { uri: fixture.uri("ZConsumer.ets") },
      position: positionAt(consumer, consumer.lastIndexOf("LocalProfile") + 1) }
    const response = await session.request("textDocument/rename", { ...params, newName: "Occupied" },
      { timeoutMs: 20_000 })
    assert.equal(response.result, undefined, "a conflicting local alias must not publish a WorkspaceEdit")
    assert.deepEqual(response.error, { code: -32803, message: "Rename is not available at this position." })
    const valid = await session.request("textDocument/rename", { ...params, newName: "PrivateProfile" },
      { timeoutMs: 20_000 })
    assert.equal(valid.error, undefined, JSON.stringify(valid.error))
    assert.deepEqual(valid.result, { documentChanges: [{
      textDocument: { uri: fixture.uri("ZConsumer.ets"), version: 2 },
      edits: [...consumer.matchAll(/LocalProfile/g)].map(match =>
        ({ range: rangeAt(consumer, match.index, "LocalProfile"), newText: "PrivateProfile" })),
    }] })
    assert.equal(fs.readFileSync(path.join(fixture.workspace, "ZConsumer.ets"), "utf8"), fixture.sources["ZConsumer.ets"])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("L07 selected budget, trace OFF and default full-safe rename preserve complete applied versioned edits",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t), observations = []
    for (const [enabled, env] of [[true, selectedL03Policy], [false, selectedL03Policy],
      [true, { ...selectedL03Policy, ARKTS_REFERENCES_TRACE: "0" }],
      [false, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
        ARKTS_REFERENCES_TRACE: "0", ARKTS_L03_COST_AWARE_EVICTION: "0",
        ARKTS_L01_PRESSURE_ADMISSION: "0", ARKTS_L01_TRANSIENT_DIAGNOSTICS: "0" }]]) {
      const session = await startSession(t, fixture, enabled, env)
      await warmAndPromote(session, fixture)
      const barrel = fixture.sources["ZBarrel.ets"], uri = fixture.uri("ZBarrel.ets")
      const prepared = await session.request("textDocument/prepareRename", { textDocument: { uri },
        position: positionAt(barrel, barrel.indexOf("Profile") + 1) }, { timeoutMs: 20_000 })
      assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
      assert.deepEqual(prepared.result, { placeholder: "Profile",
        range: rangeAt(barrel, barrel.indexOf("Profile"), "Profile") })
      const edits = await assertBarrelRename(session, fixture)
      const documents = new Map(Object.entries(fixture.sources).map(([name, text]) => [fixture.uri(name), text]))
      const versions = new Map([...documents.keys()].map(uri => [uri, session.documentVersions.get(uri) ?? null]))
      const outdated = new Map(versions)
      outdated.set(fixture.uri("ZConsumer.ets"), 2)
      assert.throws(() => applyWorkspaceEdit(documents, edits, { documentVersions: outdated }), /version mismatch/)
      const updated = applyWorkspaceEdit(documents, edits, { documentVersions: versions })
      for (const name of ["ZBarrel.ets", "ZConsumer.ets", "ZHidden.ets"]) {
        const changedUri = fixture.uri(name), version = (session.documentVersions.get(changedUri) ?? 0) + 1
        if (version === 1) session.openDocument({ uri: changedUri, version, text: updated.get(changedUri) })
        else session.changeDocument({ uri: changedUri, version, text: updated.get(changedUri) })
      }
      const diagnostics = []
      for (const name of ["ZBarrel.ets", "ZConsumer.ets", "ZHidden.ets"]) {
        const changedUri = fixture.uri(name)
        const publication = (await diagnostic(session, changedUri, session.documentVersions.get(changedUri))).params
        assert.deepEqual(publication.diagnostics, [])
        diagnostics.push(publication)
      }
      const source = updated.get(fixture.uri("ZConsumer.ets"))
      const definition = await session.request("textDocument/definition", {
        textDocument: { uri: fixture.uri("ZConsumer.ets") }, position: positionAt(source, source.lastIndexOf("Account") + 1),
      }, { timeoutMs: 20_000 })
      assert.equal(definition.error, undefined, JSON.stringify(definition.error))
      assert.deepEqual(definition.result, [{ uri: fixture.uri("ZOrigin.ets"), range: rangeAt(
        fixture.sources["ZOrigin.ets"], fixture.sources["ZOrigin.ets"].indexOf("Profile"), "Profile") }])
      observations.push({ prepared: prepared.result, edits, diagnostics, definition: definition.result })
      assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
      if (env.ARKTS_REFERENCES_TRACE === "0") {
        assert.ok(!readEvents(fixture).some(event => ["semantic.prepareRename.complete", "semantic.rename.complete"].includes(event.event)))
      }
      for (const [name, text] of Object.entries(fixture.sources)) {
        assert.equal(fs.readFileSync(path.join(fixture.workspace, name), "utf8"), text)
      }
    }
    for (const observation of observations.slice(1)) assert.deepEqual(observation, observations[0])
  })

test("L07 selected policy physically replaces the Worker and restores complete current rename edits",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t)
    const session = await startSession(t, fixture, true, { ...selectedL03Policy,
      ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1", ARKTS_MEMORY_BUDGET_MB: "64" })
    await warmAndPromote(session, fixture)
    const consumer = `// selected policy latest rename 😀\n${fixture.sources["ZConsumer.ets"]}`
      + "export const added = new Profile()\n"
    session.changeDocument({ uri: fixture.uri("ZConsumer.ets"), version: 2, text: consumer })
    const before = await assertBarrelRename(session, fixture, { consumer, version: 2 })
    assert.deepEqual((await diagnostic(session, fixture.uri("ZConsumer.ets"), 2)).params.diagnostics, [])
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    await waitForEvent(fixture, event => event.event === "semantic.context.evict" && event.reason === "memory-level3")
    const recycle = await session.request("arkts/benchmark/recycleSemanticWorker", {}, { timeoutMs: 20_000 })
    assert.equal(recycle.error, undefined, JSON.stringify(recycle.error))
    assert.equal(recycle.result.recycled, true)
    assert.ok(recycle.result.oldThreadId > 0 && recycle.result.newThreadId > 0)
    assert.notEqual(recycle.result.oldThreadId, recycle.result.newThreadId)
    assert.deepEqual(await assertBarrelRename(session, fixture, { consumer, version: 2 }), before)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

test("L07 same-owner member collision rejects every edit while a valid member rename still applies exactly",
  { timeout: 60_000 }, async t => {
    const fixture = createFixture(t), uri = fixture.uri("ZOrigin.ets")
    const source = fixture.sources["ZOrigin.ets"].replace("value = 1",
      "value = 1; occupied = 2; read(): number { return this.value }")
    const cold = await startSession(t, fixture, false, selectedL03Policy)
    cold.openDocument({ uri, version: 1, text: source.replaceAll(/\bvalue\b/g, "occupied") })
    assert.ok((await diagnostic(cold, uri, 1)).params.diagnostics.some(item => item.code === 2300),
      "the pinned compiler independently diagnoses applying the colliding member rename")
    assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    const session = await startSession(t, fixture, true, selectedL03Policy)
    await warmAndPromote(session, fixture)
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    const params = { textDocument: { uri }, position: positionAt(source, source.indexOf("value") + 1) }
    const rejected = await session.request("textDocument/rename", { ...params, newName: "occupied" }, { timeoutMs: 20_000 })
    assert.deepEqual(rejected.error, { code: -32803, message: "Rename is not available at this position." })
    assert.equal(rejected.result, undefined)
    const renamed = await session.request("textDocument/rename", { ...params, newName: "updated" }, { timeoutMs: 20_000 })
    assert.equal(renamed.error, undefined, JSON.stringify(renamed.error))
    assert.deepEqual(renamed.result, { documentChanges: [{ textDocument: { uri, version: 1 },
      edits: [...source.matchAll(/\bvalue\b/g)].map(match => ({ newText: "updated",
        range: rangeAt(source, match.index, "value") })) }] })
    const updated = applyWorkspaceEdit(new Map([[uri, source]]), renamed.result,
      { documentVersions: new Map([[uri, 1]]) }).get(uri)
    session.changeDocument({ uri, version: 2, text: updated })
    assert.deepEqual((await diagnostic(session, uri, 2)).params.diagnostics, [])
    const definition = await session.request("textDocument/definition", { textDocument: { uri },
      position: positionAt(updated, updated.lastIndexOf("updated") + 1) }, { timeoutMs: 20_000 })
    assert.equal(definition.error, undefined, JSON.stringify(definition.error))
    assert.deepEqual(definition.result, [{ uri, range: rangeAt(updated, updated.indexOf("updated"), "updated") }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

function createFixture(t, { aliases = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resident-rename-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ apiVersion: "24", version: "test" }))
  const sources = {
    "AWarm.ets": "export interface WarmContract { value: number }\n"
      + "export class WarmImplementation implements WarmContract { value = 1 }\n",
    "ZOrigin.ets": "/* 😀 */ export class Profile { value = 1 }\nexport class Occupied {}\n",
    "ZBarrel.ets": 'export { Profile } from "./ZOrigin"\n',
    "ZConsumer.ets": 'import { Profile } from "./ZBarrel"\n'
      + "/* 😀 */ export const selected = new Profile()\nexport const typed: Profile = selected\n",
    "ZHidden.ets": 'import { Profile } from "./ZBarrel"\nexport const hidden = new Profile()\n',
    "ZHomonym.ets": "export class Profile {}\nexport const unrelated = new Profile()\n",
  }
  if (aliases) {
    sources["ZBarrel.ets"] = 'export { Profile as PublicProfile } from "./ZOrigin"\n'
    sources["ZConsumer.ets"] = 'import { PublicProfile as LocalProfile } from "./ZBarrel"\n'
      + "/* 😀 */ export const selected = new LocalProfile()\nexport const typed: LocalProfile = selected\n"
    sources["ZHidden.ets"] = 'import { PublicProfile as HiddenProfile } from "./ZBarrel"\n'
      + "export const hidden = new HiddenProfile()\n"
  }
  for (let index = 0; index < 270; index++) {
    sources[`Filler${String(index).padStart(3, "0")}.ets`] = `export const filler${index} = ${index}\n`
  }
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), source)
  return { directory, workspace, sdk, sources, uri: name => pathToFileURL(path.join(workspace, name)).href }
}

async function startSession(t, fixture, enabled, env = {}) {
  fixture.runCount = (fixture.runCount ?? 0) + 1
  fixture.logs = path.join(fixture.directory, `logs-${fixture.runCount}`)
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(fixture.workspace).href,
    capabilities: { workspace: { workspaceEdit: { documentChanges: true, failureHandling: "transactional" } },
      textDocument: { publishDiagnostics: { versionSupport: true }, rename: { prepareSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: fixture.sdk, DEVECO_SDK_HOME: fixture.sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, `cache-${fixture.runCount}`), ARKTS_LSP_LOG_DIR: fixture.logs,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched", ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1", ARKTS_REFERENCES_TRACE: "1", ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L02_SAME_CONTENT_PROMOTION: enabled ? "1" : "0", ARKTS_L03_PRESSURE_WORKER_RECYCLE: "0",
      ARKTS_MEMORY_BUDGET_MB: "1024", ...env,
    },
  })
  t.after(() => session.close().catch(() => {}))
  const initialized = await session.initialize({ timeoutMs: 10_000,
    initializationOptions: { sdk: { path: fixture.sdk } } })
  assert.deepEqual(initialized.result.capabilities.renameProvider, { prepareProvider: true })
  return session
}

async function warmAndPromote(session, fixture) {
  const warm = fixture.sources["AWarm.ets"]
  session.openDocument({ uri: fixture.uri("AWarm.ets"), version: 1, text: warm })
  assert.deepEqual((await diagnostic(session, fixture.uri("AWarm.ets"), 1)).params.diagnostics, [])
  const implementation = await session.request("textDocument/implementation", {
    textDocument: { uri: fixture.uri("AWarm.ets") }, position: positionAt(warm, warm.indexOf("WarmContract") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(implementation.error, undefined, JSON.stringify(implementation.error))
  assert.deepEqual(implementation.result, [{ uri: fixture.uri("AWarm.ets"),
    range: rangeAt(warm, warm.indexOf("WarmImplementation"), "WarmImplementation") }])
  for (const name of ["ZBarrel.ets", "ZConsumer.ets"]) {
    session.openDocument({ uri: fixture.uri(name), version: 1, text: fixture.sources[name] })
    assert.deepEqual((await diagnostic(session, fixture.uri(name), 1)).params.diagnostics, [])
  }
}

function diagnostic(session, uri, version) {
  return session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 20_000)
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset).split("\n")
  return { line: prefix.length - 1, character: prefix.at(-1).length }
}

function rangeAt(source, offset, symbol) {
  return { start: positionAt(source, offset), end: positionAt(source, offset + symbol.length) }
}

function readEvents(fixture) {
  return fs.readFileSync(path.join(fixture.logs, "server.log"), "utf8").trim().split("\n").map(JSON.parse)
}

function assertPromoted(fixture) {
  const admissions = readEvents(fixture).filter(event => event.event === "semantic.prepare.script-admission"
    && event.promotedWithMatchingFingerprint > 0)
  assert.ok(admissions.length > 0)
  assert.ok(admissions.every(event => event.generationAfter === event.generationBefore))
}

async function assertBarrelRename(session, fixture, { consumer = fixture.sources["ZConsumer.ets"], version = 1 } = {}) {
  const barrel = fixture.sources["ZBarrel.ets"]
  const response = await session.request("textDocument/rename", {
    textDocument: { uri: fixture.uri("ZBarrel.ets") },
    position: positionAt(barrel, barrel.indexOf("Profile") + 1), newName: "Account",
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const changes = [{ textDocument: { uri: fixture.uri("ZBarrel.ets"), version: 1 },
    edits: [{ range: rangeAt(barrel, barrel.indexOf("Profile"), "Profile"), newText: "Profile as Account" }] }]
  for (const [name, source, documentVersion] of [["ZConsumer.ets", consumer, version],
    ["ZHidden.ets", fixture.sources["ZHidden.ets"], null]]) {
    changes.push({ textDocument: { uri: fixture.uri(name), version: documentVersion },
      edits: [...source.matchAll(/Profile/g)].map(match =>
        ({ range: rangeAt(source, match.index, "Profile"), newText: "Account" })) })
  }
  changes.sort((a, b) => a.textDocument.uri < b.textDocument.uri ? -1 : 1)
  assert.deepEqual(response.result, { documentChanges: changes })
  return response.result
}

async function waitForEvent(fixture, predicate) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const event = readEvents(fixture).find(predicate)
    if (event) return event
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail("timed out waiting for rename lifecycle witness")
}
