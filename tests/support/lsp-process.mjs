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

function messageKind(message) {
  if (isResponse(message)) return "response"
  if (isServerRequest(message)) return "request"
  if (isNotification(message)) return "notification"
  return "unknown"
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

function utf8Prefix(value, maxBytes) {
  let result = ""
  let used = 0
  for (const character of value) {
    const bytes = Buffer.byteLength(character)
    if (used + bytes > maxBytes) break
    result += character
    used += bytes
  }
  return result
}

function utf8Suffix(value, maxBytes) {
  let result = ""
  let used = 0
  const characters = Array.from(value)
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const bytes = Buffer.byteLength(characters[index])
    if (used + bytes > maxBytes) break
    result = characters[index] + result
    used += bytes
  }
  return result
}

function boundedText(value, maxBytes) {
  if (Buffer.byteLength(value) <= maxBytes) return value
  const marker = "\n… diagnostic truncated …\n"
  const markerBytes = Buffer.byteLength(marker)
  if (maxBytes <= markerBytes) return utf8Prefix(marker, maxBytes)
  const remaining = maxBytes - markerBytes
  const tailBytes = Math.floor(remaining / 2)
  return utf8Prefix(value, remaining - tailBytes)
    + marker
    + utf8Suffix(value, tailBytes)
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
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
    maxStderrBytes = 64 * 1_024,
    maxDiagnosticTextBytes = 4 * 1_024,
    maxTranscriptEntries = 128,
    maxTranscriptBytes = 64 * 1_024,
  } = {}) {
    this.child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : undefined,
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.buffer = Buffer.alloc(0)
    this.messages = []
    this.waiters = []
    this.stderrHead = Buffer.alloc(0)
    this.stderrTail = Buffer.alloc(0)
    this.stderrTotalBytes = 0
    this.transcriptEntries = []
    this.transcriptSequence = 0
    this.transcriptTotalEntries = 0
    this.transcriptRetainedBytes = 0
    this.transportFailure = undefined
    this.closePromise = undefined
    this.maxHeaderBytes = maxHeaderBytes
    this.maxFrameBytes = maxFrameBytes
    this.maxStderrBytes = maxStderrBytes
    this.maxDiagnosticTextBytes = maxDiagnosticTextBytes
    this.maxTranscriptEntries = maxTranscriptEntries
    this.maxTranscriptBytes = maxTranscriptBytes
    this.child.stdout.on("data", (chunk) => this.acceptSafely(chunk))
    this.child.stdout.on("end", () => this.handleStdoutEnd())
    this.child.stderr.on("data", (chunk) => this.acceptStderr(chunk))
    this.child.on("close", (code, signal) => this.rejectPendingOnClose(code, signal))
  }

  send(message) {
    const body = Buffer.from(JSON.stringify(message))
    this.recordTranscript("send", message, body.length)
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.child.stdin.write(body)
  }

  get stderrRetainedBytes() {
    return this.stderrHead.length + this.stderrTail.length
  }

  get stderrDroppedBytes() {
    return this.stderrTotalBytes - this.stderrRetainedBytes
  }

  get stderr() {
    const head = this.stderrHead.toString("utf8")
    const tail = this.stderrTail.toString("utf8")
    if (this.stderrDroppedBytes === 0) return head + tail
    return `${head}\n… ${this.stderrDroppedBytes} stderr bytes omitted …\n${tail}`
  }

  acceptStderr(chunk) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    this.stderrTotalBytes += bytes.length
    const headLimit = Math.ceil(this.maxStderrBytes / 2)
    const tailLimit = this.maxStderrBytes - headLimit
    const headRemaining = Math.max(0, headLimit - this.stderrHead.length)
    const headBytes = Math.min(headRemaining, bytes.length)
    if (headBytes > 0) {
      this.stderrHead = Buffer.concat([this.stderrHead, bytes.subarray(0, headBytes)])
    }
    if (tailLimit === 0 || headBytes === bytes.length) return

    const remainder = bytes.subarray(headBytes)
    if (remainder.length >= tailLimit) {
      this.stderrTail = Buffer.from(remainder.subarray(remainder.length - tailLimit))
      return
    }
    const previousBytes = Math.min(this.stderrTail.length, tailLimit - remainder.length)
    this.stderrTail = Buffer.concat([
      this.stderrTail.subarray(this.stderrTail.length - previousBytes),
      remainder,
    ])
  }

  boundedDiagnostic(value) {
    return boundedText(value, this.maxDiagnosticTextBytes)
  }

  recordTranscript(direction, message, byteSize) {
    const entry = {
      direction,
      sequence: this.transcriptSequence + 1,
      kind: messageKind(message),
      method: typeof message?.method === "string" ? message.method : null,
      id: hasOwn(message, "id") ? message.id : null,
      byteSize,
    }
    const storageBytes = Buffer.byteLength(JSON.stringify(entry))
    this.transcriptSequence = entry.sequence
    this.transcriptTotalEntries += 1
    this.transcriptRetainedBytes += storageBytes
    this.transcriptEntries.push({ entry, storageBytes })
    while (this.transcriptEntries.length > this.maxTranscriptEntries
      || this.transcriptRetainedBytes > this.maxTranscriptBytes) {
      const dropped = this.transcriptEntries.shift()
      this.transcriptRetainedBytes -= dropped.storageBytes
    }
  }

  parserSnapshot() {
    const headerEnd = this.buffer.indexOf("\r\n\r\n")
    if (headerEnd < 0) {
      return {
        phase: "header",
        bufferedBytes: this.buffer.length,
        expectedBytes: null,
        receivedBytes: this.buffer.length,
      }
    }
    const header = this.buffer.subarray(0, headerEnd).toString("ascii")
    return {
      phase: "body",
      bufferedBytes: this.buffer.length,
      expectedBytes: contentLengthFromHeader(header) ?? null,
      receivedBytes: this.buffer.length - (headerEnd + 4),
    }
  }

  terminalSnapshot() {
    let state = "running"
    if (this.transportFailure) state = "failed"
    else if (this.child.exitCode !== null || this.child.signalCode !== null) state = "exited"
    else if (this.closePromise) state = "closing"
    return {
      state,
      exitCode: this.child.exitCode,
      signal: this.child.signalCode,
      failureCode: this.transportFailure?.code ?? null,
    }
  }

  diagnosticSnapshot() {
    return deepFreeze({
      pid: this.child.pid,
      terminal: this.terminalSnapshot(),
      pendingDescriptions: this.waiters.map((waiter) => waiter.description),
      parser: this.parserSnapshot(),
      stderr: {
        text: this.stderr,
        totalBytes: this.stderrTotalBytes,
        retainedBytes: this.stderrRetainedBytes,
        droppedBytes: this.stderrDroppedBytes,
      },
      transcript: {
        entries: this.transcriptEntries.map(({ entry }) => ({ ...entry })),
        retainedBytes: this.transcriptRetainedBytes,
        totalEntries: this.transcriptTotalEntries,
        droppedEntries: this.transcriptTotalEntries - this.transcriptEntries.length,
      },
    })
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
        reject(new Error(this.boundedDiagnostic(
          `Timed out waiting for ${description}. stderr: ${this.stderr}`,
        )))
      }, timeoutMs)
      this.waiters.push(waiter)
    })
  }

  rejectPendingOnClose(code, signal) {
    const waiters = this.waiters.splice(0)
    for (const { reject, description, timeout } of waiters) {
      clearTimeout(timeout)
      reject(new Error(
        this.boundedDiagnostic(
          `LSP process exited before ${description} (code=${code}, signal=${signal}). `
          + `stderr: ${this.stderr.trimEnd() || "<empty>"}`,
        ),
      ))
    }
  }

  failTransport(error) {
    if (this.transportFailure) return
    error.message = this.boundedDiagnostic(error.message)
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
      this.recordTranscript("receive", message, length)
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
