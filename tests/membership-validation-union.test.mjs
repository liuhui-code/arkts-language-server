import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { membershipValidationFixture as fixture } from "./support/membership-validation-fixture.mjs"


test("membership contributes an independent final leaf fence after a later owner changes a previously checked body", t => {
  const { api, source, catalog, proof, token, timestamp, directories } = fixture(t)
  const stamp = api.diskIdentity(source).stamp, control = { checkpoint() {} }
  const programOwner = {}, mutationOwner = {}
  let calls = 0
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(api.validateRequestInput(programOwner, 0, 0, () =>
      api.observedSourceIdentity(source, stamp, control.checkpoint, proof.directory)?.stamp === stamp), true)
    assert.equal(api.validateRequestInput(mutationOwner, 0, 0, () => {
      if (++calls === 2) {
        const before = fs.statSync(source)
        fs.writeFileSync(source, "export const value = 2\n")
        fs.utimesSync(source, timestamp, timestamp)
        assert.equal(fs.statSync(source).size, before.size)
        assert.equal(fs.statSync(source).mtimeMs, before.mtimeMs)
        assert.notEqual(api.sourceStatIdentity(fs.lstatSync(source)), token)
        assert.equal(directories.current(control), true, "in-place body edits need not change directory identity")
      }
      return true
    }), true)
    assert.equal(proof.current(catalog, [], control), true)
    return "must not publish"
  }, () => { throw Error("membership changed at final union") }), /membership changed at final union/)
  assert.equal(calls, 2)
})

test("membership finalization also runs without any compiler input owner", t => {
  const { api, source, catalog, proof } = fixture(t)
  const control = { checkpoint() {} }
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    fs.unlinkSync(source)
  }, () => { throw Error("membership unavailable") }), /membership unavailable/)
})


test("failed native validation cannot lend its provisional source observations", t => {
  let scopeCalls = 0
  const { api, source, catalog, proof } = fixture(t, () => ++scopeCalls !== 2)
  const control = { checkpoint() {} }
  let reads = 0
  api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), false)
    api.requestFileIdentity(source, () => { reads++; return api.diskIdentity(source) })
  }, () => { throw Error("unexpected successful proof") })
  assert.equal(reads, 1)
})

test("only confirmed matching receipts lend metadata, and the final phase never inherits them", t => {
  const { api, source } = fixture(t), owner = {}, program = {}, identity = api.diskIdentity(source)
  let nativeChecks = 0, rawReads = 0
  api.withRequestInputValidation(() => {
    assert.equal(api.validateRequestInput(owner, 0, 1, () => {
      nativeChecks++
      api.retainPendingFileIdentity(source, () => identity, owner, 0, 1)
      return true
    }), true)
    assert.equal(api.validateRequestInput(program, 0, 0, () =>
      api.requestFileIdentity(source, () => { rawReads++; return identity }).stamp === identity.stamp), true)
  }, () => { throw Error("unexpected failure") })
  assert.equal(nativeChecks, 2)
  assert.equal(rawReads, 1, "query borrows only after confirmation; final program observation stays fresh")
})

test("mismatched revisions and throwing validators never authorize pending observations", t => {
  const { api, source } = fixture(t), owner = {}, identity = api.diskIdentity(source)
  let reads = 0
  api.withRequestInputValidation(() => {
    api.validateRequestInput(owner, 0, 1, () => {
      api.retainPendingFileIdentity(source, () => identity, owner, 0, 2)
      return true
    })
    api.requestFileIdentity(source, () => { reads++; return identity })
  }, () => { throw Error("unexpected failure") })
  assert.equal(reads, 1)
  assert.throws(() => api.withRequestInputValidation(() => api.validateRequestInput({}, 0, 0, () => {
    api.retainPendingFileIdentity(source, () => identity, owner, 0, 1)
    throw Error("cancelled native validation")
  }), () => { throw Error("unexpected terminal") }), /cancelled native validation/)
  api.withRequestInputValidation(() => api.requestFileIdentity(source, () => { reads++; return identity }),
    () => { throw Error("unexpected failure") })
  assert.equal(reads, 2, "a failed request leaves no transferable observation")
})


test("optional unconsumed native receipts cannot starve actual configuration observations", t => {
  const { api } = fixture(t), native = {}, configuration = {}
  let reads = 0
  const identity = { physicalPath: "/source/" + "p".repeat(480), stamp: "s".repeat(480) }
  api.withRequestInputValidation(() => {
    assert.equal(api.validateRequestInput(native, 0, 0, () => {
      for (let i = 0; i < 20_000; i++) api.retainPendingFileIdentity(
        "/unconsumed/" + i + "/" + "x".repeat(480), () => identity, native, 0, 0)
      return true
    }), true)
    const observe = () => {
      for (let i = 0; i < 64; i++) assert.equal(api.requestConfigurationIdentity(
        "/configuration/" + i, false, "original", () => {
          reads++
          return { identity: "original", loadGuard: "original", witnessPath: "/configuration/" + i,
            regularSource: true }
        })?.identity, "original")
      return true
    }
    assert.equal(api.validateRequestInput(configuration, 0, 0, observe), true)
    assert.equal(observe(), true)
    assert.equal(reads, 64, "discard unused optional receipts before repeating authoritative lookups")
  }, () => { throw Error("unexpected stale input") })
  assert.equal(reads, 128, "final union still executes an independent observation of all configuration inputs")
})


test("optional eviction preserves consumed receipts and falls back for discarded ones", t => {
  const { api, source } = fixture(t), native = {}, program = {}, configuration = {}
  const identity = api.diskIdentity(source)
  let consumedReads = 0, discardedReads = 0, configurationReads = 0
  const consumed = () => api.requestFileIdentity(source, () => { consumedReads++; return identity })
  api.withRequestInputValidation(() => {
    api.validateRequestInput(native, 0, 0, () => {
      api.retainPendingFileIdentity(source, () => identity, native, 0, 0)
      return true
    })
    api.validateRequestInput(program, 0, 0, () => consumed()?.stamp === identity.stamp)
    api.retainPendingFileIdentity("/discarded", () => identity, native, 0, 0)
    const optional = { physicalPath: "/" + "p".repeat(480), stamp: "s".repeat(480) }
    for (let i = 0; i < 20_000; i++) api.retainPendingFileIdentity(
      "/unconsumed/" + i + "/" + "x".repeat(480), () => optional, native, 0, 0)
    const observe = () => {
      for (let i = 0; i < 64; i++) api.requestConfigurationIdentity("/config/" + i, false, "original", () => {
        configurationReads++
        return { identity: "original", loadGuard: "original", witnessPath: "/config/" + i, regularSource: true }
      })
      return true
    }
    api.validateRequestInput(configuration, 0, 0, observe)
    observe()
    assert.equal(configurationReads, 64)
    assert.equal(consumed()?.stamp, identity.stamp)
    assert.equal(consumedReads, 0, "a consumed receipt is no longer optional and must not be evicted")
    assert.equal(api.requestFileIdentity("/discarded", () => { discardedReads++; return identity })?.stamp,
      identity.stamp)
    assert.equal(discardedReads, 1, "discarding speculation requires an actual independent observation")
  }, () => { throw Error("unexpected stale input") })
  assert.equal(consumedReads, 1, "consumption never suppresses the independent final source guard")
  assert.equal(configurationReads, 128)
})


test("known regular source lookups borrow original directories but reobserve leaves in both validation phases", t => {
  const { api, source, catalog, proof } = fixture(t), control = { checkpoint() {} }
  const witness = new api.LoadedConfigurationWitness()
  witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
  const native = fs.realpathSync.native, lstat = fs.lstatSync
  let leafRealpaths = 0, leafStats = 0
  try {
    fs.realpathSync.native = function(file, ...args) {
      if (file === source) leafRealpaths++
      return Reflect.apply(native, this, [file, ...args])
    }
    fs.lstatSync = function(file, ...args) {
      if (file === source) leafStats++
      return Reflect.apply(lstat, this, [file, ...args])
    }
    api.withSynchronousInputPreparation(() => {
      assert.equal(proof.current(catalog, [], control), true)
      api.withRequestInputValidation(() => {
        assert.equal(witness.freshness(control.checkpoint)?.(), true)
        assert.equal(leafRealpaths, 0, "the original physical directory and exact spelling replace per-leaf realpath")
        assert.equal(leafStats, 2, "completed native first observation plus independent later configuration leaf")
      }, () => { throw Error("source input became stale") })
    })
    assert.equal(leafRealpaths, 0, "final validation borrows the original directory, never the query validity result")
    assert.equal(leafStats, 5, "final phase still adds one native and two configuration raw observations")
    assert.equal(witness.freshness(control.checkpoint, "capture")?.(), true)
    assert.equal(leafRealpaths, 1, "the next unscoped observation cannot inherit a request's directory producer")
  } finally {
    fs.realpathSync.native = native
    fs.lstatSync = lstat
  }
})


test("a source changed after native finalization is rejected by the independent configuration leaf fence", t => {
  const { api, source, catalog, proof, timestamp } = fixture(t), control = { checkpoint() {} }
  const witness = new api.LoadedConfigurationWitness(), mutation = {}
  witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
  let calls = 0
  assert.throws(() => api.withSynchronousInputPreparation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    api.withRequestInputValidation(() => {
      api.validateRequestInput(mutation, 0, 0, () => {
        if (++calls === 2) {
          const before = fs.statSync(source)
          fs.writeFileSync(source, "export const value = 2\n")
          fs.utimesSync(source, timestamp, timestamp)
          assert.equal(fs.statSync(source).mtimeMs, before.mtimeMs)
          assert.equal(fs.statSync(source).size, before.size)
        }
        return true
      })
      assert.equal(witness.freshness(control.checkpoint)?.(), true)
    }, () => { throw Error("configuration source changed") })
  }), /configuration source changed/)
  assert.equal(calls, 2)
})

test("fresh native metadata cannot restamp an older loaded source identity", t => {
  const { api, source, catalog, directories, timestamp } = fixture(t), control = { checkpoint() {} }
  const witness = new api.LoadedConfigurationWitness()
  witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
  fs.writeFileSync(source, "export const value = 2\n")
  fs.utimesSync(source, timestamp, timestamp)
  catalog.diskIdentities.set(source, api.sourceStatIdentity(fs.lstatSync(source)))
  const current = api.captureCompleteMembershipProof(catalog, directories, () => true)
  api.withSynchronousInputPreparation(() => {
    assert.equal(current.current(catalog, [], control), true)
    api.withRequestInputValidation(() => {
      assert.equal(witness.freshness(control.checkpoint), undefined,
        "new source metadata must be compared with the actual old load, never copied over it")
    }, () => { throw Error("unexpected native scope failure") })
  })
})


test("ordinary loaded source-path facts borrow physical directory proof without becoming namespace facts", t => {
  const { api, source, catalog, proof } = fixture(t), control = { checkpoint() {} }
  const witness = new api.LoadedConfigurationWitness()
  witness.observePath(source, () => fs.realpathSync.native(source))
  assert.equal(witness.captureConfigurationBeforeSourceReset(control.checkpoint, () => true).factCount, 1,
    "ordinary path facts cannot be reclassified as recoverable compiler namespace facts")
  const native = fs.realpathSync.native
  let leafRealpaths = 0
  try {
    fs.realpathSync.native = function(file, ...args) {
      if (file === source) leafRealpaths++
      return Reflect.apply(native, this, [file, ...args])
    }
    api.withSynchronousInputPreparation(() => {
      assert.equal(proof.current(catalog, [], control), true)
      api.withRequestInputValidation(() => {
        assert.equal(witness.freshness(control.checkpoint)?.(), true)
        assert.equal(leafRealpaths, 0, "native regular sources need no repeated per-leaf physical resolution")
      }, () => { throw Error("ordinary path proof is stale") })
    })
    assert.equal(leafRealpaths, 0, "the independent final leaf check uses original directory provenance too")
    assert.equal(witness.captureConfigurationBeforeSourceReset(control.checkpoint, () => true).factCount, 1)
  } finally { fs.realpathSync.native = native }
})


test("input compositions retain child fences without adding a duplicate final owner", t => {
  const { api, source } = fixture(t), composition = {}, child = {}, parent = {}
  const expected = api.diskIdentity(source).stamp
  let traversals = 0, validators = 0, rawReads = 0
  const composed = () => api.memoizeRequestInputComposition(composition, 0, 0, () => {
    traversals++
    return api.validateRequestInput(child, 0, 0, () => {
      validators++
      return api.requestFileIdentity(source, () => { rawReads++; return api.diskIdentity(source) })?.stamp === expected
    })
  })
  for (let request = 0; request < 2; request++) api.withRequestInputValidation(() => {
    assert.equal(api.validateRequestInput(parent, 0, 0, composed), true)
    assert.equal(composed(), true)
    assert.equal(traversals, request * 2 + 1)
  }, () => { throw Error("unexpected stale source") })
  assert.equal(traversals, 4, "each query and each final parent traversal still execute independently")
  assert.equal(validators, 6, "existing child and parent final checks remain, with no new composition owner")
  assert.equal(rawReads, 4, "actual leaf observations never transfer between queries or into finalization")
})

test("a cached query composition cannot publish after an unnotified same-size body edit", t => {
  const { api, source, timestamp } = fixture(t), aggregate = {}, child = {}, parent = {}
  const expected = api.diskIdentity(source).stamp
  let traversals = 0
  const composed = () => api.memoizeRequestInputComposition(aggregate, 0, 0, () => {
    traversals++
    return api.validateRequestInput(child, 0, 0, () =>
      api.requestFileIdentity(source, () => api.diskIdentity(source))?.stamp === expected)
  })
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(api.validateRequestInput(parent, 0, 0, composed), true)
    fs.writeFileSync(source, "export const value = 2\n")
    fs.utimesSync(source, timestamp, timestamp)
    assert.equal(composed(), true, "only the current query's composition is shared")
    assert.equal(traversals, 1)
  }, () => { throw Error("stale child proof rejected before publication") }), /stale child proof rejected/)
})

test("composition failures and changed topology epochs are not reused", t => {
  const { api } = fixture(t), aggregate = {}
  let epoch = 0, revision = 0, allowed = false, traversals = 0
  const composed = () => api.memoizeRequestInputComposition(aggregate, epoch, revision, () => {
    traversals++; return allowed
  })
  api.withSynchronousInputPreparation(() => {
    assert.equal(composed(), false)
    allowed = true
    assert.equal(composed(), true)
    assert.equal(composed(), true)
    assert.equal(traversals, 2)
    revision++
    assert.equal(composed(), true)
    epoch++
    assert.equal(composed(), true)
    assert.equal(traversals, 4)
  })
  assert.equal(composed(), true)
  assert.equal(traversals, 5, "an unscoped later call inherits no successful composition")
})


test("a failed final membership proof remains retired until a fresh owner observes the catalog", t => {
  let available = true
  const { api, catalog, proof, directories } = fixture(t, () => available)
  const control = { checkpoint() {} }
  assert.equal(proof.invalidated, false)
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    available = false
  }, () => { throw Error("unavailable") }), /unavailable/)
  assert.equal(proof.invalidated, true, "final failures must notify the owning cache, not just refuse this request")
  assert.equal(proof.directory(path.dirname(catalog.paths[0])), undefined, "retired owners cannot lend directory authority")
  available = true
  assert.equal(proof.current(catalog, [], control), false, "a retired proof cannot silently rearm")
  const fresh = api.captureCompleteMembershipProof(catalog, directories, () => available)
  assert.equal(fresh.current(catalog, [], control), true)
  assert.equal(fresh.invalidated, false)
})

test("final validation never constructs first-phase receipts that cannot be consumed", t => {
  const { api, source } = fixture(t), owner = {}
  let validations = 0, captures = 0
  api.withRequestInputValidation(() => {
    assert.equal(api.validateRequestInput(owner, 0, 0, () => {
      validations++
      api.retainPendingFileIdentity(source, () => { captures++; return api.diskIdentity(source) }, owner, 0, 0)
      return true
    }), true)
  }, () => { throw Error("unexpected stale input") })
  assert.equal(validations, 2, "the independent final owner still executes")
  assert.equal(captures, 1, "finalization cannot lend pending metadata, so it must not construct it")
})

test("resolution metadata rejects a same-size restored-mtime edit inside its actual load window", t => {
  const { api, source, catalog, proof, timestamp } = fixture(t), control = { checkpoint() {} }
  const witness = new api.LoadedConfigurationWitness()
  assert.throws(() => api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    witness.observeResolutionPath(source, () => {
      const before = fs.statSync(source)
      fs.writeFileSync(source, "export const value = 2\n")
      fs.utimesSync(source, timestamp, timestamp)
      assert.equal(fs.statSync(source).size, before.size)
      assert.equal(fs.statSync(source).mtimeMs, before.mtimeMs)
    }, control.checkpoint)
    assert.equal(witness.freshness(control.checkpoint), undefined,
      "the metadata load window must reject before a later Native final fence runs")
  }, () => { throw Error("changed input refused") }), /changed input refused/)
})


test("native leaf validation does not format unused per-file physical identities", t => {
  const { api, source, catalog, proof, directories } = fixture(t)
  const expected = api.diskIdentity(source), directoryProof = directories.directoryProof
  let derivations = 0
  directories.directoryProof = function(...args) { derivations++; return Reflect.apply(directoryProof, this, args) }
  api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], { checkpoint() {} }), true)
    assert.equal(derivations, 0, "unchanged native leaf validation must retain primitive observations without formatting every full identity")
    assert.deepEqual(api.requestFileIdentity(source, () => { throw Error("confirmed source unexpectedly reread") }), expected,
      "on-demand identity must match the actual disk identity exactly")
  }, () => { throw Error("current native observation refused") })
})


test("configuration leaf fences compare primitive stamps without repeatedly serializing the same tuple", t => {
  const { api, source, catalog, proof } = fixture(t), control = { checkpoint() {} }
  const stringify = JSON.stringify, lstat = fs.lstatSync
  let tupleSerializations = 0, reads = 0
  api.withRequestInputValidation(() => {
    assert.equal(proof.current(catalog, [], control), true)
    const expected = api.configurationSourceIdentity(source, () => undefined, control.checkpoint)
    assert.ok(expected?.regularSource)
    try {
      JSON.stringify = function(value, ...args) {
        if (Array.isArray(value) && value.length === 6 && value.every(v => typeof v === "number")) tupleSerializations++
        return Reflect.apply(stringify, this, [value, ...args])
      }
      fs.lstatSync = function(file, ...args) {
        if (file === source) reads++
        return Reflect.apply(lstat, this, [file, ...args])
      }
      const actual = api.configurationSourceIdentity(source, () => undefined, control.checkpoint)
      assert.deepEqual(actual, expected, "the exact published identity and load guard must remain unchanged")
      assert.equal(reads, 2, "both independent leaf observations remain")
      assert.equal(tupleSerializations, 0, "tuple comparisons need no JSON allocation")
    } finally { JSON.stringify = stringify; fs.lstatSync = lstat }
  }, () => { throw Error("final input unavailable") })
})


for (const field of ["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs"]) {
  test(`configuration primitive comparison still rejects a changed ${field} between its two raw observations`, t => {
    const { api, source, catalog, proof } = fixture(t), control = { checkpoint() {} }
    const lstat = fs.lstatSync
    api.withRequestInputValidation(() => {
      assert.equal(proof.current(catalog, [], control), true)
      assert.ok(api.configurationSourceIdentity(source, () => undefined, control.checkpoint))
      let calls = 0
      try {
        fs.lstatSync = function(file, ...args) {
          const stat = Reflect.apply(lstat, this, [file, ...args])
          if (file !== source || ++calls !== 2) return stat
          const changed = Object.create(stat)
          Object.defineProperty(changed, field, { value: stat[field] + 1 })
          return changed
        }
        assert.equal(api.configurationSourceIdentity(source, () => undefined, control.checkpoint), undefined)
        assert.equal(calls, 2)
      } finally { fs.lstatSync = lstat }
    }, () => { throw Error("final input unavailable") })
  })
}

for (const field of ["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs"]) {
  test(`source representation raw fallback rejects a ${field} change between raw observations`, t => {
    const { api, source, catalog, proof } = fixture(t), control = { checkpoint() {} }
    const witness = new api.LoadedConfigurationWitness()
    witness.observeSourceNamespace(source, () => fs.readFileSync(source, "utf8"))
    const original = fs.lstatSync
    let reads = 0
    api.withSynchronousInputPreparation(() => {
      assert.equal(proof.current(catalog, [], control), true)
      assert.ok(api.takeCompletedRegularSourceObservation(source, fs.realpathSync.native(path.dirname(source))),
        "consume optional native metadata to retain the full two-raw-observation fallback regression")
      try {
        fs.lstatSync = function(file, ...args) {
          const stat = Reflect.apply(original, this, [file, ...args])
          if (file !== source || ++reads !== 2) return stat
          return Object.defineProperty(Object.create(stat), field, { value: stat[field] + 1 })
        }
        assert.equal(witness.freshness(control.checkpoint), undefined,
          "an original parsed receipt cannot hide a changed raw leaf")
        assert.equal(reads, 2)
      } finally { fs.lstatSync = original }
    })
  })
}
