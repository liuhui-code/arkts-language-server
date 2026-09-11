import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildScriptedSemanticServer } from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const scriptedServerPath = buildScriptedSemanticServer()

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

test("an explicit references request quiesces diagnostics and republishes them afterward", async (t) => {
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "diagnostics")
  const documentUri = pathToFileURL(path.join(fixtureRoot, "Deferred.ets")).href
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 7,
        text: "// DIAGNOSTICS_ABORT_THEN_RETURN\nstruct Deferred {}",
      },
    },
  })

  await server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`scripted diagnostics entered ${documentUri}`),
  )
  const diagnostics = server.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === documentUri && message.params.version === 7,
  )
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/references",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 1, character: 7 },
      context: { includeDeclaration: true },
    },
  })

  const references = await server.response(2)
  assert.equal(references.error, undefined)
  assert.deepEqual(references.result, [])
  const publication = await diagnostics
  assert.deepEqual(publication.params, {
    uri: documentUri,
    version: 7,
    diagnostics: [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      severity: 1,
      code: 9001,
      source: "arkts",
      message: "Scripted deferred diagnostic",
    }],
  })
})

test("a document change during references republishes diagnostics only for the latest version", async (t) => {
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "diagnostics")
  const documentUri = pathToFileURL(path.join(fixtureRoot, "DeferredChange.ets")).href
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
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
  const text = [
    "// DIAGNOSTICS_ABORT_THEN_RETURN",
    "// WORKSPACE_GLOBAL_IGNORES_ABORT",
    "struct DeferredChange {}",
  ].join("\n")
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: documentUri, languageId: "arkts", version: 1, text },
    },
  })

  await server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`scripted diagnostics entered ${documentUri}`),
  )
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/references",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 2, character: 7 },
      context: { includeDeclaration: true },
    },
  })
  await server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`workspace-global references entered ${documentUri}`),
  )
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{ text: `${text}\n// changed while references was active` }],
    },
  })

  const references = await server.response(3)
  assert.equal(references.result, undefined)
  assert.equal(references.error?.code, -32801)
  const publication = await server.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === documentUri,
  )
  assert.equal(publication.params.version, 2)
  assert.deepEqual(publication.params.diagnostics.map(({ code }) => code), [9001])
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(
    server.messages.some((message) =>
      message.method === "textDocument/publishDiagnostics"
      && message.params.uri === documentUri
      && message.params.version === 1),
    false,
  )
})

test("concurrent references requests share the same diagnostic quiescence barrier", async (t) => {
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "diagnostics")
  const documentUri = pathToFileURL(path.join(fixtureRoot, "Concurrent.ets")).href
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: "// DIAGNOSTICS_ABORT_THEN_RETURN_DELAYED\nstruct Concurrent {}",
      },
    },
  })
  await server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`scripted diagnostics entered ${documentUri}`),
  )

  const order = []
  const settled = server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`scripted diagnostics settled ${documentUri}`),
  ).then(() => order.push("diagnostics-settled"))
  for (const id of [4, 5]) {
    server.send({
      jsonrpc: "2.0",
      id,
      method: "textDocument/references",
      params: {
        textDocument: { uri: documentUri },
        position: { line: 1, character: 7 },
        context: { includeDeclaration: true },
      },
    })
  }
  const responses = [4, 5].map((id) => server.response(id).then((response) => {
    order.push(`response-${id}`)
    return response
  }))

  await Promise.all([settled, ...responses])
  assert.equal(order[0], "diagnostics-settled", JSON.stringify(order))
  const results = await Promise.all(responses)
  assert.deepEqual(results.map(({ error }) => error?.code ?? null).sort(), [-32801, null])
  assert.deepEqual(results.find(({ error }) => error === undefined)?.result, [])
})
