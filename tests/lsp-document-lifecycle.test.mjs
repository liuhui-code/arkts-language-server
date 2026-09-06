import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const basicFixtureRoot = path.join(projectRoot, "fixtures", "basic")

test("advertises open/close incremental document synchronization", async (t) => {
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
  assert.deepEqual(response.result.capabilities.textDocumentSync, {
    openClose: true,
    change: 2,
  })
})

test("applies ranged incremental changes before serving completion", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const uri = pathToFileURL(path.join(basicFixtureRoot, "IncrementalProfile.ets")).href

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
        uri,
        languageId: "arkts",
        version: 1,
        text: [
          "struct Profile {",
          "  build(): void {",
          "    this.",
          "  }",
          "}",
        ].join("\n"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 0 },
        },
        text: "  title: string = \"Ada\"\n  save(): void {}\n",
      }],
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

test("does not serve a stale overlay after the document closes", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const uri = pathToFileURL(path.join(basicFixtureRoot, "UnsavedProfile.ets")).href

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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: [
          "struct Profile {",
          "  unsavedValue: string = \"draft\"",
          "  build(): void {",
          "    this.",
          "  }",
          "}",
        ].join("\n"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 3, character: 9 },
    },
  })
  const beforeClose = await server.response(2)
  assert.equal(beforeClose.result.isIncomplete, false)
  assert.ok(beforeClose.result.items.some((item) => item.label === "unsavedValue"))

  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didClose",
    params: { textDocument: { uri } },
  })
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 3, character: 9 },
    },
  })

  const afterClose = await server.response(3)
  assert.deepEqual(afterClose.result, { isIncomplete: false, items: [] })
})
