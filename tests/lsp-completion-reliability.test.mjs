import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildScriptedSemanticServer } from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const scriptedServerPath = buildScriptedSemanticServer()

test("runs injected semantic services and observes framed notifications", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/Injected.ets`).href

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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 3,
        text: "struct Injected {}",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })

  const response = await server.response(2)
  assert.equal(response.result.isIncomplete, false)
  assert.equal(response.result.items[0].label, "fixture-v3")
  const notification = await server.notification("window/logMessage")
  assert.match(notification.params.message, /scripted completion v3/)
})

test("preserves independent current completion consumers at different positions", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/IndependentConsumers.ets`).href

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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "// DELAY_IGNORING_ABORT",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 10,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 11,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 1 },
    },
  })

  for (const id of [11, 10]) {
    const response = await server.response(id)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.equal(response.result.isIncomplete, false)
    assert.equal(response.result.items[0].label, "stale-v1")
  }
  assert.doesNotMatch(server.stderr, /SCRIPTED_STALE_ABORT/)
})

test("drops a semantic result for a superseded document version", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/StaleVersion.ets`).href

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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "// DELAY_IGNORING_ABORT",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 20,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: "// current version" }],
    },
  })

  const stale = await server.response(20)
  assert.deepEqual(stale.result, { isIncomplete: false, items: [] })
  assert.match(server.stderr, /SCRIPTED_STALE_ABORT/)
})

test("maps client cancellation to the semantic abort signal and RequestCancelled", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/ClientCancel.ets`).href

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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "// FIRST_WAITS_FOR_ABORT",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 30,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })
  server.send({
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id: 30 },
  })

  const cancelled = await server.response(30)
  assert.equal(cancelled.error.code, -32800)

  server.send({
    jsonrpc: "2.0",
    id: 31,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 1 },
    },
  })
  const next = await server.response(31)
  assert.equal(next.result.isIncomplete, false)
  assert.equal(next.result.items[0].label, "fixture-v1")
})

test("maps completion resolve cancellation to the semantic abort signal", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/ResolveCancel.ets`).href

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
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "// RESOLVE_WAITS_FOR_ABORT",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 32,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })
  const completion = await server.response(32)
  const item = completion.result.items[0]
  assert.ok(item.data?.arktsCompletionId)

  server.send({
    jsonrpc: "2.0",
    id: 33,
    method: "completionItem/resolve",
    params: item,
  })
  server.send({
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id: 33 },
  })

  const cancelled = await server.response(33)
  assert.equal(cancelled.error.code, -32800)
})
