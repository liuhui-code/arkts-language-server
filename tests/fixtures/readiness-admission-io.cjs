const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { isMainThread, threadId } = require("node:worker_threads")

// Observe native filesystem results only in the explicitly armed private LSP fixture.
if (!isMainThread && process.env.ARKTS_LSP_LOG_DIR && process.env.ARKLINE_HARMONY_SDK_PATH) {
  const directory = path.dirname(process.env.ARKTS_LSP_LOG_DIR)
  if (!path.basename(directory).startsWith("arkts-semantic-ready-")) {
    throw new Error("readiness admission observer requires its private fixture")
  }
  const declaration = path.join(process.env.ARKLINE_HARMONY_SDK_PATH, "ets", "component", "common.d.ts")
  const armed = path.join(directory, "arm-readiness-admission")
  const output = path.join(directory, "readiness-admission-io.jsonl")
  const lstat = fs.lstatSync
  fs.lstatSync = function (file, ...rest) {
    const result = Reflect.apply(lstat, this, [file, ...rest])
    if (path.resolve(String(file)) === declaration && fs.existsSync(armed)) {
      fs.appendFileSync(output, JSON.stringify({ kind: "lstat", pid: process.pid, threadId,
        caller: new Error().stack.split("\n").slice(2, 7) }) + "\n")
    }
    return result
  }
  const mutation = path.join(directory, "mutate-readiness-report-identity")
  const witness = path.join(directory, "readiness-report-identity-mutated.json")
  const createHash = crypto.createHash
  crypto.createHash = function (...args) {
    const hash = Reflect.apply(createHash, this, args), update = hash.update
    hash.update = function (data, ...rest) {
      const result = Reflect.apply(update, this, [data, ...rest])
      if (args[0] === "sha256" && typeof data === "string" && data.startsWith('{"canonicalRoot":')
        && data.includes('"sourcesSha256"') && data.includes('"backend"')
        && fs.existsSync(mutation) && !fs.existsSync(witness)) {
        const control = JSON.parse(fs.readFileSync(mutation, "utf8"))
        if (typeof control.content !== "string") throw new Error("private readiness mutation content invalid")
        const before = fs.statSync(declaration)
        fs.writeFileSync(declaration, control.content)
        fs.utimesSync(declaration, before.atime, before.mtime)
        fs.writeFileSync(witness, JSON.stringify({ pid: process.pid, threadId,
          boundary: "complete-public-input-identity-hash", bytes: Buffer.byteLength(control.content) }), { flag: "wx" })
      }
      return result
    }
    return hash
  }
}
