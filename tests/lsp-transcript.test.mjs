import assert from "node:assert/strict"
import { once } from "node:events"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot, withTimeout } from "./support/lsp-process.mjs"

const basicFixtureRoot = path.join(projectRoot, "fixtures", "basic")

test("initializes as a standalone ArkTS language server over stdio", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(basicFixtureRoot).href,
      capabilities: {},
    },
  })

  const response = await server.response(1)
  assert.equal(response.result.serverInfo.name, "arkts-language-server")
  assert.deepEqual(response.result.capabilities.textDocumentSync, {
    openClose: true,
    change: 2,
  })
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
      rootUri: pathToFileURL(basicFixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  const uri = pathToFileURL(path.join(basicFixtureRoot, "Profile.ets")).href
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
  const mainPath = path.join(basicFixtureRoot, "Main.ets")
  const modelPath = path.join(basicFixtureRoot, "Model.ets")
  const mainUri = pathToFileURL(mainPath).href
  const modelUri = pathToFileURL(modelPath).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(basicFixtureRoot).href,
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
      rootUri: pathToFileURL(basicFixtureRoot).href,
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
