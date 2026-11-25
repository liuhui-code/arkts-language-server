import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { membershipValidationFixture as fixture } from "./support/membership-validation-fixture.mjs"
const control = { checkpoint() {} }
const parentOf = source => fs.realpathSync.native(path.dirname(source))

for (const mode of ["success", "failure", "cancellation"]) test(`final first-side metadata requires completed producer: ${mode}`, t => {
  let calls = 0
  const f = fixture(t, () => {
    if (++calls === 3 && mode === "failure") return false
    if (calls === 3 && mode === "cancellation") throw Error("cancelled final producer")
    return true
  })
  const { api, source, catalog, proof } = f
  let observations = 0
  const run = () => api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    assert.equal(api.takeCompletedFinalRegularSourceObservation(source, parentOf(source)), undefined)
    api.validateRequestInput({}, 0, 0, () => {
      if (++observations === 2) {
        assert.ok(api.takeCompletedFinalRegularSourceObservation(source, parentOf(source)))
        assert.equal(api.takeCompletedFinalRegularSourceObservation(source, parentOf(source)), undefined)
        assert.equal(api.takeCompletedRegularSourceObservation(source, parentOf(source)), undefined)
      }
      return true
    })
  }, () => { throw Error("unavailable final source") })
  if (mode === "success") { run(); assert.equal(observations, 2) }
  else { assert.throws(run, /unavailable final source/); assert.equal(observations, 1) }
  assert.equal(api.takeCompletedFinalRegularSourceObservation(source, parentOf(source)), undefined)
})

for (const field of ["ino", "size", "mtimeMs", "ctimeMs"]) test(`borrowed final first side retains later raw ${field} rejection`, t => {
  const { api, source, catalog, proof } = fixture(t)
  const stamp = api.diskIdentity(source).stamp
  const original = fs.lstatSync
  let finals = 0, reads = 0
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    api.validateRequestInput({}, 0, 0, () => {
      if (++finals !== 2) return true
      fs.lstatSync = function(file, ...args) {
        const stat = Reflect.apply(original, this, [file, ...args])
        if (file !== source) return stat
        reads++
        return Object.defineProperty(Object.create(stat), field, { value: stat[field] + 1 })
      }
      try { return api.observedSourceIdentity(source, stamp, control.checkpoint, directory => proof.directory(directory))?.stamp === stamp }
      finally { fs.lstatSync = original }
    })
  }, () => { throw Error("late source rejected") }), /late source rejected/)
  assert.equal(reads, 1, "the later raw leaf comparison is still executed")
})

for (const action of ["body edit", "same-path replacement"]) test(`final source window rejects real ${action} after the member scan`, t => {
  const { api, source, catalog, proof } = fixture(t)
  const stamp = api.diskIdentity(source).stamp
  let visits = 0
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    api.validateRequestInput({}, 0, 0, () => {
      if (++visits !== 2) return true
      if (action === "same-path replacement") fs.renameSync(source, source + ".old")
      fs.writeFileSync(source, "export const value = 2345\n")
      return api.observedSourceIdentity(source, stamp, control.checkpoint,
        directory => proof.directory(directory))?.stamp === stamp
    })
  }, () => { throw Error("actual late source change") }), /actual late source change/)
  assert.equal(visits, 2)
  assert.equal(api.takeCompletedFinalRegularSourceObservation(source, parentOf(source)), undefined)
})
