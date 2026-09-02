import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { projectRoot } from "./support/lsp-process.mjs"

test("prints the absolute language-server log path without starting LSP", (t) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-log-path-"))
  t.after(() => fs.rmSync(logDirectory, { recursive: true, force: true }))

  const result = spawnSync(
    path.join(projectRoot, "bin", "arkts-language-server"),
    ["--print-log-path"],
    {
      cwd: os.tmpdir(),
      encoding: "utf8",
      env: { ...process.env, ARKTS_LSP_LOG_DIR: logDirectory },
      timeout: 2_000,
    },
  )

  assert.equal(result.status, 0, result.stderr || result.error?.message)
  assert.equal(result.stderr, "")
  assert.equal(result.stdout.trim(), path.join(logDirectory, "server.log"))
})

test("writes structured lifecycle and request logs without polluting LSP stdout", async (t) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-structured-log-"))
  t.after(() => fs.rmSync(logDirectory, { recursive: true, force: true }))
  const session = new LoggingLsp(logDirectory)
  t.after(() => session.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "basic")
  const documentPath = path.join(fixtureRoot, "Profile.ets")
  const documentUri = pathToFileURL(documentPath).href

  session.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri: pathToFileURL(fixtureRoot).href, capabilities: {} },
  })
  assert.ok((await session.response(1)).result)
  session.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  session.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  session.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: { textDocument: { uri: documentUri }, position: { line: 4, character: 9 } },
  })
  assert.ok((await session.response(2)).result)
  session.send({ jsonrpc: "2.0", id: 3, method: "shutdown", params: null })
  await session.response(3)
  session.send({ jsonrpc: "2.0", method: "exit", params: null })
  await session.exited()

  const stderrEntries = parseLogLines(session.stderr)
  const fileEntries = parseLogLines(fs.readFileSync(path.join(logDirectory, "server.log"), "utf8"))
  const requiredEvents = ["server.started", "lsp.initialized", "request.completed", "server.stopped"]
  for (const event of requiredEvents) {
    assert.ok(stderrEntries.some((entry) => entry.event === event), `missing stderr event ${event}`)
    assert.ok(fileEntries.some((entry) => entry.event === event), `missing file event ${event}`)
  }
  for (const entry of [...stderrEntries, ...fileEntries]) {
    assert.equal(entry.schema, 1)
    assert.equal(typeof entry.ts, "string")
    assert.equal(typeof entry.level, "string")
    assert.equal(typeof entry.event, "string")
    assert.equal(typeof entry.pid, "number")
  }
  const serialized = JSON.stringify(fileEntries)
  assert.doesNotMatch(serialized, /Ada|this\./)
  assert.ok(session.frameCount >= 3)
})

test("keeps serving LSP when the configured log directory is unusable", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-degraded-log-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const notADirectory = path.join(temporaryRoot, "not-a-directory")
  fs.writeFileSync(notADirectory, "occupied")
  const session = new LoggingLsp(notADirectory)
  t.after(() => session.close())

  session.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri: null, capabilities: {} },
  })
  assert.equal((await session.response(1)).result.serverInfo.name, "arkts-language-server")
  session.send({ jsonrpc: "2.0", id: 2, method: "shutdown", params: null })
  await session.response(2)
  session.send({ jsonrpc: "2.0", method: "exit", params: null })
  await session.exited()

  const entries = parseLogLines(session.stderr)
  assert.ok(entries.some((entry) => entry.event === "logging.degraded"))
  assert.ok(entries.some((entry) => entry.event === "server.started"))
  assert.ok(session.frameCount >= 2)
})

function parseLogLines(value) {
  return value.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
}

class LoggingLsp {
  constructor(logDirectory) {
    this.child = spawn(path.join(projectRoot, "bin", "arkts-language-server"), ["--stdio"], {
      cwd: os.tmpdir(),
      env: { ...process.env, ARKTS_LSP_LOG_DIR: logDirectory },
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.buffer = Buffer.alloc(0)
    this.messages = []
    this.waiters = []
    this.stderr = ""
    this.frameCount = 0
    this.child.stdout.on("data", (chunk) => this.accept(chunk))
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk.toString() })
  }

  send(message) {
    const body = Buffer.from(JSON.stringify(message))
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.child.stdin.write(body)
  }

  response(id, timeoutMs = 3_000) {
    const queued = this.messages.findIndex((message) => message.id === id)
    if (queued >= 0) return Promise.resolve(this.messages.splice(queued, 1)[0])
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timed out waiting for ${id}. stderr: ${this.stderr}`)),
        timeoutMs,
      )
      this.waiters.push({ id, resolve, timeout })
    })
  }

  exited() {
    return this.child.exitCode === null ? once(this.child, "exit") : Promise.resolve()
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
      assert.match(header, /^Content-Length:/, `non-LSP stdout: ${header}`)
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1])
      const bodyStart = headerEnd + 4
      if (!Number.isFinite(length) || this.buffer.length < bodyStart + length) return
      const message = JSON.parse(this.buffer.subarray(bodyStart, bodyStart + length).toString("utf8"))
      this.buffer = this.buffer.subarray(bodyStart + length)
      this.frameCount += 1
      const index = this.waiters.findIndex((waiter) => waiter.id === message.id)
      if (index < 0) this.messages.push(message)
      else {
        const [{ resolve, timeout }] = this.waiters.splice(index, 1)
        clearTimeout(timeout)
        resolve(message)
      }
    }
  }
}
