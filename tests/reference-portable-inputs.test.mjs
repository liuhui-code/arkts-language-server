import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-portable-inputs-"))
const output = path.join(folder, "driver.cjs")
buildSync({ stdin: { contents: `export * from ${JSON.stringify(path.resolve("src/project/loaded-configuration-witness.ts"))};
export * from ${JSON.stringify(path.resolve("src/core/types/verifier-sdk-lookups.ts"))};
export * from ${JSON.stringify(path.resolve("src/core/types/reference-program-source-facts.ts"))};`, resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "cjs", outfile: output })
const { LoadedConfigurationWitness, retainedInputFactsCurrent, enableVerifierSdkLookups, verifierSdkFileExists, captureVerifierSdkInputFacts, referenceProgramSourceFacts } = createRequire(import.meta.url)(output)
test.after(() => fs.rmSync(folder, { recursive: true, force: true }))
const checkpoint = () => {}

test("portable receipts retain original positive and negative lookup facts across witness disposal", () => {
  const file = path.join(folder, "config.json"), missing = path.join(folder, "absent", "mod.ts")
  fs.writeFileSync(file, "old")
  const witness = new LoadedConfigurationWitness()
  witness.observe(file, () => fs.readFileSync(file, "utf8"))
  witness.observe(missing, () => fs.existsSync(missing))
  const proof = witness.captureConfigurationBeforeSourceReset(checkpoint, () => false)
  assert.ok(Array.isArray(proof.facts) && proof.facts.length >= 2)
  const portable = structuredClone(proof.facts)
  assert.equal(retainedInputFactsCurrent(portable, checkpoint), true)
  fs.mkdirSync(path.dirname(missing)); fs.writeFileSync(missing, "export {}")
  assert.equal(retainedInputFactsCurrent(portable, checkpoint), false)
  fs.rmSync(path.dirname(missing), { recursive: true })
  assert.equal(retainedInputFactsCurrent(portable, checkpoint), true)
  const stat = fs.statSync(file)
  fs.writeFileSync(file, "new"); fs.utimesSync(file, stat.atime, stat.mtime)
  assert.equal(retainedInputFactsCurrent(portable, checkpoint), false)
})

test("a stale owner cannot export a newly valid portable receipt", () => {
  const file = path.join(folder, "owner.json")
  fs.writeFileSync(file, "{}")
  let alive = true
  const witness = new LoadedConfigurationWitness(undefined, () => alive)
  witness.observe(file, () => fs.readFileSync(file, "utf8"))
  alive = false
  assert.equal(witness.captureConfigurationBeforeSourceReset(checkpoint, () => false).facts, undefined)
})


test("a portable receipt includes original SDK negative lookups reused by later verifier jobs", () => {
  enableVerifierSdkLookups()
  const sdk = path.join(folder, "sdk")
  fs.mkdirSync(sdk)
  const missing = path.join(sdk, "absent.d.ts")
  const first = new LoadedConfigurationWitness(), second = new LoadedConfigurationWitness()
  assert.equal(verifierSdkFileExists(missing, sdk, first), false)
  assert.equal(verifierSdkFileExists(missing, sdk, second), false)
  const facts = captureVerifierSdkInputFacts(second, checkpoint)
  assert.ok(facts?.length)
  assert.equal(retainedInputFactsCurrent(facts, checkpoint), true)
  fs.writeFileSync(missing, "declare class Later {}")
  assert.equal(retainedInputFactsCurrent(facts, checkpoint), false)
})

test("source receipts compare actual compiler text inside a guarded read and never bless a stale AST", () => {
  const file = path.join(folder, "lib.d.ts")
  fs.writeFileSync(file, "declare class Before {}")
  const program = { getSourceFiles: () => [{ fileName: file, text: "declare class Before {}" }] }
  const facts = referenceProgramSourceFacts(program, checkpoint)
  assert.ok(facts?.length)
  assert.equal(retainedInputFactsCurrent(facts, checkpoint), true)
  fs.writeFileSync(file, "declare class After_ {}")
  assert.throws(() => referenceProgramSourceFacts(program, checkpoint), /current workspace inputs/)
  assert.equal(retainedInputFactsCurrent(facts, checkpoint), false)
})
