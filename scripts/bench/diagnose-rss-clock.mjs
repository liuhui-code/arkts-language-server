import fs from "node:fs"
import { spawn, execFileSync } from "node:child_process"
import { createProcessResourceProbe } from "../../tests/support/process-resource-probe.mjs"

const ticks = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim())
const probe = createProcessResourceProbe({ platform: "linux", now: Date.now,
  readFile: fs.promises.readFile, clockTicksPerSecond: ticks })
const identity = await probe.identify(process.pid)
const end = performance.now() + 60_000
let samples = 0, errors = 0, attempts = 0
while (attempts < 100 && performance.now() < end) {
  attempts++
  const child = spawn(process.execPath, ["-e",
    'const e=require("esbuild"); e.build({stdin:{contents:"export const value=1"},write:false}).then(()=>e.stop())'],
  { stdio: "ignore" })
  let done = false
  const closed = new Promise(resolve => child.once("close", () => { done = true; resolve() }))
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
  while (!done) {
    try { await probe.sample(identity); samples++ }
    catch (error) { errors++; console.error(JSON.stringify({ attempt: attempts,
      samples, code: error.code, message: error.message })) }
  }
  clearTimeout(timer)
  await closed
}
console.log(JSON.stringify({ attempts, samples, errors, scope: "real Linux procfs and young esbuild processes" }))
if (errors) process.exitCode = 1
