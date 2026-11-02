import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createInterface } from "node:readline"
import { buildSync } from "esbuild"

const projectRoot = path.resolve(import.meta.dirname, "../..")

export function readAudit(auditPath) {
  return fs.readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
}

export function buildDriver(temporaryRoot) {
  const outfile = path.join(temporaryRoot, "adapter-driver.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "tests", "fixtures", "index", "adapter-driver.ts")],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
  })
  return outfile
}

export function makeExecutableFixture(temporaryRoot, fixtureName) {
  const source = path.join(projectRoot, "tests", "fixtures", "index", fixtureName)
  const destination = path.join(temporaryRoot, fixtureName)
  fs.copyFileSync(source, destination)
  fs.chmodSync(destination, 0o755)
  return destination
}

export class DriverProcess {
  constructor(driverPath, env = {}) {
    this.child = spawn(process.execPath, [driverPath], {
      cwd: os.tmpdir(),
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.nextId = 1
    this.pending = new Map()
    this.stderr = ""
    this.child.stderr.setEncoding("utf8")
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk })
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      const response = JSON.parse(line)
      const pending = this.pending.get(response.id)
      if (!pending) return
      this.pending.delete(response.id)
      clearTimeout(pending.timeout)
      if (response.ok) pending.resolve(response.result)
      else pending.reject(Object.assign(new Error(response.error.message), response.error))
    })
  }

  call(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`timed out waiting for driver ${method}; stderr: ${this.stderr}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.child.stdin.write(`${JSON.stringify({ id, method, ...params })}\n`)
    })
  }

  async close() {
    if (this.child.exitCode !== null) return
    try {
      await this.call("exit")
    } catch {}
    this.child.stdin.end()
    this.child.kill("SIGTERM")
    await once(this.child, "close")
  }

  async gracefulExit(timeoutMs = 2_000) {
    if (this.child.exitCode !== null) return
    await this.call("exit")
    this.child.stdin.end()
    if (this.child.exitCode !== null) return
    await new Promise((resolve, reject) => {
      const onClose = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        this.child.off("close", onClose)
        reject(new Error("adapter driver retained a completed request timer"))
      }, timeoutMs)
      this.child.once("close", onClose)
    })
  }
}
