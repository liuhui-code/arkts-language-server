import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

async function initializedServer(t) {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "diagnostics")
  const documentPath = path.join(fixtureRoot, "Broken.ets")
  const documentUri = pathToFileURL(documentPath).href
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  return { server, documentUri, text: fs.readFileSync(documentPath, "utf8") }
}

test("publishes versioned ArkTS diagnostics for an opened snapshot", async (t) => {
  const { server, documentUri, text } = await initializedServer(t)
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri: documentUri, languageId: "arkts", version: 7, text } },
  })

  const notification = await server.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === documentUri && message.params.version === 7,
  )
  assert.ok(notification.params.diagnostics.length > 0)
  const diagnostic = notification.params.diagnostics.find((item) => /not assignable/i.test(item.message))
  assert.ok(diagnostic, JSON.stringify(notification.params.diagnostics))
  assert.equal(diagnostic.source, "arkts")
  assert.equal(diagnostic.severity, 1)
  assert.ok(diagnostic.range.end.character > diagnostic.range.start.character)
})

test("latest document version clears obsolete diagnostics", async (t) => {
  const { server, documentUri, text } = await initializedServer(t)
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri: documentUri, languageId: "arkts", version: 1, text } },
  })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{ text: text.replace("42", "\"valid\"") }],
    },
  })

  const notification = await server.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === documentUri,
  )
  assert.equal(notification.params.version, 2)
  assert.deepEqual(notification.params.diagnostics, [])
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(
    server.messages.some((message) =>
      message.method === "textDocument/publishDiagnostics"
      && message.params.uri === documentUri
      && message.params.version === 1),
    false,
  )
})

test("closing a document clears diagnostics and prevents late publication", async (t) => {
  const { server, documentUri, text } = await initializedServer(t)
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri: documentUri, languageId: "arkts", version: 1, text } },
  })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didClose",
    params: { textDocument: { uri: documentUri } },
  })

  const notification = await server.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === documentUri,
  )
  assert.equal(notification.params.version, undefined)
  assert.deepEqual(notification.params.diagnostics, [])
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(
    server.messages.some((message) =>
      message.method === "textDocument/publishDiagnostics"
      && message.params.uri === documentUri
      && message.params.diagnostics.length > 0),
    false,
  )
})
