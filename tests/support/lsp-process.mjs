import { spawn } from "node:child_process"
import { once } from "node:events"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export class LspProcess {
  constructor({
    serverPath = "dist/server.cjs",
    command = process.execPath,
    args = [serverPath, "--stdio"],
    cwd = projectRoot,
    env,
  } = {}) {
    this.child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.buffer = Buffer.alloc(0)
    this.messages = []
    this.waiters = []
    this.stderr = ""
    this.child.stdout.on("data", (chunk) => this.accept(chunk))
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk.toString() })
  }

  send(message) {
    const body = Buffer.from(JSON.stringify(message))
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.child.stdin.write(body)
  }

  response(id, timeoutMs = 5_000) {
    const queued = this.messages.findIndex((message) => message.id === id)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return this.waitFor(
      (message) => message.id === id,
      `LSP response ${id}`,
      timeoutMs,
    )
  }

  notification(method, predicate = () => true, timeoutMs = 5_000) {
    const matches = (message) => message.method === method && predicate(message)
    const queued = this.messages.findIndex(matches)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return this.waitFor(matches, `LSP notification ${method}`, timeoutMs)
  }

  waitFor(matches, description, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${description}. stderr: ${this.stderr}`))
      }, timeoutMs)
      this.waiters.push({ matches, resolve, timeout })
    })
  }

  async close() {
    if (this.child.exitCode !== null) return
    this.child.kill("SIGTERM")
    await once(this.child, "exit")
  }

  accept(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n")
      if (headerEnd < 0) return
      const header = this.buffer.subarray(0, headerEnd).toString("ascii")
      if (!header.startsWith("Content-Length:")) {
        throw new Error(`Non-LSP output on stdout: ${JSON.stringify(header)}`)
      }
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1])
      if (!Number.isFinite(length)) throw new Error(`Invalid LSP header: ${header}`)
      const bodyStart = headerEnd + 4
      if (this.buffer.length < bodyStart + length) return
      const message = JSON.parse(this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8"))
      this.buffer = this.buffer.subarray(bodyStart + length)
      const waiter = this.waiters.findIndex((candidate) => candidate.matches(message))
      if (waiter >= 0) {
        const [{ resolve, timeout }] = this.waiters.splice(waiter, 1)
        clearTimeout(timeout)
        resolve(message)
      } else {
        this.messages.push(message)
      }
    }
  }
}

export async function withTimeout(promise, timeoutMs, message) {
  let timeout
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timeout)
  }
}
