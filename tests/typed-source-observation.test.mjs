import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { membershipValidationFixture as fixture } from "./support/membership-validation-fixture.mjs"

const control = { checkpoint() {} }
const parentOf = source => fs.realpathSync.native(path.dirname(source))

test("a completed producer lends all six original fields once and never lends its final scan", t => {
  const { api, source, catalog, proof } = fixture(t), parent = parentOf(source), stat = fs.lstatSync(source)
  const fields = Object.fromEntries(["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs"].map(key => [key, stat[key]]))
  let finals = 0
  api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    assert.deepEqual(api.takeCompletedRegularSourceObservation(source, parent), fields)
    assert.equal(api.takeCompletedRegularSourceObservation(source, parent), undefined)
    api.validateRequestInput({}, 0, 0, () => {
      if (++finals === 2) assert.equal(api.takeCompletedRegularSourceObservation(source, parent), undefined)
      return true
    })
  }, () => { throw Error("unexpected stale input") })
  assert.equal(finals, 2)
  assert.equal(api.takeCompletedRegularSourceObservation(source, parent), undefined)
})

test("a failed producer cannot lend provisional complete metadata", t => {
  let calls = 0
  const { api, source, catalog, proof } = fixture(t, () => ++calls !== 2)
  api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), false)
    assert.equal(api.takeCompletedRegularSourceObservation(source, parentOf(source)), undefined)
  }, () => { throw Error("unexpected final input") })
})

test("a checkpoint cancellation discards provisional metadata before the next request", t => {
  let calls = 0, cancelled = false
  const { api, source, catalog, proof } = fixture(t, () => { if (++calls === 2) cancelled = true; return true })
  const cancellation = { checkpoint() { if (cancelled) throw Error("cancelled at producer fence") } }
  assert.throws(() => api.withRequestInputValidation(() => proof.current(catalog, [], cancellation),
    () => { throw Error("unexpected final") }), /cancelled at producer fence/)
  assert.equal(api.takeCompletedRegularSourceObservation(source, parentOf(source)), undefined)
})

for (const [name, changes] of [
  ["missing mode", { mode: undefined }], ["nonfinite mode", { mode: NaN }],
  ["weak inode", { token: "1:0:20:1:1" }], ["nonfinite timestamp", { token: "1:2:20:Infinity:1" }],
  ["different parent", { parent: "/other" }], ["different epoch", { epoch: 1 }],
  ["different revision", { revision: 2 }],
]) test(`${name} cannot authorize a typed observation`, t => {
  const { api, source, token } = fixture(t), owner = {}, parent = parentOf(source)
  const v = { parent, token, mode: fs.lstatSync(source).mode, epoch: 0, revision: 1, ...changes }
  api.withRequestInputValidation(() => {
    api.validateRequestInput(owner, 0, 1, () => {
      api.retainPendingRegularSourceObservation(source, v.parent, v.token, owner, v.epoch, v.revision, v.mode)
      return true
    })
    assert.equal(api.takeCompletedRegularSourceObservation(source, parent), undefined)
  }, () => { throw Error("unexpected final") })
})

for (const field of ["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs"]) {
  test(`the later raw ${field} still rejects a drift from borrowed original metadata`, t => {
    const { api, source, catalog, proof } = fixture(t), witness = new api.LoadedConfigurationWitness()
    witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
    const original = fs.lstatSync
    let reads = 0
    api.withSynchronousInputPreparation(() => {
      assert.equal(proof.current(catalog, [], control), true)
      try {
        fs.lstatSync = function(file, ...args) {
          const stat = Reflect.apply(original, this, [file, ...args])
          if (file !== source || ++reads !== 1) return stat
          return Object.defineProperty(Object.create(stat), field, { value: stat[field] + 1 })
        }
        assert.equal(witness.freshness(control.checkpoint), undefined)
        assert.equal(reads, 1, "the already completed native observation is the first side of this comparison")
      } finally { fs.lstatSync = original }
    })
  })
}
