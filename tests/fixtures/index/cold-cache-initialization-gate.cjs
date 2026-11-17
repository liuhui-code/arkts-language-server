// Public-test scheduling barrier, not a product failure injector.
// Both real initialize requests are forwarded unchanged after they are queued.
const cp = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const { createHash } = require("node:crypto")
const directory = process.env.ARKTS_TEST_CACHE_STARTUP_AUDIT
if (directory) {
  const original = cp.spawn, pending = new Map()
  const note = value => fs.appendFileSync(path.join(directory, "lifecycle.ndjson"),
    JSON.stringify({ at: Date.now(), parentPid: process.pid, ...value }) + "\n")
  cp.spawn = function(command, args, ...rest) {
    const child = original.call(this, command, args, ...rest)
    if (typeof command !== "string" || !/^arkts-index-sidecar(?:\.exe)?$/.test(path.basename(command)) || !Array.isArray(args) || args.length) return child
    note({ kind: "spawn", pid: child.pid, command,
      sha256: createHash("sha256").update(fs.readFileSync(command)).digest("hex") })
    child.stdout.on("data", chunk => fs.appendFileSync(path.join(directory, `native-${child.pid}.stdout.raw`), chunk))
    child.stderr.on("data", chunk => fs.appendFileSync(path.join(directory, `native-${child.pid}.stderr.raw`), chunk))
    child.on("close", (code, signal) => note({ kind: "close", pid: child.pid, code, signal }))
    const write = child.stdin.write
    child.stdin.write = function(...values) {
      const frame = JSON.parse(String(values[0]))
      if (frame.method !== "initialize") return write.apply(this, values)
      const key = frame.params.cacheDirectory, pair = pending.get(key) ?? []
      pair.push({ pid: child.pid, forward: () => write.apply(child.stdin, values) })
      pending.set(key, pair)
      note({ kind: "buffered", pid: child.pid, cache: key, frame, waiting: pair.length })
      if (pair.length === 2) {
        pending.delete(key)
        note({ kind: "released-pair", cache: key, pids: pair.map(entry => entry.pid) })
        for (const entry of pair) entry.forward()
      }
      return true
    }
    return child
  }
}
