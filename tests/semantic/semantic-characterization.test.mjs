import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

test("completes inherited fields and methods after this dot", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "inherited-this")
  const documentPath = path.join(fixtureRoot, "Derived.ets")
  const documentUri = pathToFileURL(documentPath).href

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
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 4, character: 9 },
    },
  })

  const response = await server.response(2)
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const labels = items.map((item) => item.label)
  assert.ok(labels.includes("inheritedTitle"), `Expected inheritedTitle in ${JSON.stringify(labels)}`)
  assert.ok(labels.includes("inheritedRefresh"), `Expected inheritedRefresh in ${JSON.stringify(labels)}`)
})

test("maps a definition in a rewritten ArkTS struct back to source coordinates", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "struct-source-map")
  const documentPath = path.join(fixtureRoot, "Panel.ets")
  const documentUri = pathToFileURL(documentPath).href

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
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 6, character: 11 },
    },
  })

  const response = await server.response(3)
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, documentUri)
  assert.deepEqual(locations[0].range.start, { line: 3, character: 2 })
})

test("resolves a definition through an import alias and barrel export", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "alias-barrel")
  const documentPath = path.join(fixtureRoot, "Main.ets")
  const targetPath = path.join(fixtureRoot, "models", "Profile.ets")
  const documentUri = pathToFileURL(documentPath).href

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
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 3, character: 10 },
    },
  })

  const response = await server.response(4)
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, pathToFileURL(targetPath).href)
  assert.deepEqual(locations[0].range.start, { line: 1, character: 2 })
})
