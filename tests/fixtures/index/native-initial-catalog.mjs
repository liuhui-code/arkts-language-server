#!/usr/bin/env node
// Observe real Native frames. Delay transport only; never synthesize model/qualification data.
import fs from "node:fs"
import readline from "node:readline"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const binary = fileURLToPath(new URL("../../../target/release/" +
  (process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar"), import.meta.url))
const child = spawn(binary, [], { stdio: ["pipe", "pipe", "inherit"] })
const scenario = process.env.ARKTS_INDEX_TEST_SCENARIO
const requests = new Map()
const audit = value => {
  if (process.env.ARKTS_INDEX_TEST_AUDIT) fs.appendFileSync(process.env.ARKTS_INDEX_TEST_AUDIT,
    JSON.stringify({ at: Date.now(), ...value }) + "\n")
}
const timers = new Set()
function later(task, ms) {
  const timer = setTimeout(() => { timers.delete(timer); task() }, ms)
  timers.add(timer)
}
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line)
  requests.set(request.id, request)
  audit(request)
  if (request.method === "initialize" && scenario === "delayed-open") {
    later(() => child.stdin.write(line + "\n"), 1000)
  } else child.stdin.write(line + "\n")
}).on("close", () => { for (const timer of timers) clearTimeout(timer); child.stdin.end() })
readline.createInterface({ input: child.stdout }).on("line", line => {
  const response = JSON.parse(line), request = requests.get(response.id)
  if (request) requests.delete(response.id)
  if (response.ok && request?.method === "initialize") audit({ event: "open-complete" })
  if (response.ok && request?.method === "index/status") {
    audit({ event: "status-served", status: response.result })
  }
  if (response.event === "maintenance/terminal" && response.outcome === "qualified"
    && response.currentInput === true) audit({ event: "catalog-ready", head: response.head,
      qualification: response.qualification })
  process.stdout.write(line + "\n")
})
child.stdin.on("error", error => process.stderr.write(String(error) + "\n"))
child.on("error", error => { process.stderr.write(String(error) + "\n"); process.exitCode = 1 })
child.on("close", (code, signal) => process.stdout.write("", () => process.exit(code ?? (signal ? 1 : 0))))
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal))
