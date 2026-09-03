import { spawn } from "node:child_process"
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
    this.transportFailure = undefined
    this.closePromise = undefined
    this.child.stdout.on("data", (chunk) => this.acceptSafely(chunk))
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk.toString() })
    this.child.on("close", (code, signal) => this.rejectPendingOnClose(code, signal))
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
      const waiter = { matches, resolve, reject, description, timeout: undefined }
      waiter.timeout = setTimeout(() => {
        const index = this.waiters.indexOf(waiter)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(new Error(`Timed out waiting for ${description}. stderr: ${this.stderr}`))
      }, timeoutMs)
      this.waiters.push(waiter)
    })
  }

  rejectPendingOnClose(code, signal) {
    const waiters = this.waiters.splice(0)
    for (const { reject, description, timeout } of waiters) {
      clearTimeout(timeout)
      reject(new Error(
        `LSP process exited before ${description} (code=${code}, signal=${signal}). `
        + `stderr: ${this.stderr.trimEnd() || "<empty>"}`,
      ))
    }
  }

  failTransport(error) {
    if (this.transportFailure) return
    this.transportFailure = error
    const waiters = this.waiters.splice(0)
    for (const { reject, timeout } of waiters) {
      clearTimeout(timeout)
      reject(error)
    }
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGTERM")
    }
  }

  close({ graceMs = 1_000 } = {}) {
    if (this.closePromise) return this.closePromise
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      this.closePromise = Promise.resolve({
        code: this.child.exitCode,
        signal: this.child.signalCode,
      })
      return this.closePromise
    }

    this.closePromise = new Promise((resolve) => {
      const onExit = (code, signal) => {
        clearTimeout(escalation)
        resolve({ code, signal })
      }
      const escalation = setTimeout(() => {
        if (this.child.exitCode === null && this.child.signalCode === null) {
          this.child.kill("SIGKILL")
        }
      }, graceMs)

      this.child.once("exit", onExit)
      this.child.kill("SIGTERM")
    })
    return this.closePromise
  }

  acceptSafely(chunk) {
    try {
      this.accept(chunk)
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause)
      const excerptLimit = 160
      const excerpt = detail.length > excerptLimit
        ? `${detail.slice(0, excerptLimit)}…`
        : detail
      this.failTransport(new Error(
        `LSP transport failure: accept handler threw. cause=${JSON.stringify(excerpt)}`,
        { cause },
      ))
    }
  }

  accept(chunk) {
    if (this.transportFailure) return
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
      const rawBody = this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8")
      let message
      try {
        message = JSON.parse(rawBody)
      } catch (cause) {
        const excerptLimit = 160
        const excerpt = rawBody.length > excerptLimit
          ? `${rawBody.slice(0, excerptLimit)}…`
          : rawBody
        this.failTransport(new Error(
          `LSP protocol failure: invalid JSON. raw=${JSON.stringify(excerpt)}`,
          { cause },
        ))
        return
      }
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
