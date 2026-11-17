import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-namespace-admission-"))
buildSync({ entryPoints: ["src/semantic/references/reference-namespace-admission.ts"],
  bundle: true, platform: "node", target: "node20", format: "cjs", outfile: path.join(directory, "driver.cjs") })
const { ReferenceNamespaceAdmission } = createRequire(import.meta.url)(path.join(directory, "driver.cjs"))
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
