#!/usr/bin/env node
// Transparent observation of a real Native child; no responses are synthesized.
import fs from "node:fs"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"

const binary = process.env.ARKTS_TEST_NATIVE_BINARY
const audit = process.env.ARKTS_TEST_NATIVE_AUDIT
if (!binary || !audit) throw new Error("native audit binary and output are required")
const append = value => fs.appendFileSync(audit, `${JSON.stringify({ at: Date.now(), ...value })}\n`)
const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] })
append({ kind: "identity", pid: child.pid, binary,
  sha256: createHash("sha256").update(fs.readFileSync(binary)).digest("hex") })
function observe(stream, destination, direction) {
  stream.setEncoding("utf8")
  let buffer = ""
  stream.on("data", chunk => {
    destination.write(chunk)
    buffer += chunk.toString("utf8")
    for (;;) {
      const end = buffer.indexOf("\n")
      if (end < 0) break
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      if (line) append({ kind: direction, frame: JSON.parse(line) })
    }
    if (buffer.length > 16 * 1024 * 1024) throw new Error("audit frame exceeded limit")
  })
}
observe(process.stdin, child.stdin, "request")
observe(child.stdout, process.stdout, "response")
child.stderr.pipe(process.stderr)
process.stdin.on("end", () => child.stdin.end())
child.stdin.on("error", error => append({ kind: "stdin-error", message: error.message }))
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal))
child.on("error", error => { append({ kind: "spawn-error", message: error.message }); process.exitCode = 1 })
child.on("exit", (code, signal) => {
  append({ kind: "exit", code, signal })
  process.exit(code ?? 1)
})
