import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-proof-contract-"))
const output = path.join(root, "proof.mjs")
try {
  buildSync({ entryPoints: [new URL("../src/index/versioned-index-proof.ts", import.meta.url).pathname],
    outfile: output, bundle: true, platform: "node", format: "esm" })
} catch (error) {
  fs.rmSync(root, { recursive: true, force: true })
  throw error
}
const proof = await import(pathToFileURL(output).href)
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }))
const input = { issuer: "window-a", revision: 2 }
const snapshot = { workspaceIdentity: "file:///project", storeId: "physical-a", factsDomain: "facts-v1", head: 7 }
const expected = { workspaceIdentity: snapshot.workspaceIdentity, factsDomain: snapshot.factsDomain, input }
const qualification = { ...snapshot, qualificationId: "q-2", input, scanComplete: true,
  rejected: 0, fingerprint: "complete-input-fingerprint" }
const read = () => ({ format: "versioned", snapshot: { ...snapshot },
  qualification: structuredClone(qualification), servedGeneration: 7, completeness: "ready" })
const terminal = () => ({ protocol: 1, event: "maintenance/terminal", attemptId: "attempt-2",
  input: { ...input }, phase: "completed", outcome: "qualified", dataPublished: true,
  currentInput: true, indexedDocuments: 128, writtenDocuments: 1, factRowsWritten: 10, reusedDocuments: 127,
  qualification: structuredClone(qualification) })

function rejectsMutation(factory, mutate, decode) {
  const value = factory()
  mutate(value)
  assert.throws(() => decode(value), { name: "SidecarProtocolError" })
}

test("read proof binds complete qualification to the same physical snapshot and exact input", () => {
  const result = proof.decodeReadProof(read(), expected)
  assert.deepEqual(result, { format: "versioned", snapshot, qualification })
  for (const field of ["workspaceIdentity", "storeId", "factsDomain", "head"]) {
    rejectsMutation(read, value => { value.qualification[field] = field === "head" ? 8 : "other" },
      value => proof.decodeReadProof(value, expected))
  }
  for (const mutate of [
    v => { v.snapshot.workspaceIdentity = "file:///another" },
    v => { v.snapshot.factsDomain = "other-producer" },
    v => { v.servedGeneration = 8 },
    v => { v.qualification.input.revision = 1 },
    v => { v.qualification.input.issuer = "window-b" },
    v => { v.qualification.scanComplete = false },
    v => { v.qualification.rejected = 1 },
    v => { delete v.qualification.fingerprint },
    v => { v.qualification.qualificationId = "" },
  ]) rejectsMutation(read, mutate, value => proof.decodeReadProof(value, expected))
})

test("No-op advances qualification without inventing a new data generation", () => {
  const first = proof.decodeReadProof(read(), expected)
  const nextInput = { ...input, revision: 3 }
  const next = read()
  next.qualification.input = nextInput
  next.qualification.qualificationId = "q-3"
  const result = proof.decodeReadProof(next, { ...expected, input: nextInput })
  assert.equal(result.snapshot.head, first.snapshot.head)
  assert.notEqual(result.qualification.qualificationId, first.qualification.qualificationId)
  assert.throws(() => proof.decodeReadProof(next, expected), { name: "SidecarProtocolError" })
})

test("physical replacement may lower head but cannot reuse the old store qualification", () => {
  const changed = read()
  changed.snapshot = { ...snapshot, storeId: "physical-b", head: 1 }
  changed.servedGeneration = 1
  changed.qualification = { ...qualification, ...changed.snapshot, qualificationId: "q-replaced" }
  assert.equal(proof.decodeReadProof(changed, expected).snapshot.head, 1)
  changed.qualification.storeId = "physical-a"
  assert.throws(() => proof.decodeReadProof(changed, expected), { name: "SidecarProtocolError" })
})

test("legacy discovery and unqualified snapshots never fabricate complete proof", () => {
  const legacy = { format: "legacy", snapshot: null, qualification: null,
    servedGeneration: 9, completeness: "stale" }
  assert.deepEqual(proof.decodeReadProof(legacy, expected),
    { format: "legacy", snapshot: null, qualification: null })
  const stale = { ...read(), qualification: null, completeness: "stale" }
  assert.equal(proof.decodeReadProof(stale, expected).qualification, null)
  for (const mutate of [v => { v.completeness = "ready" },
    v => { delete v.snapshot }, v => { v.qualification = qualification }]) {
    rejectsMutation(() => structuredClone(legacy), mutate, value => proof.decodeReadProof(value, expected))
  }
  rejectsMutation(() => stale, v => { v.completeness = "ready" },
    value => proof.decodeReadProof(value, expected))
})

test("qualified terminals require current attempt input, complete receipt and honest publication counts", () => {
  assert.equal(proof.decodeMaintenanceTerminal(terminal(), expected).outcome, "qualified")
  for (const mutate of [
    v => { v.input.revision-- }, v => { v.input.issuer = "previous-session" },
    v => { v.qualification.input.revision++ }, v => { v.qualification.factsDomain = "other" },
    v => { v.phase = "failed" }, v => { v.qualification = null },
    v => { v.dataPublished = null }, v => { v.currentInput = "true" },
    v => { v.writtenDocuments = -1 }, v => { v.factRowsWritten = Number.MAX_SAFE_INTEGER + 1 },
    v => { delete v.indexedDocuments }, v => { v.indexedDocuments = -1 },
    v => { v.scope = "file"; v.uri = "file:///project/Source.ets" },
    v => { v.attemptId = "" }, v => { v.protocol = 2 },
  ]) rejectsMutation(terminal, mutate, value => proof.decodeMaintenanceTerminal(value, expected))
  const noop = terminal()
  Object.assign(noop, { dataPublished: false, writtenDocuments: 0, factRowsWritten: 0 })
  assert.equal(proof.decodeMaintenanceTerminal(noop, expected).qualification.head, 7)
  // A historical successful terminal is observable, but cannot clear the current input.
  const superseded = terminal()
  superseded.currentInput = false
  assert.equal(proof.decodeMaintenanceTerminal(superseded, expected).currentInput, false)
})

test("cancelled, failed, published-unqualified and unknown terminals stay distinct", () => {
  const base = { protocol: 1, event: "maintenance/terminal", attemptId: "attempt-2", input,
    qualification: null, currentInput: false }
  const samples = [
    { phase: "cancelled", outcome: "cancelled", dataPublished: false, error: null },
    { phase: "failed", outcome: "failed", dataPublished: false,
      error: { code: "maintenance_failed", message: "read failed" } },
    { phase: "failed", outcome: "unknown", dataPublished: null,
      error: { code: "publication_unknown", message: "terminal lost" } },
    { phase: "completed", outcome: "published-unqualified", dataPublished: true,
      head: 8, writtenDocuments: 1, factRowsWritten: 10, reusedDocuments: 0, error: "input changed" },
  ]
  for (const sample of samples) {
    assert.equal(proof.decodeMaintenanceTerminal({ ...base, ...sample }, expected).outcome, sample.outcome)
    for (const mutate of [v => { v.qualification = qualification }, v => { v.currentInput = true },
      v => { v.outcome = "invented-success" }, v => { v.phase = "ready" }]) {
      rejectsMutation(() => ({ ...base, ...sample }), mutate,
        value => proof.decodeMaintenanceTerminal(value, expected))
    }
  }
})

test("input revisions use safe nonnegative integers and issuer identity", () => {
  assert.deepEqual(proof.decodeInput(input), input)
  for (const value of [null, {}, { issuer: "", revision: 0 }, { issuer: "x".repeat(129), revision: 0 },
    { issuer: "a", revision: -1 }, { issuer: "a", revision: 1.1 },
    { issuer: "a", revision: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => proof.decodeInput(value), { name: "SidecarProtocolError" })
  }
})

test("a Native JSON field cannot forge the transport-owned proof annotation", () => {
  assert.deepEqual(proof.retainedReadProof({ indexProof: read(), qualification }), {})
  const decoded = proof.decodeReadProof(read(), expected)
  const annotated = proof.attachReadProof({ items: [], indexProof: "untrusted" }, decoded)
  assert.deepEqual(proof.retainedReadProof(annotated), { indexProof: decoded })
  assert.deepEqual(proof.retainedReadProof(JSON.parse(JSON.stringify(annotated))), {})
})

test("file publication reports its data snapshot but never certifies a complete namespace", () => {
  const sample = () => ({ protocol: 1, event: "maintenance/terminal", attemptId: "file-2", input,
    currentInput: false, scope: "file", uri: "file:///project/Source.ets", phase: "completed",
    outcome: "data-updated", dataPublished: true, qualification: null, snapshot,
    writtenDocuments: 1, factRowsWritten: 10 })
  const decoded = proof.decodeMaintenanceTerminal(sample(), expected)
  assert.equal(decoded.outcome, "data-updated")
  assert.equal(decoded.qualification, null)
  assert.deepEqual(decoded.snapshot, snapshot)
  for (const mutate of [v => { v.qualification = qualification }, v => { v.currentInput = true },
    v => { delete v.uri }, v => { v.scope = "workspace" }, v => { v.dataPublished = false },
    v => { v.snapshot = { ...snapshot, factsDomain: "other" } }, v => { v.factRowsWritten = -1 }]) {
    rejectsMutation(sample, mutate, value => proof.decodeMaintenanceTerminal(value, expected))
  }
})
