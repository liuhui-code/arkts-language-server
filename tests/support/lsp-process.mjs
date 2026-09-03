import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

function hasOwn(message, key) {
  return message !== null
    && typeof message === "object"
    && Object.prototype.hasOwnProperty.call(message, key)
}

function isResponse(message) {
  return hasOwn(message, "id") && !hasOwn(message, "method")
}

function isServerRequest(message) {
  return hasOwn(message, "id") && typeof message.method === "string"
}

function isNotification(message) {
  return !hasOwn(message, "id") && typeof message?.method === "string"
}

function protocolFailure(code, message, details = {}) {
  return Object.assign(new Error(`LSP protocol failure: ${message}`), { code, ...details })
}

function contentLengthFromHeader(header) {
  const contentLengthLines = header.split("\r\n")
    .filter((line) => /^Content-Length:/i.test(line))
  const contentLength = contentLengthLines.length === 1
    ? /^Content-Length:\s*(\d+)\s*$/i.exec(contentLengthLines[0])
    : null
  const length = Number(contentLength?.[1])
  return contentLength && Number.isSafeInteger(length) ? length : undefined
}

export class LspProcess {
  constructor({
    serverPath = "dist/server.cjs",
    command = process.execPath,
    args = [serverPath, "--stdio"],
    cwd = projectRoot,
    env,
    maxHeaderBytes = 8 * 1_024,
    maxFrameBytes = 16 * 1_024 * 1_024,
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
    this.maxHeaderBytes = maxHeaderBytes
    this.maxFrameBytes = maxFrameBytes
    this.child.stdout.on("data", (chunk) => this.acceptSafely(chunk))
    this.child.stdout.on("end", () => this.handleStdoutEnd())
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk.toString() })
    this.child.on("close", (code, signal) => this.rejectPendingOnClose(code, signal))
  }

  send(message) {
    const body = Buffer.from(JSON.stringify(message))
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.child.stdin.write(body)
  }

  response(id, timeoutMs = 5_000) {
    const matches = (message) => isResponse(message) && message.id === id
    const queued = this.messages.findIndex(matches)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return this.waitFor(
      matches,
      `LSP response ${id}`,
      timeoutMs,
    )
  }

  notification(method, predicate = () => true, timeoutMs = 5_000) {
    const matches = (message) => isNotification(message)
      && message.method === method
      && predicate(message)
    const queued = this.messages.findIndex(matches)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return this.waitFor(matches, `LSP notification ${method}`, timeoutMs)
  }

  progress(token, predicate = () => true, timeoutMs = 5_000) {
    const matches = (message) => isNotification(message)
      && message.method === "$/progress"
      && message.params?.token === token
      && predicate(message)
    const queued = this.messages.findIndex(matches)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return this.waitFor(matches, `LSP progress ${JSON.stringify(token)}`, timeoutMs)
  }

  serverRequest(method, predicate = () => true, timeoutMs = 5_000) {
    const matches = (message) => isServerRequest(message)
      && message.method === method
      && predicate(message)
    const queued = this.messages.findIndex(matches)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return this.waitFor(matches, `LSP server request ${method}`, timeoutMs)
  }

  waitFor(matches, description, timeoutMs) {
    if (this.transportFailure) return Promise.reject(this.transportFailure)
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

  handleStdoutEnd() {
    if (this.transportFailure || this.buffer.length === 0) return
    const headerEnd = this.buffer.indexOf("\r\n\r\n")
    if (headerEnd < 0) {
      this.failTransport(protocolFailure(
        "LSP_TRUNCATED_FRAME",
        `stdout ended after ${this.buffer.length} header bytes; expected header terminator`,
        {
          phase: "header",
          expected: "\\r\\n\\r\\n",
          received: this.buffer.length,
        },
      ))
      return
    }

    const header = this.buffer.subarray(0, headerEnd).toString("ascii")
    const expected = contentLengthFromHeader(header)
    const received = this.buffer.length - (headerEnd + 4)
    if (expected !== undefined && received < expected) {
      this.failTransport(protocolFailure(
        "LSP_TRUNCATED_FRAME",
        `stdout ended after ${received} of ${expected} body bytes`,
        { phase: "body", expected, received },
      ))
    }
  }

  accept(chunk) {
    if (this.transportFailure) return
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n")
      const receivedHeaderBytes = headerEnd < 0 ? this.buffer.length : headerEnd
      if (receivedHeaderBytes > this.maxHeaderBytes) {
        this.failTransport(protocolFailure(
          "LSP_HEADER_TOO_LARGE",
          `header exceeds ${this.maxHeaderBytes} bytes`,
          { limit: this.maxHeaderBytes, received: receivedHeaderBytes },
        ))
        return
      }
      if (headerEnd < 0) return
      const header = this.buffer.subarray(0, headerEnd).toString("ascii")
      const length = contentLengthFromHeader(header)
      if (length === undefined) {
        const excerpt = header.length > 160 ? `${header.slice(0, 160)}…` : header
        this.failTransport(protocolFailure(
          "LSP_INVALID_HEADER",
          `invalid Content-Length header ${JSON.stringify(excerpt)}`,
        ))
        return
      }
      if (length > this.maxFrameBytes) {
        this.failTransport(protocolFailure(
          "LSP_FRAME_TOO_LARGE",
          `frame exceeds ${this.maxFrameBytes} bytes`,
          { limit: this.maxFrameBytes, received: length },
        ))
        return
      }
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
