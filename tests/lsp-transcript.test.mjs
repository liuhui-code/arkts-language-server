import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

class LspProcess {
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

async function withTimeout(promise, timeoutMs, message) {
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

test("initializes as a standalone ArkTS language server over stdio", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: `file://${projectRoot}`,
      capabilities: {},
    },
  })

  const response = await server.response(1)
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
  assert.equal(response.result.capabilities.textDocumentSync, 1)
})

test("completes both a field and a method from the opened ArkTS snapshot", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: `file://${projectRoot}`,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  const uri = `file://${projectRoot}/fixtures/Profile.ets`
  const text = [
    "struct Profile {",
    "  title: string = \"Ada\"",
    "  save(): void {}",
    "  build(): void {",
    "    this.",
    "  }",
    "}",
  ].join("\n")
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri, languageId: "arkts", version: 1, text },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 4, character: 9 },
    },
  })

  const response = await server.response(2)
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const labels = items.map((item) => item.label)
  assert.ok(labels.includes("title"), `Expected title in ${JSON.stringify(labels)}`)
  assert.ok(labels.includes("save"), `Expected save in ${JSON.stringify(labels)}`)
})

test("returns an exact cross-file definition from an ArkTS dependency", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "basic")
  const mainPath = path.join(fixtureRoot, "Main.ets")
  const modelPath = path.join(fixtureRoot, "Model.ets")
  const mainUri = pathToFileURL(mainPath).href
  const modelUri = pathToFileURL(modelPath).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: mainUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(mainPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: mainUri },
      position: { line: 3, character: 10 },
    },
  })

  const response = await server.response(3)
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, modelUri)
  assert.deepEqual(locations[0].range.start, { line: 1, character: 2 })
})

test("acknowledges shutdown and exits cleanly", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(projectRoot).href,
      capabilities: {},
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({ jsonrpc: "2.0", id: 4, method: "shutdown", params: null })

  const shutdown = await server.response(4)
  assert.equal(shutdown.result, null)

  const exited = once(server.child, "exit")
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  const [code, signal] = await withTimeout(exited, 2_000, "Server did not exit after shutdown")
  assert.equal(code, 0)
  assert.equal(signal, null)
})
