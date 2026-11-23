import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

const sorted = values => values.map(value => JSON.stringify(value)).sort()
test("SDK partial can cache a compiler-proven closed lexical reference query", { timeout: 30_000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, { ARKTS_REFERENCES_TRACE: "1",
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/reference-query-cache-audit.cjs"))}` })
  for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
  const main = "// 🧪输入身份\nexport function run() {\n  let local = 1;\n  return local + local\n}\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  await initializeReadinessFixture(f, 1)
  assert.equal(f.initialPreparation.semanticState, "partial")
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(main, main.indexOf("local") + 1), context: { includeDeclaration: true } }
  const expected = [...main.matchAll(/local/g)].map(match => ({ uri, range: {
    start: positionAt(main, match.index), end: positionAt(main, match.index + 5) } }))
  const first = await f.session.request("textDocument/references", params)
  assert.equal(first.error, undefined, JSON.stringify(first))
  assert.deepEqual(sorted(first.result), sorted(expected))
  const before = f.events(), batches = before.filter(e => e.event === "references.batch.start").length
  const audit = () => fs.readFileSync(path.join(f.directory, "reference-query-work.ndjson"), "utf8").trim().split("\n").map(JSON.parse)
  const programs = audit().filter(e => e.event === "program-created").length
  const workers = audit().filter(e => e.event === "worker-created").length
  assert.ok(programs > 0 && workers > 0, "calibrate against actual compiler/Worker work, not absent metrics")
  const repeat = await f.session.request("textDocument/references", params)
  assert.equal(repeat.error, undefined, JSON.stringify(repeat))
  assert.deepEqual(sorted(repeat.result), sorted(expected))
  const after = f.events()
  assert.equal(audit().filter(e => e.event === "program-created").length, programs)
  assert.equal(audit().filter(e => e.event === "worker-created").length, workers)
  assert.equal(after.filter(e => e.event === "references.cache.store").length, 1,
    "a closed query needs its own completeness proof, not a globally READY SDK")
  assert.equal(after.filter(e => e.event === "references.cache.hit").length, 1)
  for (const e of after.filter(e => ["references.cache.hit", "references.cache.store"].includes(e.event))) {
    assert.equal(e.proofKind, "query-qualified")
    assert.equal(e.proofVersion, 1)
    assert.equal(e.coverageKind, "lexical-block")
  }
  assert.equal(after.filter(e => e.event === "references.batch.start").length, batches,
    "a proven cache hit must not dispatch reference verifier batches")
  const edited = main.replace("return local + local", "return local + local + local")
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), edited)
  // No watch notification: bytes remain authoritative even for an existing entry.
  const changed = await f.session.request("textDocument/references", params)
  assert.equal(changed.error, undefined, JSON.stringify(changed))
  const expectedEdited = [...edited.matchAll(/local/g)].map(match => ({ uri, range: {
    start: positionAt(edited, match.index), end: positionAt(edited, match.index + 5) } }))
  assert.deepEqual(sorted(changed.result), sorted(expectedEdited))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1,
    "an unnotified file edit must not publish the old cached answer")
  const again = await f.session.request("textDocument/references", params)
  assert.deepEqual(sorted(again.result), sorted(expectedEdited))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 2)
  const usesOnly = await f.session.request("textDocument/references", {
    ...params, context: { includeDeclaration: false } })
  assert.equal(usesOnly.error, undefined, JSON.stringify(usesOnly))
  assert.deepEqual(sorted(usesOnly.result), sorted(expectedEdited.slice(1)))
  const hitsBeforePolicyRepeat = f.events().filter(e => e.event === "references.cache.hit").length
  const usesRepeat = await f.session.request("textDocument/references", {
    ...params, context: { includeDeclaration: false } })
  assert.deepEqual(sorted(usesRepeat.result), sorted(expectedEdited.slice(1)))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, hitsBeforePolicyRepeat + 1)
  const hitsBeforeWatch = f.events().filter(e => e.event === "references.cache.hit").length
  const unrelated = f.uri(`${folder}/Unrelated.ts`)
  fs.writeFileSync(path.join(sourceRoot, "Unrelated.ts"), "export const unrelated = 1\n")
  f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: unrelated, type: 1 }] } })
  const afterWatch = await f.session.request("textDocument/references", params)
  assert.equal(afterWatch.error, undefined, JSON.stringify(afterWatch))
  assert.deepEqual(sorted(afterWatch.result), sorted(expectedEdited))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, hitsBeforeWatch,
    "first implementation retains root-wide invalidation even for a disjoint file")
  const stillPartial = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
  assert.equal(stillPartial.result?.semanticState, "partial", "cache eligibility must not promote global SDK readiness")
  const hitsBeforeConfig = f.events().filter(e => e.event === "references.cache.hit").length
  const buildProfile = path.join(f.workspace, "build-profile.json5")
  fs.writeFileSync(buildProfile, fs.readFileSync(buildProfile, "utf8").replace("unmapped-sdk-alias", "different-sdk-alias"))
  let recovered = false
  for (let attempt = 0; attempt < 2; attempt++) {
    const afterConfig = await f.session.request("textDocument/references", params)
    if (afterConfig.error) {
      assert.equal(attempt, 0, "only the original invalidated request may be refused")
      assert.equal(afterConfig.error.code, -32803, JSON.stringify(afterConfig))
      continue
    }
    assert.deepEqual(sorted(afterConfig.result), sorted(expectedEdited))
    assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, hitsBeforeConfig,
      "a silent target/configuration replacement cannot reuse the previous input receipt")
    recovered = true
    break
  }
  assert.equal(recovered, true, "same-session query must recover with a new proof after configuration changes")
  const readiness = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: true })
  assert.equal(readiness.result?.semanticState, "partial", "repaired preparation still reports the actual SDK qualification")
  const afterPreparation = await f.session.request("textDocument/references", params)
  assert.equal(afterPreparation.error, undefined, JSON.stringify(afterPreparation))
  assert.deepEqual(sorted(afterPreparation.result), sorted(expectedEdited))
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, hitsBeforeConfig,
    "repreparing the changed environment must not revive its previous cache receipt")
  t.diagnostic(JSON.stringify({ firstHitProgramCount: programs, firstHitWorkerCount: workers,
    readiness: readiness.result.semanticState, cache: f.events().filter(e => e.event.startsWith("references.cache."))
      .map(({ event, proofKind, proofVersion, coverageKind, reason }) => ({ event, proofKind, proofVersion, coverageKind, reason })) }))
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

for (const shorthand of [false, true]) test(
  `SDK partial does not cache an unproved ${shorthand ? "shorthand property linkage" : "cross-file class"}`,
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
    const main = shorthand ? "export function run() { let local = 1; return { local } }\n"
      : 'import { Target } from "./Target"\nexport const use = new Target()\n'
    const target = "export class Target extends MissingSdkBase {}\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
    if (!shorthand) fs.writeFileSync(path.join(sourceRoot, "Target.ts"), target)
    await initializeReadinessFixture(f, shorthand ? 1 : 2)
    const uri = f.uri(`${folder}/Main.ets`), name = shorthand ? "local" : "Target"
    const range = (text, start, size) => ({ start: positionAt(text, start), end: positionAt(text, start + size) })
    const offsets = shorthand ? [...main.matchAll(/local/g)].map(match => match.index)
      : [main.indexOf("Target"), main.lastIndexOf("Target")]
    const expected = offsets.map(offset => ({ uri, range: range(main, offset, name.length) }))
    if (!shorthand) expected.push({ uri: f.uri(`${folder}/Target.ts`), range: range(target, target.indexOf("Target"), 6) })
    const params = { textDocument: { uri }, position: positionAt(main, main.indexOf(name) + 1),
      context: { includeDeclaration: true } }
    for (let i = 0; i < 2; i++) {
      const response = await f.session.request("textDocument/references", params)
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(sorted(response.result), sorted(expected))
    }
    assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 0)
    assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 0)
    assert.equal(f.events().filter(e => e.event === "references.lexical-probe.complete").length, 0)
    if (shorthand) assert.equal(f.events().filter(e => e.event === "references.lexical-probe.refused").length, 2)
    else assert.equal(f.events().filter(e => e.event === "references.lexical-probe.start").length, 0)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("a proved non-escaping binding covers the omitted files without dispatching their batches",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
      ARKTS_BENCHMARK_CONTROL: "1", ARKTS_REFERENCES_BATCH_ROOTS: "1" })
    for (const name of fs.readdirSync(sourceRoot)) fs.unlinkSync(path.join(sourceRoot, name))
    const main = "export function run() { let local = 1; return local + local }\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
    for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(sourceRoot, `Noise${i}.ts`), `export const noise${i} = 0\n`)
    await initializeReadinessFixture(f, 5)
    const uri = f.uri(`${folder}/Main.ets`)
    const response = await f.session.request("textDocument/references", { textDocument: { uri },
      position: positionAt(main, main.indexOf("local") + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted([...main.matchAll(/local/g)].map(match => ({ uri, range: {
      start: positionAt(main, match.index), end: positionAt(main, match.index + 5) } }))))
    const completed = f.events().filter(e => e.event === "references.batch.complete")
    t.diagnostic(JSON.stringify({ batches: completed.length, plans: f.events().filter(e => e.event === "references.plan.complete") }))
    assert.equal(completed.length, 0, "a proved lexical probe omits every conservative batch")
    assert.equal(f.events().filter(e => e.event === "references.lexical-probe.complete").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

test("default batching proves a closed binding before building unrelated root Programs",
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, { ARKTS_REFERENCES_TRACE: "1" })
    const main = "export function run() { let isolated = 1; return isolated + isolated }\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
    await initializeReadinessFixture(f, 100)
    const uri = f.uri(`${folder}/Main.ets`)
    const response = await f.session.request("textDocument/references", { textDocument: { uri },
      position: positionAt(main, main.indexOf("isolated") + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted([...main.matchAll(/isolated/g)].map(match => ({ uri, range: {
      start: positionAt(main, match.index), end: positionAt(main, match.index + 8) } }))))
    const probe = f.events().find(e => e.event === "references.lexical-probe.complete")
    assert.ok(probe, "compiler lexical coverage must be proved before conservative batching")
    assert.equal(probe.batchRootFiles, 1)
    assert.equal(probe.locations, 3)
    assert.equal(f.events().filter(e => e.event === "references.batch.start").length, 0)
    assert.ok(f.events().some(e => e.event === "references.cache.store" && e.coverageKind === "lexical-block"))
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const form of ["modifier", "alias"]) test(`semantic-error export ${form} inside a function cannot certify closed lexical coverage`,
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    const main = form === "modifier" ? "export function run() { export let isolated = 1; return isolated + isolated }\n"
      : "export function run() { let isolated = 1; export { isolated }; return isolated + isolated }\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
    await initializeReadinessFixture(f, 100)
    const uri = f.uri(`${folder}/Main.ets`)
    const response = await f.session.request("textDocument/references", { textDocument: { uri },
      position: positionAt(main, main.indexOf("isolated") + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted([...main.matchAll(/isolated/g)].map(match => ({ uri, range: {
      start: positionAt(main, match.index), end: positionAt(main, match.index + 8) } }))))
    assert.equal(f.events().filter(e => e.event === "references.lexical-probe.complete").length, 0,
      "the parser accepts invalid export modifiers without parse diagnostics; lexical eligibility must reject them")
    assert.equal(f.events().filter(e => e.event === "references.cache.store").length, 0)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const role of ["object-binding", "property-key", "property-access"]) test(
  `local verification selects binding expressions, not a same-name ${role}`, { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    const main = "export function run(){ let isolated = 1; const object = { isolated: 2 }; return object.isolated }\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
    await initializeReadinessFixture(f, 100)
    const property = main.indexOf("isolated", main.indexOf("isolated") + 8)
    const offsets = role === "object-binding" ? [main.indexOf("object"), main.lastIndexOf("object")]
      : [property, main.lastIndexOf("isolated")]
    const query = role === "property-access" ? offsets[1] : offsets[0]
    const uri = f.uri(`${folder}/Main.ets`), response = await f.session.request("textDocument/references", {
      textDocument: { uri }, position: positionAt(main, query + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted(offsets.map(offset => ({ uri, range: {
      start: positionAt(main, offset), end: positionAt(main, offset + (role === "object-binding" ? 6 : 8)) } }))))
    const probes = f.events().filter(e => e.event === "references.lexical-probe.start")
    assert.equal(probes.length, Number(role === "object-binding"), "property syntax must not trigger an unrelated local Program")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })

for (const uniqueSymbol of [false, true]) test(
  `a closed computed-key binding preserves the complete-program escape control (symbol=${uniqueSymbol})`,
  { timeout: 30_000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
    const main = uniqueSymbol
      ? 'export function run(){ const isolated=Symbol(); return { key: isolated, value: {[isolated]:1} } }\n'
      : 'export function run(){ const isolated="selected"; return {[isolated]:1} }\n'
    const use = uniqueSymbol ? 'import {run} from "./Main"; const out=run(); export const value=out.value[out.key]\n'
      : 'import {run} from "./Main"; export const value=run().selected\n'
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
    fs.writeFileSync(path.join(sourceRoot, "Use.ts"), use)
    await initializeReadinessFixture(f, 101)
    const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
      position: positionAt(main, main.indexOf("isolated") + 1), context: { includeDeclaration: true } }
    const expected = [...main.matchAll(/isolated/g)].map(match => ({ uri, range: {
      start: positionAt(main, match.index), end: positionAt(main, match.index + 8) } }))
    for (let i = 0; i < 2; i++) {
      const response = await f.session.request("textDocument/references", params)
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(sorted(response.result), sorted(expected))
    }
    assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, 1)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
