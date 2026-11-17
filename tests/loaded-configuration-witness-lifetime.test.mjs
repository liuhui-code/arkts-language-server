import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildSync } from "esbuild"

const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-witness-driver-"))
buildSync({ entryPoints: ["src/project/loaded-configuration-witness.ts"], bundle: true,
  platform: "node", target: "node20", format: "cjs", outfile: path.join(output, "driver.cjs") })
const { LoadedConfigurationWitness } = createRequire(import.meta.url)(path.join(output, "driver.cjs"))
test.after(() => fs.rmSync(output, { recursive: true, force: true }))
const checkpoint = () => {}

function fixture(t, count = 4608) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-witness-facts-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const files = Array.from({ length: count }, (_, i) => path.join(root, `File${i}.ets`))
  for (const file of files) fs.writeFileSync(file, "export const value = 1\n")
  const read = (witness, file) => witness.observeSourceNamespace(file, () => fs.readFileSync(file, "utf8"))
  const load = witness => { for (const file of files) read(witness, file) }
  return { root, files, read, load }
}

test("required read facts are complete beyond the former optional-sized quota and repeated loads stabilize", t => {
  const f = fixture(t), failures = [], witness = new LoadedConfigurationWitness(error => failures.push(error))
  f.load(witness)
  const all = () => witness.captureConfigurationBeforeSourceReset(checkpoint, () => false)
  assert.equal(all().factCount, f.files.length)
  assert.equal(witness.freshness(checkpoint)?.(), true)
  for (let round = 0; round < 3; round++) {
    f.load(witness)
    assert.equal(all().factCount, f.files.length, "repeated loads must replace no facts or accumulate history")
    assert.equal(witness.freshness(checkpoint)?.(), true)
  }
  assert.deepEqual(failures, [])
})

test("path-only facts and content facts both retain their complete load-owned read set", t => {
  const f = fixture(t), witness = new LoadedConfigurationWitness()
  for (const file of f.files) {
    witness.observeSourceNamespace(file, () => fs.existsSync(file), true)
    f.read(witness, file)
  }
  assert.equal(witness.captureConfigurationBeforeSourceReset(checkpoint, () => false).factCount, 2 * f.files.length)
  assert.equal(witness.captureConfigurationBeforeSourceReset(checkpoint, () => true).factCount, 0)
  const current = witness.freshness(checkpoint)
  assert.equal(current?.(), true)
  fs.unlinkSync(f.files.at(-1))
  assert.equal(current(), false)
})

for (const index of [0, 2304, 4607]) test(`a changed retained fact at ${index} still rejects, without truncation or restamping`, t => {
  const f = fixture(t), witness = new LoadedConfigurationWitness()
  f.load(witness)
  const fresh = witness.freshness(checkpoint), capsule = witness.captureConfigurationBeforeSourceReset(checkpoint, () => false)
  assert.equal(fresh?.(), true)
  fs.writeFileSync(f.files[index], "export const replacement = 12345\n")
  assert.equal(fresh(), false)
  assert.equal(capsule.current(checkpoint), false)
  f.read(witness, f.files[index])
  assert.equal(witness.freshness(checkpoint), undefined, "an ordinary load cannot certify changed retained input")
})

test("source provenance beyond the former quota is retired while original non-source denial survives", t => {
  const f = fixture(t), witness = new LoadedConfigurationWitness()
  f.load(witness)
  const config = path.join(f.root, "sdk.json")
  fs.writeFileSync(config, '{"api":24}')
  witness.observe(config, () => fs.readFileSync(config, "utf8"))
  const capsule = witness.captureConfigurationBeforeSourceReset(checkpoint, file => f.files.includes(file))
  assert.equal(capsule.factCount, 1, "every actual source fact must retain provenance")
  assert.equal(capsule.current(checkpoint), true)
  fs.unlinkSync(f.files.at(-1))
  witness.reset()
  assert.equal(capsule.current(checkpoint), true, "facts-only capsule survives old owner reset")
  fs.writeFileSync(config, '{"api":2400}')
  assert.equal(capsule.current(checkpoint), false, "replacement must not restamp old SDK/configuration facts")
})

test("retirement, reset and owner epoch end old proofs without retaining historical entries", t => {
  const f = fixture(t), state = { current: true }
  const witness = new LoadedConfigurationWitness(undefined, () => state.current)
  f.load(witness)
  const old = witness.freshness(checkpoint)
  assert.equal(witness.retireNamespaces([f.files.at(-1)]), true)
  assert.equal(old(), false)
  assert.equal(witness.captureConfigurationBeforeSourceReset(checkpoint, () => false).factCount, f.files.length - 1)
  const beforeReset = witness.freshness(checkpoint)
  witness.reset()
  assert.equal(beforeReset(), false)
  assert.equal(witness.captureConfigurationBeforeSourceReset(checkpoint, () => false).factCount, 0)
  f.load(witness)
  const beforeDispose = witness.freshness(checkpoint)
  state.current = false
  assert.equal(beforeDispose(), false)
  assert.equal(witness.freshness(checkpoint), undefined)
  witness.reset()
  assert.equal(witness.freshness(checkpoint), undefined, "reset cannot revive an obsolete owner")
})

test("genuine lost-proof capacity and unknown failures remain fail closed", t => {
  const f = fixture(t, 1)
  for (const reason of ["witness-capacity", "caller-invalidated", "identity-unavailable"]) {
    const witness = new LoadedConfigurationWitness()
    f.load(witness)
    witness.markUnprovable(reason, f.files[0])
    assert.equal(witness.freshness(checkpoint), undefined)
    assert.equal(witness.captureConfigurationBeforeSourceReset(checkpoint, () => true).current(checkpoint), false)
  }
})
