import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { membershipValidationFixture as fixture } from "./support/membership-validation-fixture.mjs"
const unavailable = () => { throw Error("unavailable") }
const noop = () => {}
const control = { checkpoint: noop }

for (const kind of ["membership-consumer", undefined]) {
  test(`only a declared required consumer can replace the duplicate membership entry: ${kind ?? "legacy"}`, t => {
    const { api } = fixture(t), member = {}, consumer = {}, log = []
    let phase = "query"
    const current = () => api.validateRequestInput(member, 0, 1, () => { log.push(phase); return true }, "membership")
    api.withRequestInputValidation(() => {
      current()
      api.validateRequestInput(consumer, 0, 1, current, kind)
      phase = "final"
    }, unavailable)
    assert.deepEqual(log, kind ? ["query", "final"] : ["query", "final", "final"])
  })
}

test("a mixed legacy registration retains its original top-level observer", t => {
  const { api } = fixture(t), member = {}, consumer = {}
  let scans = 0
  const scan = () => { scans++; return true }
  const current = () => api.validateRequestInput(member, 0, 1, scan, "membership")
  api.withRequestInputValidation(() => {
    current(); api.validateRequestInput(member, 0, 1, scan)
    api.validateRequestInput(consumer, 0, 1, current, "membership-consumer")
  }, unavailable)
  assert.equal(scans, 3)
})

for (const change of ["missing", "different-owner", "different-epoch", "different-revision"]) {
  test(`a ${change} final consumption cannot discharge the original obligation`, t => {
    const { api } = fixture(t), member = {}, replacement = {}, consumer = {}
    let final = false
    const current = () => api.validateRequestInput(member, 0, 1, () => true, "membership")
    assert.throws(() => api.withRequestInputValidation(() => {
      current()
      api.validateRequestInput(consumer, 0, 1, () => {
        if (!final) return current()
        if (change === "missing") return true
        return api.validateRequestInput(change === "different-owner" ? replacement : member,
          change === "different-epoch" ? 1 : 0, change === "different-revision" ? 2 : 1,
          () => true, "membership")
      }, "membership-consumer")
      final = true
    }, unavailable), /unavailable/)
  })
}

test("failed capture and cancellation leave no obligation or context in a later request", t => {
  const { api } = fixture(t), member = {}, consumer = {}
  let final = false, cancelled = false, scans = 0
  const current = () => api.validateRequestInput(member, 0, 1, () => {
    scans++; if (final && cancelled) throw Error("cancelled"); return true
  }, "membership")
  assert.throws(() => api.withRequestInputValidation(() => {
    current()
    api.validateRequestInput(consumer, 0, 1, current, "membership-consumer")
    final = true; cancelled = true
  }, unavailable), /cancelled/)
  final = false; cancelled = false; scans = 0
  api.withRequestInputValidation(() => {
    current()
    assert.throws(() => api.validateRequestInput({}, 0, 1, () => {
      current(); throw Error("capture failed")
    }, "membership-consumer"), /capture failed/)
    api.validateRequestInput(consumer, 0, 1, current, "membership-consumer")
    final = true
  }, unavailable)
  assert.equal(scans, 2)
})

test("a same-size restored-mtime body change before the required final consumer still retires the proof", t => {
  const { api, source, catalog, proof, timestamp } = fixture(t), consumer = {}, mutation = {}
  let final = false
  const current = () => proof.current(catalog, [], control)
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(current(), true)
    api.validateRequestInput(mutation, 0, 0, () => {
      if (final) { fs.writeFileSync(source, "export const value = 2\n"); fs.utimesSync(source, timestamp, timestamp) }
      return true
    })
    api.validateRequestInput(consumer, 0, 0, current, "membership-consumer")
    final = true
  }, unavailable), /unavailable/)
  assert.equal(proof.invalidated, true)
})

for (const scoped of [false, true]) {
  test(`SDK drift during native finalization is caught by the ${scoped ? "post-member raw configuration guard" : "original standalone order"}`, t => {
    const { api, catalog, proof } = fixture(t), sdkRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-member-sdk-"))
    t.after(() => fs.rmSync(sdkRoot, { recursive: true, force: true }))
    const sdk = path.join(sdkRoot, "sdk.json")
    fs.writeFileSync(sdk, '{"version":1}')
    const witness = new api.LoadedConfigurationWitness()
    witness.observe(sdk, () => fs.readFileSync(sdk, "utf8"))
    const configuration = witness.captureConfigurationBeforeSourceReset(noop, () => false)
    let final = false, mutated = false
    const controlled = { checkpoint() {
      if (final && !mutated) { mutated = true; fs.writeFileSync(sdk, '{"changedVersion":2}') }
    } }
    const current = () => proof.current(catalog, [], controlled)
    assert.throws(() => api.withRequestInputValidation(() => {
      assert.equal(current(), true)
      assert.ok(witness.freshness(noop))
      if (scoped) api.validateRequestInput({}, 0, 0, () => current() && configuration.current(noop), "membership-consumer")
      final = true
    }, unavailable), /unavailable/)
    assert.equal(mutated, true)
  })
}

test("a directory change after the last member observation still fails the terminal directory fence", t => {
  const { api, source, catalog, proof } = fixture(t), witness = new api.LoadedConfigurationWitness()
  witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
  let final = false
  const created = path.join(path.dirname(source), "Late.ts")
  const current = () => proof.current(catalog, [], control)
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(current(), true)
    assert.ok(witness.freshness(noop))
    api.validateRequestInput({}, 0, 0, () => {
      if (!current()) return false
      if (final) fs.writeFileSync(created, "class LateGlobal {}\n")
      return true
    }, "membership-consumer")
    final = true
  }, unavailable), /unavailable/)
  assert.equal(fs.existsSync(created), true)
})


test("every declared consumer must independently consume its original member proof", t => {
  const { api } = fixture(t), member = {}, first = {}, second = {}
  let final = false
  const current = () => api.validateRequestInput(member, 0, 1, () => true, "membership")
  assert.throws(() => api.withRequestInputValidation(() => {
    current()
    api.validateRequestInput(first, 0, 1, current, "membership-consumer")
    api.validateRequestInput(second, 0, 1, () => final || current(), "membership-consumer")
    final = true
  }, unavailable), /unavailable/)
})

test("a consumer cannot swallow a failed member observation and publish success", t => {
  const { api } = fixture(t), member = {}, consumer = {}
  let final = false
  const current = () => api.validateRequestInput(member, 0, 1, () => !final, "membership")
  assert.throws(() => api.withRequestInputValidation(() => {
    current()
    api.validateRequestInput(consumer, 0, 1, () => { current(); return true }, "membership-consumer")
    final = true
  }, unavailable), /unavailable/)
})
