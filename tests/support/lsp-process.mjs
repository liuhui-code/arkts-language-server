import { spawn } from "node:child_process"
import { once } from "node:events"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export class LspProcess {
  constructor() {
    this.child = spawn(process.execPath, ["dist/server.cjs", "--stdio"], {
      cwd: projectRoot,
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

  response(id, timeoutMs = 2_000) {
    const queued = this.messages.findIndex((message) => message.id === id)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for LSP response ${id}. stderr: ${this.stderr}`))
      }, timeoutMs)
      this.waiters.push({ id, resolve, timeout })
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
      const waiter = this.waiters.findIndex((candidate) => candidate.id === message.id)
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
