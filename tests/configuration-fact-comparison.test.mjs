import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { membershipValidationFixture as fixture } from "./support/membership-validation-fixture.mjs"

function inFinal(api, run, query = () => {}) {
  let calls = 0
  api.withRequestInputValidation(() => {
    query()
    api.validateRequestInput({}, 0, 0, () => { if (++calls === 2) run(); return true })
  }, () => { throw Error("unavailable") })
}
function observer(api, counted) {
  return (file = "/fact") => api.requestConfigurationIdentity(file, false, "original", () => {
    counted.reads++
    return { identity: "original", loadGuard: "original", witnessPath: file, regularSource: true }
  })?.identity === "original"
}

test("only retained final observations share comparisons; query and following request remain independent", t => {
  const { api } = fixture(t), owner = {}, counted = { reads: 0 }, observe = observer(api, counted)
  let comparisons = 0
  const compare = () => api.compareRetainedConfigurationFacts(owner, 0, 0, () => { comparisons++; return observe() })
  inFinal(api, () => { assert.equal(compare(), true); assert.equal(compare(), true) },
    () => { compare(); compare(); assert.equal(comparisons, 2) })
  assert.equal(comparisons, 3)
  assert.equal(counted.reads, 2)
  inFinal(api, () => { compare(); compare() })
  assert.equal(comparisons, 4)
  assert.equal(counted.reads, 3)
})

test("epoch and read-set revision changes force another original-fact comparison", t => {
  const { api } = fixture(t), owner = {}, observe = observer(api, { reads: 0 })
  let epoch = 0, revision = 0, calls = 0
  const compare = () => api.compareRetainedConfigurationFacts(owner, epoch, revision, () => { calls++; return observe() })
  inFinal(api, () => {
    compare(); compare(); revision++; compare(); epoch++; compare()
    assert.equal(calls, 3)
  })
})

test("unretained over-budget observations are compared and physically observed again", t => {
  const { api } = fixture(t), counted = { reads: 0 }, observe = observer(api, counted), owner = {}
  let comparisons = 0
  inFinal(api, () => {
    api.requestFileIdentity("/budget", () => ({ physicalPath: "p".repeat(16 * 1024 * 1024 - 80), stamp: "s" }))
    for (let i = 0; i < 2; i++) assert.equal(api.compareRetainedConfigurationFacts(owner, 0, 0,
      () => { comparisons++; return observe() }), true)
  })
  assert.equal(comparisons, 2)
  assert.equal(counted.reads, 2)
})

test("unknown empty and nested comparisons cannot hide an undeclared dependency", t => {
  const { api } = fixture(t), outer = {}, inner = {}, emptyOwner = {}, observe = observer(api, { reads: 0 })
  let empty = 0, parents = 0, children = 0
  inFinal(api, () => {
    for (let i = 0; i < 2; i++) {
      api.compareRetainedConfigurationFacts(emptyOwner, 0, 0, () => { empty++; return true })
      api.compareRetainedConfigurationFacts(outer, 0, 0, () => {
        parents++
        return observe("/outer") && api.compareRetainedConfigurationFacts(inner, 0, 0,
          () => { children++; return observe("/inner") })
      })
    }
  })
  assert.equal(empty, 2); assert.equal(parents, 2); assert.equal(children, 1)
})

test("throwing or cancelled comparisons leave no transferable successful result", t => {
  const { api } = fixture(t), owner = {}, counted = { reads: 0 }, observe = observer(api, counted)
  assert.throws(() => inFinal(api, () => api.compareRetainedConfigurationFacts(owner, 0, 0, () => {
    observe(); throw Error("cancelled")
  })), /cancelled/)
  inFinal(api, () => assert.equal(api.compareRetainedConfigurationFacts(owner, 0, 0, observe), true))
  assert.equal(counted.reads, 2)
})

test("a witness rechecks its live owner and cancellation guards despite a shared fact comparison", t => {
  const { api, source } = fixture(t), state = { current: true, cancelled: false }
  const checkpoint = () => { if (state.cancelled) throw Error("cancelled") }
  const witness = new api.LoadedConfigurationWitness(undefined, () => state.current)
  witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
  let current
  inFinal(api, () => {
    assert.equal(current(), true)
    state.current = false; assert.equal(current(), false)
    state.current = true; assert.equal(current(), true)
    state.cancelled = true; assert.throws(current, /cancelled/); state.cancelled = false
    assert.equal(current(), true)
    witness.reset(); assert.equal(current(), false)
  }, () => { current = witness.freshness(checkpoint); assert.ok(current) })
})

test("a fact appended after final comparison is independently checked and cannot publish stale content", t => {
  const { api, source } = fixture(t), witness = new api.LoadedConfigurationWitness(), checkpoint = () => {}
  const other = path.join(path.dirname(source), "Other.ts")
  fs.writeFileSync(other, "export const other = 1\n")
  witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
  let current
  assert.throws(() => api.withRequestInputValidation(() => {
    current = witness.freshness(checkpoint)
    let calls = 0
    api.validateRequestInput({}, 0, 0, () => {
      if (++calls === 2) {
        assert.equal(current(), true)
        witness.observeSourceNamespace(other, () => fs.readFileSync(other, "utf8"))
        fs.writeFileSync(other, "export const changedOther = 123456\n")
        return current()
      }
      return true
    })
  }, () => { throw Error("late appended input rejected") }), /late appended input rejected/)
})
