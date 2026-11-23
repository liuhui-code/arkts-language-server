import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-query-proof-"))
const entry = path.join(directory, "entry.ts"), output = path.join(directory, "driver.cjs")
fs.writeFileSync(entry, `export * from ${JSON.stringify(path.resolve("src/contracts/reference-query-proof.ts"))};\n`
  + ["reference-proof-consensus", "reference-result-cache", "reference-cache-admission", "reference-result-mapping", "reference-query-cache-proof", "reference-qualified-cache-coverage", "reference-completed-coverage"].map(name =>
    `export * from ${JSON.stringify(path.resolve("src/semantic/references", name + ".ts"))};`).join("\n"))
fs.appendFileSync(entry, `\nexport * from ${JSON.stringify(path.resolve("src/project/loaded-configuration-witness.ts"))};` )
fs.appendFileSync(entry, `\nexport { assertSemanticReadinessResponse } from ${JSON.stringify(path.resolve("src/semantic/semantic-readiness-wire.ts"))};` )
buildSync({ entryPoints: [entry], bundle: true, platform: "node", target: "node20", format: "cjs", outfile: output, define: { ARKTS_COMPILER_ARTIFACT_IDENTITY: JSON.stringify({ compilerSha256: "b".repeat(64) }) } })
const { readReferenceQueryProof, ReferenceProofConsensus, ReferenceResultCache, cachedReferenceResult, referenceCacheAdmission, assertSemanticReadinessResponse, publicReferenceResult, LoadedConfigurationWitness, queryCacheProof, matchesQueryCacheProof, readQualifiedReferenceCacheCoverage, completedReferenceCoverage } = createRequire(import.meta.url)(output)
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))
const proof = () => ({ version: 1, coverage: "lexical-block", path: "/workspace/Main.ets",
  sourceSha256: "a".repeat(64), compilerSha256: "b".repeat(64), declarationStart: 30,
  scopeStart: 20, scopeEnd: 60, includeDeclaration: true })

test("a receipt decoder admits only its exact coverage/schema and owns an immutable copy", () => {
  const original = proof(), decoded = readReferenceQueryProof(original)
  assert.deepEqual(decoded, original)
  original.scopeEnd = 99
  assert.equal(decoded.scopeEnd, 60)
  assert.equal(Object.isFrozen(decoded), true)
})

test("malformed or broader receipt domains cannot acquire lexical cache eligibility", () => {
  for (const edit of [{ version: 2 }, { coverage: "all-projects" }, { sourceSha256: "old" },
    { includeDeclaration: "true" }, { declarationStart: 60 }, { scopeStart: -1 }, { scopeEnd: 2.5 },
    { extra: "unvalidated" }]) assert.equal(readReferenceQueryProof({ ...proof(), ...edit }), undefined)
  let evaluated = false
  const accessor = proof()
  Object.defineProperty(accessor, "path", { get() { evaluated = true; return "/workspace/Main.ets" } })
  assert.equal(readReferenceQueryProof(accessor), undefined)
  assert.equal(evaluated, false)
  assert.equal(readReferenceQueryProof(Object.assign(Object.create({ inherited: true }), proof())), undefined)
})

test("all batches must provide the same proof, including declaration policy", () => {
  const accepted = new ReferenceProofConsensus()
  accepted.observe(proof()); accepted.observe(proof())
  assert.deepEqual(accepted.value, proof())
  for (const changed of [undefined, { ...proof(), sourceSha256: "c".repeat(64) },
    { ...proof(), includeDeclaration: false }]) {
    const consensus = new ReferenceProofConsensus()
    consensus.observe(proof()); consensus.observe(changed); consensus.observe(proof())
    assert.equal(consensus.value, undefined, "a later valid batch cannot erase an earlier coverage gap")
  }
})


test("a cache reset during admission cannot revive the old entry through an identical new proof", async () => {
  const rootUri = "file:///workspace", namespace = { sha256: "n", diskSha256: "s", sources: 1 }
  const report = { rootUri, semanticState: "ready", semanticGeneration: "g", sourceNamespace: namespace,
    readyCapabilities: ["references:includeDeclaration=true"], coverage: { dependenciesComplete: true }, inputIdentity: { sha256: "i" } }
  const query = { document: { workspaceId: rootUri, uri: rootUri + "/Main.ets", version: 1, text: "x" },
    position: { line: 0, character: 0 }, includeDeclaration: true }
  const cache = new ReferenceResultCache(), answer = { status: "complete", references: [] }
  cache.set(query, answer, "g:i:n:s")
  let hits = 0
  const response = await cachedReferenceResult(query, cache, async () => {
    cache.clear() // owner/Worker lifetime ended while its old entry awaited admission
    cache.set(query, answer, "g:i:n:s")
    return report
  }, () => { hits++ })
  assert.equal(response, undefined)
  assert.equal(hits, 0)
})


test("resolver identity is optional for legacy transport but strict when present", () => {
  const rootUri = "file:///workspace", uuid = "00000000-0000-0000-0000-000000000000"
  const response = identity => ({ protocol: 1, epoch: 1, id: 1, appliedRevision: 0, documentVersion: null, ok: true,
    value: { rootUri, semanticState: "unprepared", semanticGeneration: null, readyCapabilities: [],
      unavailableReasons: [], unavailableInput: null, inputIdentity: null, coverage: null,
      sourceNamespace: { sha256: "a".repeat(64), sources: 1, diskSha256: "b".repeat(64), overlayOnly: false,
        ...(identity === undefined ? {} : { resolutionIdentity: identity }) } } })
  const validate = value => assertSemanticReadinessResponse(value, () => Error("invalid readiness"), rootUri, uri => uri === rootUri)
  assert.doesNotThrow(() => validate(response(undefined)))
  assert.doesNotThrow(() => validate(response(uuid + ":1")))
  for (const value of ["old", 1, uuid + ":-1", uuid + ":9007199254740992", uuid + ":01"]) {
    assert.throws(() => validate(response(value)), /invalid readiness/)
  }
})

test("full-program receipts own nested input facts and reject malformed or accessor evidence", () => {
  const original = { version: 1, coverage: "full-program", scope: "workspace", path: "/workspace/Main.ts",
    sourceSha256: "a".repeat(64), compilerSha256: "b".repeat(64), includeDeclaration: true,
    anchor: { path: "/workspace/Target.ts", start: 13, length: 6 },
    searchedPaths: ["/workspace/Main.ts", "/workspace/Target.ts"],
    facts: [{ filePath: "/workspace/Target.ts", identity: "original-load-identity", directoryOnly: false }] }
  const decoded = readReferenceQueryProof(original)
  assert.ok(decoded)
  original.facts[0].identity = "changed"
  original.searchedPaths.push("/unproved.ts")
  assert.equal(decoded.facts[0].identity, "original-load-identity")
  assert.equal(decoded.searchedPaths.length, 2)
  assert.equal(Object.isFrozen(decoded.facts[0]), true)
  for (const patch of [{ facts: [] }, { searchedPaths: [] }, { anchor: { path: "x", start: -1, length: 6 } },
    { facts: [{ filePath: "x", identity: "stamp", directoryOnly: "false" }] }])
    assert.equal(readReferenceQueryProof({ ...decoded, ...patch }), undefined)
  let invoked = false
  const bad = { ...decoded.facts[0] }
  Object.defineProperty(bad, "identity", { get() { invoked = true; return "stamp" } })
  assert.equal(readReferenceQueryProof({ ...decoded, facts: [bad] }), undefined)
  assert.equal(invoked, false)
})


test("optional large input receipts cannot exceed worker node budget or discard primary locations", () => {
  const receipt = { version: 1, coverage: "full-program", scope: "workspace", path: "/workspace/Main.ts",
    sourceSha256: "a".repeat(64), compilerSha256: "b".repeat(64), includeDeclaration: true,
    anchor: { path: "/workspace/Target.ts", start: 13, length: 6 }, searchedPaths: ["/workspace/Main.ts"],
    facts: Array.from({ length: 17_000 }, (_, i) => ({ filePath: `/x/${i}`, identity: "stamp", directoryOnly: false })) }
  const references = [{ path: "/workspace/Main.ts", range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } }]
  const result = publicReferenceResult(1, { status: "complete", references, queryProof: receipt })
  assert.equal(result.value.references.length, 1)
  assert.equal(result.value.queryProof, undefined)
})


test("completed Program receipts merge immutable input evidence, but conflicts and missing batches stay rejected", () => {
  const make = (file, identity = "original") => ({ version: 1, coverage: "full-program", scope: "program", path: "/workspace/Main.ts",
    sourceSha256: "a".repeat(64), compilerSha256: "b".repeat(64), includeDeclaration: true,
    anchor: { path: "/workspace/Target.ts", start: 13, length: 6 }, searchedPaths: [file],
    facts: [{ filePath: file, identity, directoryOnly: false }] })
  const first = make("/workspace/Main.ts"), second = make("/workspace/Target.ts")
  const merged = new ReferenceProofConsensus()
  merged.observe(first); merged.observe(second)
  assert.deepEqual(merged.value?.searchedPaths, ["/workspace/Main.ts", "/workspace/Target.ts"])
  assert.equal(merged.value.facts.length, 2)
  assert.equal(Object.isFrozen(merged.value.facts), true)
  const conflict = new ReferenceProofConsensus()
  conflict.observe(first)
  assert.throws(() => conflict.observe(make("/workspace/Main.ts", "changed")), /current workspace inputs/)
  for (const bad of [undefined, { ...second, includeDeclaration: false },
    { ...second, anchor: { ...second.anchor, start: 14 } }]) {
    const rejected = new ReferenceProofConsensus()
    rejected.observe(first); rejected.observe(bad); rejected.observe(second)
    assert.equal(rejected.value, undefined)
  }
})


test("candidate-scoped cache admission requires immutable complete index coverage bound to the current namespace", () => {
  const file = path.join(directory, "Main.ts"), text = "Target"
  fs.writeFileSync(file, text)
  const uri = pathToFileURL(file).href, root = pathToFileURL(directory).href
  const witness = new LoadedConfigurationWitness()
  witness.observe(file, () => fs.readFileSync(file, "utf8"))
  const facts = witness.captureConfigurationBeforeSourceReset(() => {}, () => false).facts
  const proof = { version: 1, coverage: "full-program", scope: "candidates", path: file,
    sourceSha256: createHash("sha256").update(text).digest("hex"), compilerSha256: "b".repeat(64), includeDeclaration: true,
    anchor: { path: file, start: 0, length: 6 }, searchedPaths: [file], facts }
  const query = { document: { uri, workspaceId: root, version: 1, text }, position: { line: 0, character: 1 }, includeDeclaration: true }
  const namespace = `owner:0:${"c".repeat(64)}:${"d".repeat(64)}`
  const coverage = { version: 1, qualification: { workspaceIdentity: "root", storeId: "store", factsDomain: "producer",
    head: 2, qualificationId: "receipt", input: { issuer: "issuer", revision: 3 }, scanComplete: true, rejected: 0,
    fingerprint: `arkts-complete-scan-v2:${"a".repeat(64)}:${"d".repeat(64)}` },
    uris: [uri], anchorUri: uri, anchorPosition: { line: 0, character: 0 }, declarationIdentity: "decl", digest: "e".repeat(64) }
  const result = { status: "complete", references: [], queryProof: proof }
  assert.equal(queryCacheProof(query, result, namespace), undefined)
  assert.equal(queryCacheProof(query, { ...result, queryProof: { ...proof, scope: "program" } }, namespace, coverage), undefined)
  const stored = queryCacheProof(query, result, namespace, coverage)
  assert.ok(stored)
  assert.equal(matchesQueryCacheProof(query, stored, namespace), true)
  assert.equal(matchesQueryCacheProof(query, stored, namespace + "changed"), false)
  assert.equal(queryCacheProof(query, result, namespace, { ...coverage,
    qualification: { ...coverage.qualification, fingerprint: `arkts-complete-scan-v2:${"a".repeat(64)}:${"f".repeat(64)}` } }), undefined)
  assert.equal(queryCacheProof(query, result, namespace, { ...coverage, uris: [uri, root + "/NotSearched.ts"] }), undefined)
  assert.equal(readQualifiedReferenceCacheCoverage({ ...coverage, qualification: { ...coverage.qualification, scanComplete: false } }), undefined)
  const copied = readQualifiedReferenceCacheCoverage(coverage)
  assert.ok(Object.isFrozen(copied.qualification.input) && Object.isFrozen(copied.uris))
  fs.writeFileSync(file, "Change")
  assert.equal(matchesQueryCacheProof(query, stored, namespace), false)
  assert.throws(() => queryCacheProof(query, result, namespace, coverage), error => error.code === "content-modified")
  return referenceCacheAdmission(query, async () => ({ rootUri: root, semanticState: "partial",
    unavailableReasons: ["sdk-inputs-incomplete"] })).then(admit =>
      assert.rejects(admit(result), error => error.code === "content-modified",
        "a missing namespace/cache eligibility cannot suppress a confirmed final input failure"))
})


test("candidate coverage requires actual compiler anchor verification; complete workspace search is independent", () => {
  const receipt = { version: 1, coverage: "full-program", scope: "program", path: "/w/Main.ts",
    sourceSha256: "a".repeat(64), compilerSha256: "b".repeat(64), includeDeclaration: true,
    anchor: { path: "/w/Target.ts", start: 13, length: 6 }, searchedPaths: ["/w/Main.ts", "/w/Target.ts"],
    facts: [{ filePath: "/w/Target.ts", identity: "load", directoryOnly: false }] }
  const workspace = { projectMembership: { status: "complete", paths: [...receipt.searchedPaths, "/w/Unrelated.ts"] }, documents: [] }
  assert.equal(completedReferenceCoverage(receipt, workspace, receipt.path, receipt.searchedPaths, true, false), undefined)
  assert.equal(completedReferenceCoverage(receipt, workspace, receipt.path, receipt.searchedPaths, true, true)?.scope, "candidates")
  assert.equal(completedReferenceCoverage(receipt, { ...workspace, projectMembership: { status: "complete", paths: receipt.searchedPaths } }, receipt.path, undefined, false, false)?.scope, "workspace")
})
