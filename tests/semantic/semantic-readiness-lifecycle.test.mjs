import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { createReadinessFixture, startReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("a late physical SDK parent retarget cannot certify unchanged hardlinked declaration stamps",
  { timeout: 30_000 }, async t => {
    const preload = path.join(projectRoot, "tests/fixtures/semantic-realpath-scan-counter.cjs")
    const fixture = createReadinessFixture(t, { NODE_OPTIONS: `--require=${JSON.stringify(preload)}` })
    const { session, sdk, workspace, directory, uri } = fixture
    const api = path.join(sdk, "ets", "api")
    const replacement = path.join(directory, "replacement-api")
    fs.mkdirSync(api)
    fs.mkdirSync(replacement)
    for (let index = 0; index < 96; index++) {
      const name = `@ohos.scan${index}.d.ts`
      fs.writeFileSync(path.join(api, name), `export declare class ScanValue${index} { value: number }\n`)
      // Same inode, size and timestamps; only physical parent authority changes.
      fs.linkSync(path.join(api, name), path.join(replacement, name))
    }
    const source = Array.from({ length: 96 }, (_, index) =>
      `import { ScanValue${index} } from '@ohos.scan${index}'`).join("\n")
      + "\nexport const selected = new ScanValue95()\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    await initializeRoots(fixture, [fixture.rootUri], 2)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: source })
    await diagnostic(session, uri("Main.ets"), 1)
    const query = () => session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
      position: positionAt(source, source.lastIndexOf("ScanValue95") + 1) }, { timeoutMs: 5_000 })
    const initial = await query()
    assert.equal(initial.error, undefined, JSON.stringify(initial.error))
    assert.deepEqual(initial.result, [{ uri: pathToFileURL(path.join(api, "@ohos.scan95.d.ts")).href,
      range: { start: { line: 0, character: 21 }, end: { line: 0, character: 32 } } }])
    fs.writeFileSync(path.join(directory, "arm-realpath-counter"), "retarget")
    const rejected = await query()
    const counters = fs.readdirSync(directory).filter(name => /^realpath-scan-\d+\.json$/.test(name))
      .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")))
      .filter(counter => counter.pid === session.transport.child.pid && counter.threadId > 0)
    assert.ok(counters.some(counter => counter.retargeted && counter.sdkLeafStats >= 90),
      "retarget must actually happen late in the real Worker filesystem scan")
    assert.equal(rejected.error?.code, -32803, JSON.stringify(rejected))
    assert.equal(rejected.result, undefined)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an unnotified SDK declaration case rename cannot retain its loaded physical identity",
  { timeout: 30_000 }, async t => {
    const fixture = createReadinessFixture(t)
    const { session, sdk, workspace, uri } = fixture
    const api = path.join(sdk, "ets", "api")
    fs.mkdirSync(api)
    const declaration = path.join(api, "@ohos.case.d.ts")
    fs.writeFileSync(declaration, "export declare class CaseValue { value: number }\n")
    const source = "import { CaseValue } from '@ohos.case'\nexport const selected = new CaseValue()\n"
    fs.writeFileSync(path.join(workspace, "Main.ets"), source)
    await initializeRoots(fixture, [fixture.rootUri], 2)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: source })
    await diagnostic(session, uri("Main.ets"), 1)
    const query = () => session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
      position: positionAt(source, source.lastIndexOf("CaseValue") + 1) }, { timeoutMs: 5_000 })
    const initial = await query()
    assert.equal(initial.error, undefined, JSON.stringify(initial.error))
    assert.deepEqual(initial.result, [{ uri: pathToFileURL(declaration).href,
      range: { start: { line: 0, character: 21 }, end: { line: 0, character: 30 } } }])
    fs.renameSync(declaration, path.join(api, "@ohos.CASE.d.ts"))
    const current = await query()
    assert.equal(current.error?.code, -32803, JSON.stringify(current))
    assert.equal(current.result, undefined)
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("independent workspace roots keep separate ready proofs and an edit cannot publish the other root's generation",
  { timeout: 40_000 }, async t => {
    const fixture = createReadinessFixture(t)
    const { session, workspace, directory, rootUri, sources, uri, events } = fixture
    const other = path.join(directory, "workspace-other")
    fs.mkdirSync(other)
    const otherUri = name => pathToFileURL(path.join(other, name)).href
    const otherRootUri = pathToFileURL(other).href
    for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(other, name), source)
    await initializeRoots(fixture, [rootUri, otherRootUri], 4)
    const first = await readiness(session, rootUri, true)
    assert.equal(first.semanticState, "ready", JSON.stringify(first))
    assert.equal(first.coverage.projectSources, 2)
    assert.equal(first.inputIdentity.canonicalRoot, fs.realpathSync(workspace))
    const untouched = await readiness(session, otherRootUri, false)
    assert.equal(untouched.semanticState, "ready", JSON.stringify(untouched))
    assert.equal(untouched.inputIdentity.canonicalRoot, fs.realpathSync(other))
    const second = await readiness(session, otherRootUri, true)
    assert.equal(second.semanticState, "ready", JSON.stringify(second))
    assert.deepEqual(second, untouched, "explicit preparation reuses this root's automatically prepared Program")
    assert.equal(second.coverage.projectSources, 2)
    assert.equal(second.inputIdentity.canonicalRoot, fs.realpathSync(other))
    assert.notEqual(second.semanticGeneration, first.semanticGeneration)
    assert.notEqual(second.inputIdentity.sha256, first.inputIdentity.sha256)
    const afterOtherPreparation = await readiness(session, rootUri, false)
    assert.deepEqual(afterOtherPreparation, first,
      "preparing an independent root must preserve the first root's current proof")
    assert.ok(!events().some(e => e.event.endsWith("compiler-query.start")), "no target answer prequeries")
    const current = "/* 😀 */\n" + sources["Unopened.ets"].replace("return 1", "return 2")
    session.openDocument({ uri: otherUri("Unopened.ets"), version: 1, text: current })
    assert.deepEqual((await diagnostic(session, otherUri("Unopened.ets"), 1)).params.diagnostics, [])
    const stale = await readiness(session, otherRootUri, false)
    assert.notEqual(stale.semanticState, "ready", JSON.stringify(stale))
    assert.equal(stale.semanticGeneration, null)
    assert.deepEqual(await readiness(session, rootUri, false), first,
      "an unrelated root edit must not reuse or invalidate the first root's proof")
    const refreshed = await readiness(session, otherRootUri, true)
    assert.equal(refreshed.semanticState, "ready", JSON.stringify(refreshed))
    assert.notEqual(refreshed.semanticGeneration, second.semanticGeneration)
    assert.notEqual(refreshed.inputIdentity.sha256, second.inputIdentity.sha256)
    for (const [callerUri, declarationUri, target] of [
      [uri("Main.ets"), uri("Unopened.ets"), sources["Unopened.ets"]],
      [otherUri("Main.ets"), otherUri("Unopened.ets"), current],
    ]) {
      session.openDocument({ uri: callerUri, version: 1, text: sources["Main.ets"] })
      assert.deepEqual((await diagnostic(session, callerUri, 1)).params.diagnostics, [])
      const response = await session.request("textDocument/definition", { textDocument: { uri: callerUri },
        position: positionAt(sources["Main.ets"], sources["Main.ets"].lastIndexOf("neverQueried") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const offset = target.indexOf("neverQueried")
      assert.deepEqual(response.result, [{ uri: declarationUri, range: {
        start: positionAt(target, offset), end: positionAt(target, offset + "neverQueried".length),
      } }])
    }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a nested-root dependency edit revokes both affected ready proofs and recovers exact current locations",
  { timeout: 40_000 }, async t => {
    const fixture = createReadinessFixture(t)
    const { session, workspace, rootUri, sources, uri, events } = fixture
    const nested = path.join(workspace, "nested")
    fs.mkdirSync(nested)
    const nestedUri = name => pathToFileURL(path.join(nested, name)).href
    const nestedRootUri = pathToFileURL(nested).href
    const outerMain = sources["Main.ets"].replace("./Unopened", "./nested/Unopened")
    fs.writeFileSync(path.join(workspace, "Main.ets"), outerMain)
    for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(nested, name), source)
    await initializeRoots(fixture, [rootUri, nestedRootUri])
    const outer = await readiness(session, rootUri, true)
    const inner = await readiness(session, nestedRootUri, true)
    assert.equal(outer.semanticState, "ready", JSON.stringify(outer))
    assert.equal(inner.semanticState, "ready", JSON.stringify(inner))
    assert.equal(outer.coverage.projectSources, 4)
    assert.equal(inner.coverage.projectSources, 2)
    assert.notEqual(outer.semanticGeneration, inner.semanticGeneration)
    assert.deepEqual(await readiness(session, rootUri, false), outer)
    assert.ok(!events().some(e => e.event.endsWith("compiler-query.start")), "no target answer prequeries")
    const current = "// current nested input 😀\n" + sources["Unopened.ets"].replace("return 1", "return 3")
    session.openDocument({ uri: nestedUri("Unopened.ets"), version: 1, text: current })
    assert.deepEqual((await diagnostic(session, nestedUri("Unopened.ets"), 1)).params.diagnostics, [])
    for (const root of [rootUri, nestedRootUri]) {
      const stale = await readiness(session, root, false)
      assert.notEqual(stale.semanticState, "ready", JSON.stringify(stale))
      assert.equal(stale.semanticGeneration, null)
      assert.deepEqual(stale.readyCapabilities, [])
    }
    const refreshedOuter = await readiness(session, rootUri, true)
    const refreshedInner = await readiness(session, nestedRootUri, true)
    assert.equal(refreshedOuter.semanticState, "ready", JSON.stringify(refreshedOuter))
    assert.equal(refreshedInner.semanticState, "ready", JSON.stringify(refreshedInner))
    assert.notEqual(refreshedOuter.semanticGeneration, outer.semanticGeneration)
    assert.notEqual(refreshedInner.semanticGeneration, inner.semanticGeneration)
    for (const [caller, source] of [[uri("Main.ets"), outerMain], [nestedUri("Main.ets"), sources["Main.ets"]]]) {
      session.openDocument({ uri: caller, version: 1, text: source })
      assert.deepEqual((await diagnostic(session, caller, 1)).params.diagnostics, [])
      const response = await session.request("textDocument/definition", { textDocument: { uri: caller },
        position: positionAt(source, source.lastIndexOf("neverQueried") + 1) })
      assert.equal(response.error, undefined, JSON.stringify(response.error))
      const offset = current.indexOf("neverQueried")
      assert.deepEqual(response.result, [{ uri: nestedUri("Unopened.ets"), range: {
        start: positionAt(current, offset), end: positionAt(current, offset + "neverQueried".length),
      } }])
    }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("a proof predating another root's loaded package facts still checks their current bytes and resets safely",
  { timeout: 40_000 }, async t => {
    const fixture = createReadinessFixture(t)
    const { session, directory, rootUri, events } = fixture
    const other = path.join(directory, "workspace-package")
    const library = path.join(other, "library")
    fs.mkdirSync(library, { recursive: true })
    const otherRootUri = pathToFileURL(other).href
    const otherUri = name => pathToFileURL(path.join(other, name)).href
    const main = 'import { api } from "library"\nexport const result: number = api()\n'
    const firstSource = "export function api(): number { return 1 }\n"
    const nextSource = "/* current package 😀 */ export function api(): string { return 'new' }\n"
    fs.writeFileSync(path.join(other, "Main.ets"), main)
    fs.writeFileSync(path.join(other, "oh-package.json5"), "{ dependencies: { library: 'file:./library' } }")
    const manifest = path.join(library, "oh-package.json5")
    fs.writeFileSync(manifest, "{ main: 'A.ets' }")
    fs.writeFileSync(path.join(library, "A.ets"), firstSource)
    fs.writeFileSync(path.join(library, "B.ets"), nextSource)
    await initializeRoots(fixture, [rootUri, otherRootUri], 5)
    const before = await readiness(session, rootUri, true)
    assert.equal(before.semanticState, "ready", JSON.stringify(before))
    const packageBefore = await readiness(session, otherRootUri, true)
    assert.equal(packageBefore.semanticState, "ready", JSON.stringify(packageBefore))
    assert.deepEqual(await readiness(session, rootUri, false), before)
    assert.ok(!events().some(e => e.event.endsWith("compiler-query.start")), "no target answer prequeries")
    // No notification: this changes a fact first loaded AFTER the first root's proof.
    fs.writeFileSync(manifest, "{ main: 'B.ets' }")
    for (const root of [rootUri, otherRootUri]) {
      const stale = await readiness(session, root, false)
      assert.notEqual(stale.semanticState, "ready", JSON.stringify(stale))
      assert.equal(stale.semanticGeneration, null)
      assert.deepEqual(stale.readyCapabilities, [])
    }
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(manifest).href, type: 2 }] } })
    const packageAfter = await readiness(session, otherRootUri, true)
    assert.equal(packageAfter.semanticState, "ready", JSON.stringify(packageAfter))
    assert.notEqual(packageAfter.semanticGeneration, packageBefore.semanticGeneration)
    const after = await readiness(session, rootUri, true)
    assert.equal(after.semanticState, "ready", JSON.stringify(after))
    session.openDocument({ uri: otherUri("Main.ets"), version: 1, text: main })
    const errors = (await diagnostic(session, otherUri("Main.ets"), 1)).params.diagnostics
    assert.deepEqual(errors.map(error => error.code), [2322])
    const resultOffset = main.indexOf("result")
    assert.deepEqual(errors[0].range, { start: positionAt(main, resultOffset),
      end: positionAt(main, resultOffset + "result".length) })
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: otherUri("Main.ets") }, position: positionAt(main, main.lastIndexOf("api") + 1),
    })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const offset = nextSource.indexOf("api")
    assert.deepEqual(response.result, [{ uri: otherUri("library/B.ets"), range: {
      start: positionAt(nextSource, offset), end: positionAt(nextSource, offset + "api".length),
    } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("physical Worker replacement drops the old ready epoch and prepares only the replayed latest overlays",
  { timeout: 40_000 }, async t => {
    // Explicit recycle counterfactual, not a default-policy promotion or budget change.
    const fixture = createReadinessFixture(t, {
      ARKTS_L01_SEMANTIC_WORKER_RECYCLE: "1", ARKTS_L03_COST_AWARE_EVICTION: "0",
    })
    const { session, rootUri, sources, uri, events } = fixture
    await initializeRoots(fixture, [rootUri], 2)
    const currentTarget = "// replayed declaration 😀\n" + sources["Unopened.ets"].replace("return 1", "return 2")
    const currentMain = "// replayed caller 😀\n" + sources["Main.ets"]
      + 'export const broken: number = "wrong"\n'
    for (const [name, current] of [["Unopened.ets", currentTarget], ["Main.ets", currentMain]]) {
      session.openDocument({ uri: uri(name), version: 1, text: sources[name] })
      assert.deepEqual((await diagnostic(session, uri(name), 1)).params.diagnostics, [])
      session.changeDocument({ uri: uri(name), version: 2, text: current })
      const errors = (await diagnostic(session, uri(name), 2)).params.diagnostics
      assert.deepEqual(errors.map(error => error.code), name === "Main.ets" ? [2322] : [])
    }
    const before = await readiness(session, rootUri, true)
    assert.equal(before.semanticState, "ready", JSON.stringify(before))
    assert.ok(!events().some(e => e.event.endsWith("compiler-query.start")), "no target answer prequeries")
    const pressure = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(pressure.result, { applied: "level3" }, JSON.stringify(pressure.error))
    const evicted = await readiness(session, rootUri, false)
    assert.notEqual(evicted.semanticState, "ready", JSON.stringify(evicted))
    assert.equal(evicted.semanticGeneration, null)
    assert.ok(events().some(e => e.event === "semantic.context.evict" && e.reason === "memory-level3"))
    const recycled = await session.request("arkts/benchmark/recycleSemanticWorker", {}, { timeoutMs: 20_000 })
    assert.equal(recycled.error, undefined, JSON.stringify(recycled.error))
    assert.equal(recycled.result.recycled, true)
    assert.ok(recycled.result.oldThreadId > 0 && recycled.result.newThreadId > 0)
    assert.notEqual(recycled.result.oldThreadId, recycled.result.newThreadId)
    const unprepared = await readiness(session, rootUri, false)
    assert.notEqual(unprepared.semanticState, "ready", JSON.stringify(unprepared))
    assert.equal(unprepared.semanticGeneration, null)
    assert.deepEqual(unprepared.readyCapabilities, [])
    const after = await readiness(session, rootUri, true)
    assert.equal(after.semanticState, "ready", JSON.stringify(after))
    assert.notEqual(after.semanticGeneration, before.semanticGeneration)
    assert.notEqual(after.semanticGeneration.split(":")[0], before.semanticGeneration.split(":")[0],
      "a physical replacement must establish a new root epoch")
    for (const field of ["sourcesSha256", "overlaysSha256", "sdkSha256", "standardLibrarySha256"]) {
      assert.equal(after.inputIdentity[field], before.inputIdentity[field], `replayed current ${field}`)
    }
    const response = await session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
      position: positionAt(currentMain, currentMain.lastIndexOf("neverQueried") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const offset = currentTarget.indexOf("neverQueried")
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: positionAt(currentTarget, offset), end: positionAt(currentTarget, offset + "neverQueried".length),
    } }])
    session.changeDocument({ uri: uri("Main.ets"), version: 3, text: currentMain })
    const errors = (await diagnostic(session, uri("Main.ets"), 3)).params.diagnostics
    assert.deepEqual(errors.map(error => error.code), [2322])
    const broken = currentMain.indexOf("broken")
    assert.deepEqual(errors[0].range, { start: positionAt(currentMain, broken),
      end: positionAt(currentMain, broken + "broken".length) })
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })

test("unknown unnotified membership and dependency deletion cannot retain an old complete ready proof",
  { timeout: 40_000 }, async t => {
    const fixture = createReadinessFixture(t)
    const { session, rootUri, workspace, sources, uri, events } = fixture
    await initializeRoots(fixture, [rootUri], 2)
    const before = await readiness(session, rootUri, true)
    assert.equal(before.semanticState, "ready", JSON.stringify(before))
    fs.writeFileSync(path.join(workspace, "Disconnected.ets"),
      'import { Lost } from "./absent"\nexport const disconnected: Lost = 1\n')
    const changed = await readiness(session, rootUri, false)
    assert.notEqual(changed.semanticState, "ready", JSON.stringify(changed))
    assert.equal(changed.semanticGeneration, null)
    const missing = await readiness(session, rootUri, true)
    assert.equal(missing.semanticState, "degraded", JSON.stringify(missing))
    assert.equal(missing.unavailableInput?.code, 2307)
    assert.equal(missing.unavailableInput?.uri, uri("Disconnected.ets"))
    assert.deepEqual(missing.readyCapabilities, [])
    const repaired = "/* disconnected current 😀 */ export const valid = 1\n"
      + 'export const broken: number = "wrong"\n'
    session.openDocument({ uri: uri("Disconnected.ets"), version: 1, text: repaired })
    assert.deepEqual((await diagnostic(session, uri("Disconnected.ets"), 1)).params.diagnostics
      .map(error => error.code), [2322])
    const complete = await readiness(session, rootUri, true)
    assert.equal(complete.semanticState, "ready", JSON.stringify(complete))
    assert.equal(complete.coverage.projectSources, 3)
    assert.notEqual(complete.semanticGeneration, before.semanticGeneration)
    assert.notEqual(complete.inputIdentity.sha256, before.inputIdentity.sha256)
    fs.unlinkSync(path.join(workspace, "Unopened.ets"))
    const deleted = await readiness(session, rootUri, false)
    assert.notEqual(deleted.semanticState, "ready", JSON.stringify(deleted))
    assert.equal(deleted.semanticGeneration, null)
    const lostDependency = await readiness(session, rootUri, true)
    assert.equal(lostDependency.semanticState, "degraded", JSON.stringify(lostDependency))
    assert.equal(lostDependency.unavailableInput?.code, 2307)
    assert.equal(lostDependency.unavailableInput?.uri, uri("Main.ets"))
    assert.ok(!events().some(e => e.event.endsWith("compiler-query.start")), "no target answer prequeries")
    const currentTarget = "// restored dependency 😀\n" + sources["Unopened.ets"].replace("return 1", "return 9")
    fs.writeFileSync(path.join(workspace, "Unopened.ets"), currentTarget)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: uri("Unopened.ets"), type: 1 }] } })
    const restored = await readiness(session, rootUri, true)
    assert.equal(restored.semanticState, "ready", JSON.stringify(restored))
    assert.equal(restored.coverage.projectSources, 3)
    assert.notEqual(restored.semanticGeneration, complete.semanticGeneration)
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    assert.deepEqual((await diagnostic(session, uri("Main.ets"), 1)).params.diagnostics, [])
    const response = await session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
      position: positionAt(sources["Main.ets"], sources["Main.ets"].lastIndexOf("neverQueried") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    const offset = currentTarget.indexOf("neverQueried")
    assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: positionAt(currentTarget, offset), end: positionAt(currentTarget, offset + "neverQueried".length),
    } }])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("ordinary query recertification cannot hide an unnotified missing-input module outside its old loaded membership",
  { timeout: 30_000 }, async t => {
    const { session, rootUri, workspace, sources, uri, events } = await startReadinessFixture(t,
      { ARKTS_SEMANTIC_QUEUE_TRACE: "1" })
    session.openDocument({ uri: uri("Main.ets"), version: 1, text: sources["Main.ets"] })
    const initial = await readiness(session, rootUri, true)
    assert.equal(initial.semanticState, "ready", JSON.stringify(initial))
    fs.writeFileSync(path.join(workspace, "Disconnected.ets"),
      "import type { Missing } from './AbsentInput'\nexport const unknown: Missing = 1\n")
    const edited = sources["Main.ets"] + "export const body = 2\n"
    session.changeDocument({ uri: uri("Main.ets"), version: 2, text: edited })
    const response = await session.request("textDocument/definition", { textDocument: { uri: uri("Main.ets") },
      position: positionAt(edited, edited.lastIndexOf("neverQueried") + 1) }, { timeoutMs: 5_000 })
    if (response.error) assert.equal(response.error.code, -32803, JSON.stringify(response))
    else assert.deepEqual(response.result, [{ uri: uri("Unopened.ets"), range: {
      start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
    } }])
    const current = await readiness(session, rootUri, false)
    assert.notEqual(current.semanticState, "ready", JSON.stringify(current))
    const certifications = events().filter(entry => entry.event === "semantic.readiness.query.certification.complete")
    if (!response.error) assert.equal(certifications.length, 1)
    assert.ok(certifications.every(receipt => receipt.documentVersion === 2
      && Object.hasOwn(receipt, "semanticState") === false
      && ["ready", "degraded", "unprepared"].includes(receipt.queryScopeSemanticState)),
    "internal query-snapshot state must not masquerade as the public root-readiness result")
    assert.ok(certifications.every(receipt => Number.isSafeInteger(receipt.queryScopeMembershipRevision)
      && receipt.queryScopeProjectSources === 2), "retain the original two-source query snapshot, not a relabelled current root")
    assert.equal(current.semanticGeneration, null)
    assert.deepEqual(current.readyCapabilities, [])
    const actualMissing = await readiness(session, rootUri, true)
    assert.equal(actualMissing.semanticState, "degraded", JSON.stringify(actualMissing))
    assert.equal(actualMissing.unavailableInput?.code, 2307)
    assert.equal(actualMissing.unavailableInput?.uri, uri("Disconnected.ets"))
    t.diagnostic(JSON.stringify({ qualification: "UNNOTIFIED_MISSING_INPUT_REMAINS_UNREADY_WITH_CERTIFICATION_OBSERVATION",
      certifications, currentReadiness: current, actualMissing }))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

async function initializeRoots(fixture, roots, expectedFiles) {
  const { session, sdk, events } = fixture
  const response = await session.request("initialize", { processId: process.pid, rootUri: roots[0],
    workspaceFolders: roots.map((uri, index) => ({ name: `root-${index}`, uri })),
    capabilities: session.capabilities, initializationOptions: { sdk: { path: sdk } },
  }, { timeoutMs: 10_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  session.initialized = true
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, message => message.params.value.kind === "end", 10_000)
  const catalog = events().find(e => e.event === "index.catalog.terminal")
  assert.equal(catalog?.phase, "ready")
  assert.equal(catalog.workspaceCount, roots.length)
  if (expectedFiles !== undefined) assert.equal(catalog.indexedFiles, expectedFiles)
}

async function readiness(session, rootUri, prepare) {
  const response = await session.request("arkts/semanticReadiness", { rootUri, prepare }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.rootUri, rootUri)
  return response.result
}

function diagnostic(session, uri, version) {
  return session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === version, 10_000)
}
