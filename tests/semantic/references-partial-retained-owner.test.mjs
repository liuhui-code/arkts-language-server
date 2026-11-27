import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"

const sorted = values => values.map(value => JSON.stringify(value)).sort()

for (const residentFirst of [undefined, "0"]) test(
  `project-domain partial SDK references retain their module LS across edit and undo (resident-first=${residentFirst ?? "default"})`,
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    ARKTS_REFERENCES_RESIDENT_FIRST: residentFirst,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/partial-reference-owner-audit.cjs"))}`,
  })
  try {
    for (const name of ["Main.ets", "Global.ets", "Augment.ets", "Box.ets"]) fs.unlinkSync(path.join(sourceRoot, name))
    const original = "declare namespace RetentionFixture {}\n// 🧪 precise original positions\nexport function run() {\n  let local = 1;\n  return local + local;\n}\n"
    fs.writeFileSync(path.join(sourceRoot, "Main.ets"), original)
    await initializeReadinessFixture(f, 97)
    assert.equal(f.initialPreparation.semanticState, "partial")
    const uri = f.uri(`${folder}/Main.ets`)
    const params = { textDocument: { uri }, position: positionAt(original, original.indexOf("local") + 1),
      context: { includeDeclaration: true } }
    const audit = () => fs.readFileSync(path.join(f.directory, "partial-reference-work.ndjson"), "utf8")
      .trim().split("\n").filter(Boolean).map(JSON.parse)
    const services = () => audit().filter(e => e.event === "service-created")
    const query = async text => {
      const response = await f.session.request("textDocument/references", params)
      assert.equal(response.error, undefined, JSON.stringify(response))
      const expected = [...text.matchAll(/local/g)].map(match => ({ uri, range: {
        start: positionAt(text, match.index), end: positionAt(text, match.index + 5) } }))
      assert.deepEqual(sorted(response.result), sorted(expected))
    }
    f.session.openDocument({ uri, version: 1, text: original })
    await query(original)
    const before = services().length
    assert.ok(before > 0, "calibrate genuine compiler LS construction")
    const edited = original.replace("return local + local", "return local + local + local")
    f.session.changeDocument({ uri, version: 2, text: edited })
    await query(edited)
    f.session.changeDocument({ uri, version: 3, text: original })
    await query(original)
    assert.equal(services().length, before, "edits must update the existing LS, not construct another project LS")
    assert.ok(!audit().some(e => e.runtime === "reference-verifier-worker.cjs"),
      "a compiler-proven module-local query must not fall back to the SDK-only verifier")
    assert.ok(audit().some(e => e.event === "program-created" && e.oldProgramProvided),
      "observe actual incremental compiler synchronization, not just a retained Worker label")
    const observations = f.events().filter(e => e.event === "semantic.references.complete")
    assert.equal(observations.length, 3)
    assert.ok(observations[0].sdkSourceFiles > 0, "calibrate actual SDK SourceFile observation")
    for (const observation of observations.slice(1)) assert.equal(observation.sdkSourceFilesReused, observation.sdkSourceFiles,
      "unchanged SDK AST identities must survive each edit and undo, not only the LS wrapper")
    assert.equal(f.events().filter(e => e.event === "references.queue.start").length, 3,
      "each cache miss gets one owner-admission job, including the explicit no-resident-first policy")
    assert.equal(f.events().filter(e => e.event === "references.plan.complete").length, 0,
      "closed references must not build an unused full-workspace plan")
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  } finally {
    const evidence = process.env.ARKTS_OWNER_TEST_EVIDENCE
      && path.join(process.env.ARKTS_OWNER_TEST_EVIDENCE, residentFirst ?? "default")
    if (evidence) {
      fs.mkdirSync(evidence, { recursive: true })
      fs.copyFileSync(path.join(f.directory, "logs/server.log"), path.join(evidence, "server.log"))
      fs.copyFileSync(path.join(f.directory, "partial-reference-work.ndjson"), path.join(evidence, "work.ndjson"))
      fs.writeFileSync(path.join(evidence, "transport.json"), JSON.stringify(f.session.transport.diagnosticSnapshot(), null, 2))
    }
  }
})


test("partial SDK retained lexical answers do not survive a change to shorthand linkage", { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
  })
  const original = "export function run() { let local = 1; return local + local }\n"
  const edited = "export function run() { let local = 1; return { local } }\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), original)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  f.session.openDocument({ uri, version: 1, text: original })
  const query = async text => {
    const response = await f.session.request("textDocument/references", { textDocument: { uri },
      position: positionAt(text, text.indexOf("local") + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted([...text.matchAll(/local/g)].map(match => ({ uri, range: {
      start: positionAt(text, match.index), end: positionAt(text, match.index + 5) } }))))
  }
  await query(original)
  const hits = f.events().filter(e => e.event === "references.source-owner.complete").length
  assert.equal(hits, 1)
  const queries = f.events().filter(e => e.event === "references.compiler-query.start").length
  f.session.changeDocument({ uri, version: 2, text: edited })
  await query(edited)
  assert.equal(f.events().filter(e => e.event === "references.compiler-query.start").length - queries, 1,
    "unproved coverage must not repeat the same retained compiler attempt in the fallback")
  assert.equal(f.events().filter(e => e.event === "references.source-owner.complete").length, hits,
    "a previous lexical receipt cannot certify shorthand binding/property linkage")
  const readiness = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
  assert.equal(readiness.result.semanticState, "partial")
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})


test("a non-local symbol does not prepare the whole workspace for a failed lexical attempt", { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
  })
  const main = "export class Target {}\nexport const use = new Target()\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  const response = await f.session.request("textDocument/references", { textDocument: { uri },
    position: positionAt(main, main.indexOf("Target") + 1), context: { includeDeclaration: true } })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(sorted(response.result), sorted([...main.matchAll(/Target/g)].map(match => ({ uri, range: {
    start: positionAt(main, match.index), end: positionAt(main, match.index + 6) } }))))
  assert.equal(f.events().filter(e => e.event === "references.search.document-prepare.complete").length, 1,
    "a rejected lexical hint must not add another global preparation to the original fallback")
  const events = f.events()
  const selected = events.findIndex(e => e.event === "references.candidate-selection.complete")
  assert.ok(selected >= 0)
  assert.equal(events.slice(0, selected).filter(e => e.event === "references.queue.start").length, 1,
    "an initialized root retains its original retained probe, but must not add a lexical probe")
  assert.equal(events.filter(e => e.event === "references.lexical-owner.complete").length, 0)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})


test("retained local references reject stale bytes even when size and mtime are preserved", { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
  })
  const original = "export function run() { let local = 1; return local + local }\n"
  const edited = original.replace("local + local", "local + 11111")
  const file = path.join(sourceRoot, "Main.ets")
  fs.writeFileSync(file, original)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(original, original.indexOf("local") + 1), context: { includeDeclaration: true } }
  const query = async text => {
    const response = await f.session.request("textDocument/references", params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted([...text.matchAll(/local/g)].map(match => ({ uri, range: {
      start: positionAt(text, match.index), end: positionAt(text, match.index + 5) } }))))
  }
  await query(original)
  await query(original)
  const hits = f.events().filter(e => e.event === "references.cache.hit").length
  assert.equal(hits, 1, "calibrate genuine query-qualified cache reuse")
  const before = fs.statSync(file)
  assert.equal(Buffer.byteLength(edited), before.size)
  fs.writeFileSync(file, edited)
  fs.utimesSync(file, before.atime, before.mtime)
  await query(edited)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, hits,
    "mtime/size do not authorize stale bytes or a previous lexical receipt")
  await query(edited)
  assert.equal(f.events().filter(e => e.event === "references.cache.hit").length, hits + 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})


for (const [form, name, body] of [
  ["Unicode", "局部", "let 局部 = 1; return 局部 + 局部"],
  ["keyword comment", "local", "let /* a declaration comment */ local = 1; return local + local"],
  ["multiple bindings", "local", "let other = 0, local = 1; return local + local"],
]) test(`source routing hint preserves exact partial-SDK references for ${form}`, { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
  })
  const main = `export function run() { ${body} }\n`
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  const response = await f.session.request("textDocument/references", { textDocument: { uri },
    position: positionAt(main, main.indexOf(name) + 1), context: { includeDeclaration: true } })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(sorted(response.result), sorted([...main.matchAll(new RegExp(name, "gu"))].map(match => ({ uri, range: {
    start: positionAt(main, match.index), end: positionAt(main, match.index + name.length) } }))))
  if (form === "Unicode") assert.equal(f.events().filter(e => e.event === "references.source-owner.complete").length, 1,
    "the cheap parent hint must preserve direct Unicode binding reuse")
  const readiness = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: false })
  assert.equal(readiness.result.semanticState, "partial")
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("a declaration-looking comment cannot certify a class as a closed lexical binding", { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
  })
  const main = "// let Target is only comment text\nexport class Target {}\nexport const use = new Target()\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), main)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`), offsets = [main.indexOf("class Target") + 6, main.lastIndexOf("Target")]
  const response = await f.session.request("textDocument/references", { textDocument: { uri },
    position: positionAt(main, offsets[0] + 1), context: { includeDeclaration: true } })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(sorted(response.result), sorted(offsets.map(offset => ({ uri, range: {
    start: positionAt(main, offset), end: positionAt(main, offset + 6) } }))))
  assert.equal(f.events().filter(e => e.event === "references.lexical-owner.complete").length, 0,
    "a parent text match is not a compiler completeness receipt")
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})
