import crypto from "node:crypto"
import fs from "node:fs"

const counterNames = ["readFileSync", "statSync", "lstatSync", "realpathSync", "realpathSyncNative",
  "createHash", "hashUpdate", "hashDigest", "hashUpdateInputBytes"]

/** Diagnostic native-API attempts, not kernel I/O or measurements of other threads/processes. */
export function observeInputOperations() {
  const windows = []
  let current = windowFor("setup")
  const originals = new Map()
  const count = (key, amount = 1) => { if (current) current.counts[key] += amount }
  const wrap = (original, key) => function (...args) {
    count(key)
    return Reflect.apply(original, this, args)
  }
  for (const key of ["readFileSync", "statSync", "lstatSync", "realpathSync"]) {
    const original = fs[key]
    originals.set(key, original)
    const wrapped = wrap(original, key)
    if (key === "realpathSync") {
      Object.defineProperty(wrapped, "native", {
        ...Object.getOwnPropertyDescriptor(original, "native"),
        value: wrap(original.native, "realpathSyncNative"),
      })
    }
    fs[key] = wrapped
  }
  const originalCreateHash = crypto.createHash
  crypto.createHash = function (...args) {
    count("createHash")
    const hash = Reflect.apply(originalCreateHash, this, args)
    const update = hash.update
    const digest = hash.digest
    hash.update = function (...values) {
      count("hashUpdate")
      const data = values[0]
      count("hashUpdateInputBytes", typeof data === "string"
        ? Buffer.byteLength(data, values[1]) : ArrayBuffer.isView(data) ? data.byteLength : 0)
      return Reflect.apply(update, this, values)
    }
    hash.digest = wrap(digest, "hashDigest")
    return hash
  }

  function switchWindow(phase, details) {
    windows.push(current)
    current = windowFor(phase, details)
  }

  return {
    snapshot() {
      const counts = Object.fromEntries(counterNames.map(key => [key, 0]))
      for (const window of [...windows, current].filter(Boolean)) {
        for (const key of counterNames) counts[key] += window.counts[key]
      }
      return counts
    },
    mark(phase, details) {
      if (phase === "preparation-start") switchWindow("preparation")
      else if (phase === "query-start") switchWindow("query", { scenarioId: details.scenarioId })
      else if (["preparation-complete", "query-complete", "query-failed"].includes(phase)) {
        switchWindow("outside-request")
      }
    },
    stop() {
      windows.push(current)
      current = undefined
      for (const [key, original] of originals) fs[key] = original
      crypto.createHash = originalCreateHash
      return { boundary: "OFFICIAL_DRIVER_RUN_SYNC_INPUT_APIS", countsKind: "native-api-attempts",
        normalTimingEvidence: false,
        excluded: ["preflight", "driver-load", "oracle-load", "postflight", "async-fs",
          "worker-threads", "child-processes", "kernel-syscalls"], windows }
    },
  }
}

function windowFor(phase, details = {}) {
  return { phase, ...details, counts: Object.fromEntries(counterNames.map(key => [key, 0])) }
}
