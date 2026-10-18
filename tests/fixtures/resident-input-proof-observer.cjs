const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { isMainThread, threadId } = require("node:worker_threads")

// Diagnostic-only system-boundary observation. Native results and exceptions stay intact.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-prepared-suite-")) {
    throw new Error("resident input observer requires its private fixture")
  }
  const armed = path.join(directory, "arm-resident-input-proof")
  const output = path.join(directory, "resident-input-proof.jsonl")
  const mutationWitness = path.join(directory, "resident-input-proof-mutation.json")
  let proofStarted = false
  let mutation
  let diskGuards = 0
  const createHash = crypto.createHash
  crypto.createHash = function (...args) {
    const hash = Reflect.apply(createHash, this, args)
    const update = hash.update
    hash.update = function (data, ...rest) {
      const result = Reflect.apply(update, this, [data, ...rest])
      if (args[0] === "sha256" && typeof data === "string"
        && data.startsWith("// op02-pure-input ") && fs.existsSync(armed)) {
        fs.appendFileSync(output, JSON.stringify({ kind: "hash-update", timestamp: Date.now(), pid: process.pid, threadId,
          inputBytes: Buffer.byteLength(data, rest[0] ?? "utf8"),
          caller: new Error().stack.split("\n").slice(2, 7),
        }) + "\n")
        if (!proofStarted) {
          proofStarted = true
          const controls = JSON.parse(fs.readFileSync(armed, "utf8"))
          mutation = controls.mutation
          if (mutation && (mutation.path !== path.join(directory, "workspace", "Hidden.ets")
            || typeof mutation.content !== "string")) throw new Error("private return-window mutation invalid")
          if (controls.pause === true && !fs.existsSync(path.join(directory, "resident-input-proof-entered.json"))) {
            const entered = path.join(directory, "resident-input-proof-entered.json")
            const release = path.join(directory, "release-resident-input-proof")
            fs.writeFileSync(entered, JSON.stringify({ pid: process.pid, threadId }), { flag: "wx" })
            const deadline = Date.now() + 5000
            const cell = new Int32Array(new SharedArrayBuffer(4))
            while (!fs.existsSync(release)) {
              if (Date.now() >= deadline) throw new Error("private native hash barrier timed out")
              Atomics.wait(cell, 0, 0, 10)
            }
          }
        }
      }
      return result
    }
    return hash
  }
  const lstat = fs.lstatSync
  fs.lstatSync = function (filePath, ...rest) {
    if (proofStarted && mutation && path.resolve(String(filePath)) === mutation.path) {
      const occurrence = ++diskGuards
      const mutated = occurrence === 2 && !fs.existsSync(mutationWitness)
      if (mutated) {
        const previous = fs.statSync(mutation.path)
        fs.writeFileSync(mutationWitness, JSON.stringify({ pid: process.pid, threadId }), { flag: "wx" })
        fs.writeFileSync(mutation.path, mutation.content)
        if (mutation.restoreMtime === true) fs.utimesSync(mutation.path, previous.atime, previous.mtime)
      }
      fs.appendFileSync(output, JSON.stringify({ kind: "disk-guard", timestamp: Date.now(),
        pid: process.pid, threadId, occurrence, mutated, caller: new Error().stack.split("\n").slice(2, 6),
      }) + "\n")
    }
    return Reflect.apply(lstat, this, [filePath, ...rest])
  }
}
