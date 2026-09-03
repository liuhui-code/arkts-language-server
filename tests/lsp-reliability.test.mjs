import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"
import { pathToFileURL } from "node:url"

import {
  buildScriptedSemanticServer,
  scriptedServerPath,
} from "./support/build-test-server.mjs"
import { LspProcess, projectRoot, withTimeout } from "./support/lsp-process.mjs"

buildScriptedSemanticServer()

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
  assert.equal(response.result[0].label, "fixture-v3")
  const notification = await server.notification("window/logMessage")
  assert.match(notification.params.message, /scripted completion v3/)
})

test("a newer completion request supersedes the previous request in its lane", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/LatestWins.ets`).href

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

  const latest = await server.response(11)
  assert.equal(latest.result[0].label, "fixture-v1")
  const superseded = await server.response(10)
  assert.deepEqual(superseded.result, [])
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
  assert.deepEqual(stale.result, [])
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
  assert.equal(next.result[0].label, "fixture-v1")
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
  const item = completion.result[0]
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

test("rejects forged and stale completion resolve data", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/ResolveData.ets`).href

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
        text: "struct ResolveData {}",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 34,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 7 },
    },
  })
  const completion = await server.response(34)
  const item = completion.result[0]

  server.send({
    jsonrpc: "2.0",
    id: 35,
    method: "completionItem/resolve",
    params: { ...item, label: "FORGED-CLIENT-LABEL", detail: "FORGED-CLIENT-DETAIL" },
  })
  const serverBound = await server.response(35)
  assert.equal(serverBound.result.label, item.label)
  assert.equal(serverBound.result.detail, "Resolved scripted semantic completion")
  assert.deepEqual(serverBound.result.data, item.data)

  server.send({
    jsonrpc: "2.0",
    id: 36,
    method: "completionItem/resolve",
    params: {
      ...item,
      data: { arktsCompletionId: `${item.data.arktsCompletionId}-forged` },
    },
  })
  const forged = await server.response(36)
  assert.equal(forged.error.code, -32602)

  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: "struct ResolveDataV2 {}" }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 37,
    method: "completionItem/resolve",
    params: item,
  })
  const stale = await server.response(37)
  assert.equal(stale.error.code, -32602)
})

test("shutdown rejects later requests, disposes once, and waits for exit", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/Shutdown.ets`).href

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
        text: "struct Shutdown {}",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 39,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })
  const completion = await server.response(39)
  server.send({ jsonrpc: "2.0", id: 40, method: "shutdown", params: null })
  const shutdown = await server.response(40)
  assert.equal(shutdown.result, null)
  assert.equal(server.child.exitCode, null)

  server.send({
    jsonrpc: "2.0",
    id: 41,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })
  const rejected = await server.response(41)
  assert.equal(rejected.error.code, -32600)

  server.send({
    jsonrpc: "2.0",
    id: 42,
    method: "completionItem/resolve",
    params: completion.result[0],
  })
  const rejectedResolve = await server.response(42)
  assert.equal(rejectedResolve.error.code, -32600)

  const exited = once(server.child, "exit")
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  const [code, signal] = await withTimeout(exited, 2_000, "Server did not exit")
  assert.equal(code, 0)
  assert.equal(signal, null)
  assert.equal(server.stderr.match(/SCRIPTED_DISPOSE/g)?.length, 1)
})

test("exit without shutdown disposes once and uses the failure exit code", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
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

  const exited = once(server.child, "exit")
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  const [code, signal] = await withTimeout(exited, 2_000, "Server did not exit")
  assert.equal(code, 1)
  assert.equal(signal, null)
  assert.equal(server.stderr.match(/SCRIPTED_DISPOSE/g)?.length, 1)
})
