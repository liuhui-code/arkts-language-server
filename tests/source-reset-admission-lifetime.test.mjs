import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { buildSync } from "esbuild"

const output = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reset-admission-"))
buildSync({ stdin: { contents: 'export {SourceResetAdmissions} from "./src/core/types/source-reset-admission.ts"; export {LoadedConfigurationWitness} from "./src/project/loaded-configuration-witness.ts"',
  resolveDir: process.cwd() }, bundle: true, platform: "node", target: "node20", format: "cjs",
  outfile: path.join(output, "driver.cjs") })
const { SourceResetAdmissions, LoadedConfigurationWitness } = createRequire(import.meta.url)(path.join(output, "driver.cjs"))
test.after(() => fs.rmSync(output, { recursive: true, force: true }))
const checkpoint = () => {}

test("source reset admission retains complete healthy configuration capsules beyond 4096 actual read facts", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reset-config-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const witness = new LoadedConfigurationWitness()
  const files = Array.from({ length: 4608 }, (_, n) => path.join(root, `sdk${n}.json`))
  for (const file of files) {
    fs.writeFileSync(file, '{"api":24}')
    witness.observeSourceNamespace(file, () => fs.readFileSync(file, "utf8"))
  }
  const entry = { ownerId: fs.realpathSync(root), engine: {
    captureConfigurationBeforeSourceReset: check => witness.captureConfigurationBeforeSourceReset(check, () => false),
  } }
  const admissions = new SourceResetAdmissions()
  t.after(() => admissions.clear())
  const first = admissions.begin("first", root, entry, "content-revision-change", checkpoint)
  assert.equal(first.factCount, files.length)
  assert.equal(first.current(checkpoint), true)
  assert.equal(admissions.begin("first", root, entry, "content-revision-change", checkpoint), first)
  const second = admissions.begin("second", root, entry, "unnotified-resolution-change", checkpoint)
  assert.equal(second.factCount, files.length, "another context must retain its own full proof")
  fs.writeFileSync(files.at(-1), '{"api":25}')
  assert.equal(first.current(checkpoint), false)
  assert.throws(() => admissions.begin("first", root, undefined, undefined, checkpoint),
    { name: "SemanticInputUnavailableError" }, "a failed replacement cannot discard the original last fact")
  admissions.complete("first", first)
  assert.equal(admissions.begin("first", root, undefined, undefined, checkpoint), undefined)
  assert.throws(() => admissions.begin("second", root, undefined, undefined, checkpoint),
    { name: "SemanticInputUnavailableError" }, "completing one context cannot release another capsule")
  admissions.clear()
  assert.equal(admissions.begin("second", root, undefined, undefined, checkpoint), undefined)
})
