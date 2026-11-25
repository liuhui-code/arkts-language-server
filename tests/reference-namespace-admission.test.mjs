import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-namespace-admission-"))
const entry = path.join(directory, "entry.ts")
fs.writeFileSync(entry, ["reference-namespace-admission", "reference-index-freshness"].map(name =>
  `export * from ${JSON.stringify(path.resolve("src/semantic/references", name + ".ts"))}`).join("\n"))
buildSync({ entryPoints: [entry],
  bundle: true, platform: "node", target: "node20", format: "cjs", outfile: path.join(directory, "driver.cjs") })
const { ReferenceNamespaceAdmission, ReferenceIndexFreshness } = createRequire(import.meta.url)(path.join(directory, "driver.cjs"))
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))

test("namespace admission keeps comparison history without authorizing an absent current content proof", async () => {
  const rootUri = "file:///workspace", old = "a".repeat(64), changed = "b".repeat(64), names = "c".repeat(64)
  const report = sourceNamespace => ({ rootUri, semanticState: "degraded", semanticGeneration: null,
    readyCapabilities: [], unavailableReasons: ["test-input-unavailable"], unavailableInput: null,
    inputIdentity: null, coverage: null, ...(sourceNamespace === undefined ? {} : { sourceNamespace }) })
  let current, invalidations = [], reconciles = []
  const admission = new ReferenceNamespaceAdmission(async () => current,
    (...args) => invalidations.push(args), (...args) => reconciles.push(args))
  const read = async namespace => {
    current = report(namespace)
    await admission.read({ rootUri, prepare: false, captureSourceInputs: "cache" })
  }
  await read({ sha256: names, sources: 2, diskSha256: old, overlayOnly: false })
  assert.equal(admission.diskFingerprint(rootUri), old)
  await read({ sha256: names, sources: 2 })
  assert.equal(admission.diskFingerprint(rootUri), undefined, "an earlier proof is not a current narrowing authority")
  assert.deepEqual(invalidations, [], "absence alone does not prove an actual content change")
  await read({ sha256: names, sources: 2, diskSha256: old, overlayOnly: false })
  assert.equal(admission.diskFingerprint(rootUri), old)
  assert.deepEqual(invalidations, [])
  await read(undefined)
  assert.equal(admission.diskFingerprint(rootUri), undefined, "an unavailable complete scope withdraws current authority")
  await read({ sha256: names, sources: 2, diskSha256: changed, overlayOnly: false })
  assert.deepEqual(invalidations, [[rootUri, "content"]], "original comparison history still detects real changes")
  assert.deepEqual(reconciles, [[rootUri, "content"]])
  await read({ sha256: names, sources: 2, diskSha256: changed, overlayOnly: false })
  assert.equal(reconciles.length, 1)
  await read({ sha256: "d".repeat(64), sources: 3 })
  assert.equal(admission.diskFingerprint(rootUri), undefined)
  assert.deepEqual(invalidations.at(-1), [rootUri, "namespace"])
  assert.deepEqual(reconciles.at(-1), [rootUri, "namespace"])
  admission.clear()
  assert.equal(admission.diskFingerprint(rootUri), undefined)
})


function qualifiedStatus(hash = "b".repeat(64)) {
  const snapshot = { workspaceIdentity: "file:///workspace", storeId: "data.db", factsDomain: "facts", head: 2 }
  return { state: "ready", committedGeneration: 2, indexProof: { format: "versioned", snapshot,
    qualification: { ...snapshot, qualificationId: "q2", input: { issuer: "owner", revision: 2 },
      scanComplete: true, rejected: 0, fingerprint: `arkts-complete-scan-v2:${"d".repeat(64)}:${hash}` } } }
}

test("an exact current versioned source qualification settles dirty input without another generation", async () => {
  const freshness = new ReferenceIndexFreshness(), root = "file:///workspace", status = qualifiedStatus()
  const index = { status: async () => status }
  freshness.changed(root, index)
  assert.equal(freshness.isDirty(root), true)
  assert.equal(await freshness.confirmsCurrentSources(root, index, "b".repeat(64)), true)
  assert.equal(freshness.isDirty(root), false)
})

test("unknown legacy stale or inconsistent qualifications never settle current dirty input", async () => {
  const original = qualifiedStatus(), cases = []
  const copy = () => structuredClone(original)
  cases.push({ state: "ready", committedGeneration: 2 })
  const legacy = copy(); legacy.indexProof = { format: "legacy", snapshot: null, qualification: null }; cases.push(legacy)
  const warming = copy(); warming.state = "warming"; cases.push(warming)
  const missing = copy(); missing.indexProof.qualification = null; cases.push(missing)
  const rejected = copy(); rejected.indexProof.qualification.rejected = 1; cases.push(rejected)
  const incomplete = copy(); incomplete.indexProof.qualification.scanComplete = false; cases.push(incomplete)
  const head = copy(); head.committedGeneration = 3; cases.push(head)
  for (const field of ["workspaceIdentity", "storeId", "factsDomain", "head"]) {
    const different = copy(); different.indexProof.snapshot[field] = field === "head" ? 3 : "different"; cases.push(different)
  }
  const stale = copy(); stale.indexProof.qualification.fingerprint = `arkts-complete-scan-v2:${"d".repeat(64)}:${"e".repeat(64)}`; cases.push(stale)
  const unsupported = copy(); unsupported.indexProof.qualification.fingerprint = `arkts-complete-scan-v1:${"b".repeat(64)}`; cases.push(unsupported)
  for (const status of cases) {
    const freshness = new ReferenceIndexFreshness(), index = { status: async () => status }
    freshness.changed("file:///workspace", index)
    assert.equal(await freshness.confirmsCurrentSources("file:///workspace", index, "b".repeat(64)), false)
    assert.equal(freshness.isDirty("file:///workspace"), true)
  }
})

test("a superseding dirty owner cannot be cleared by an earlier pending status observation", async () => {
  const freshness = new ReferenceIndexFreshness(), root = "file:///workspace", status = qualifiedStatus()
  let release, calls = 0
  const gate = new Promise(resolve => { release = resolve })
  const index = { status: () => calls++ === 1 ? gate : Promise.resolve(status) }
  freshness.changed(root, index)
  const checking = freshness.confirmsCurrentSources(root, index, "b".repeat(64))
  freshness.changed(root, index)
  release(status)
  assert.equal(await checking, false)
  assert.equal(freshness.isDirty(root), true)
})

test("cancelling the qualification subscriber preserves dirty state and forwards its signal", async () => {
  const freshness = new ReferenceIndexFreshness(), root = "file:///workspace", status = qualifiedStatus()
  const controller = new AbortController(); let release, received
  const index = { status: (_root, signal) => signal ? (received = signal, new Promise(resolve => { release = resolve })) : Promise.resolve(status) }
  freshness.changed(root, index)
  const checking = freshness.confirmsCurrentSources(root, index, "b".repeat(64), controller.signal)
  controller.abort(new Error("cancelled qualification")); release(status)
  assert.equal(await checking, false)
  assert.equal(received, controller.signal)
  assert.equal(freshness.isDirty(root), true)
})

test("cancelled admission never reconciles after its current-index observation finishes", async () => {
  const rootUri = "file:///workspace", names = "c".repeat(64), controller = new AbortController(), reconciles = []
  let digest = "a".repeat(64)
  const admission = new ReferenceNamespaceAdmission(async () => ({ rootUri,
    sourceNamespace: { sha256: names, sources: 1, diskSha256: digest, overlayOnly: false } }),
    () => {}, (...args) => reconciles.push(args), async () => { controller.abort(new Error("subscriber cancelled")); return true })
  await admission.read({ rootUri })
  digest = "b".repeat(64)
  await assert.rejects(admission.read({ rootUri, signal: controller.signal }), /subscriber cancelled/)
  assert.deepEqual(reconciles, [])
})
