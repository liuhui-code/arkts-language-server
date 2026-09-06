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

test("returns the exact unopened type definition for an ArkTS variable", async (t) => {
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
    id: 4,
    method: "textDocument/typeDefinition",
    params: {
      textDocument: { uri: mainUri },
      position: { line: 3, character: 2 },
    },
  })

  const response = await server.response(4)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.deepEqual(locations, [{
    uri: modelUri,
    range: {
      start: { line: 0, character: 14 },
      end: { line: 0, character: 21 },
    },
  }])
})

test("returns exact unopened implementations of an ArkTS interface and abstract class", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const contractsPath = path.join(basicFixtureRoot, "NavigationContracts.ets")
  const implementationsPath = path.join(basicFixtureRoot, "NavigationImplementations.ets")
  const contractsUri = pathToFileURL(contractsPath).href
  const implementationsUri = pathToFileURL(implementationsPath).href

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
        uri: contractsUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(contractsPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 5,
    method: "textDocument/implementation",
    params: {
      textDocument: { uri: contractsUri },
      position: { line: 0, character: 20 },
    },
  })

  const response = await server.response(5)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.deepEqual(locations, [{
    uri: implementationsUri,
    range: {
      start: { line: 2, character: 13 },
      end: { line: 2, character: 26 },
    },
  }])

  server.send({
    jsonrpc: "2.0",
    id: 6,
    method: "textDocument/implementation",
    params: {
      textDocument: { uri: contractsUri },
      position: { line: 4, character: 24 },
    },
  })

  const abstractResponse = await server.response(6)
  assert.equal(abstractResponse.error, undefined, JSON.stringify(abstractResponse.error))
  const abstractLocations = Array.isArray(abstractResponse.result)
    ? abstractResponse.result
    : [abstractResponse.result]
  assert.deepEqual(abstractLocations, [{
    uri: implementationsUri,
    range: {
      start: { line: 8, character: 13 },
      end: { line: 8, character: 30 },
    },
  }])
})

test("returns complete parameter-name inlay hints for an ArkTS call", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const documentPath = path.join(basicFixtureRoot, "InlayHints.ets")
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")

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
      textDocument: { uri: documentUri, languageId: "arkts", version: 1, text },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 7,
    method: "textDocument/inlayHint",
    params: {
      textDocument: { uri: documentUri },
      range: {
        start: { line: 5, character: 40 },
        end: { line: 5, character: 54 },
      },
    },
  })

  const response = await server.response(7)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [
    {
      position: { line: 5, character: 46 },
      label: "value:",
      kind: 2,
      paddingRight: true,
    },
    {
      position: { line: 5, character: 52 },
      label: "count:",
      kind: 2,
      paddingRight: true,
    },
  ])
})

test("returns an inferred type inlay hint within the requested UTF-16 range", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const documentPath = path.join(basicFixtureRoot, "InlayHints.ets")
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")
  const hintLine = text.split("\n")[5]
  assert.equal(hintLine.slice(0, 36).length, 36)
  assert.equal(Array.from(hintLine.slice(0, 36)).length, 35)

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
      textDocument: { uri: documentUri, languageId: "arkts", version: 1, text },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 8,
    method: "textDocument/inlayHint",
    params: {
      textDocument: { uri: documentUri },
      range: {
        start: { line: 5, character: 23 },
        end: { line: 5, character: 38 },
      },
    },
  })

  const response = await server.response(8)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [{
    position: { line: 5, character: 36 },
    label: ": string",
    kind: 1,
    paddingLeft: true,
  }])

  server.send({
    jsonrpc: "2.0",
    id: 81,
    method: "textDocument/inlayHint",
    params: {
      textDocument: { uri: documentUri },
      range: {
        start: { line: 5, character: 23 },
        end: { line: 5, character: 36 },
      },
    },
  })
  assert.deepEqual((await server.response(81)).result, [])
})

test("returns inlay hints from the latest changed ArkTS overlay", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const documentPath = path.join(basicFixtureRoot, "InlayHints.ets")
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")
  const changedText = text.replace(
    "function format(value: string, count: number): string {\n  return value.repeat(count)",
    "function format(value: string, count: number): number {\n  return count",
  )

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
      textDocument: { uri: documentUri, languageId: "arkts", version: 1, text },
    },
  })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{ text: changedText }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 9,
    method: "textDocument/inlayHint",
    params: {
      textDocument: { uri: documentUri },
      range: {
        start: { line: 5, character: 23 },
        end: { line: 5, character: 38 },
      },
    },
  })

  const response = await server.response(9)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [{
    position: { line: 5, character: 36 },
    label: ": number",
    kind: 1,
    paddingLeft: true,
  }])
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
