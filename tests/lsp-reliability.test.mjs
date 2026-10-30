import assert from "node:assert/strict"
import { once } from "node:events"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildScriptedSemanticServer } from "./support/build-test-server.mjs"
import { LspProcess, projectRoot, withTimeout } from "./support/lsp-process.mjs"

const scriptedServerPath = buildScriptedSemanticServer()

test("maps code-action resolve cancellation to RequestCancelled without leaking an edit", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/CodeActionResolveCancel.ets`).href

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
        text: "// CODE_ACTION_RESOLVE_WAITS_FOR_ABORT",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 43,
    method: "textDocument/codeAction",
    params: {
      textDocument: { uri },
      range: zeroLspRange(),
      context: { diagnostics: [], only: ["quickfix"] },
    },
  })
  const listed = await server.response(43)
  assert.equal(listed.error, undefined, JSON.stringify(listed.error))
  assert.equal(listed.result.length, 1)
  const entered = server.notification(
    "window/logMessage",
    (message) => message.params.message.includes("scripted code-action resolve entered"),
  )
  server.send({
    jsonrpc: "2.0",
    id: 44,
    method: "codeAction/resolve",
    params: listed.result[0],
  })
  await entered
  server.send({
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id: 44 },
  })

  const cancelled = await server.response(44)
  assert.equal(cancelled.result, undefined)
  assert.equal(cancelled.error.code, -32800)
})

test("a document change supersedes code-action resolve with ContentModified and no edit", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/CodeActionResolveStale.ets`).href

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
        text: "// CODE_ACTION_RESOLVE_WAITS_FOR_ABORT",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 45,
    method: "textDocument/codeAction",
    params: {
      textDocument: { uri },
      range: zeroLspRange(),
      context: { diagnostics: [], only: ["quickfix"] },
    },
  })
  const listed = await server.response(45)
  assert.equal(listed.error, undefined, JSON.stringify(listed.error))
  assert.equal(listed.result.length, 1)
  const entered = server.notification(
    "window/logMessage",
    (message) => message.params.message.includes("scripted code-action resolve entered"),
  )
  server.send({
    jsonrpc: "2.0",
    id: 46,
    method: "codeAction/resolve",
    params: listed.result[0],
  })
  await entered
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: "// current version" }],
    },
  })

  const stale = await server.response(46)
  assert.equal(stale.result, undefined)
  assert.equal(stale.error.code, -32801)
})

test("explicit cancellation suppresses a resistant code-action edit without cancelling its sibling", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/CodeActionResolveLatest.ets`).href

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
        text: "// CODE_ACTION_RESOLVE_IGNORES_ABORT",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 47,
    method: "textDocument/codeAction",
    params: {
      textDocument: { uri },
      range: zeroLspRange(),
      context: { diagnostics: [], only: ["quickfix"] },
    },
  })
  const listed = await server.response(47)
  assert.equal(listed.error, undefined, JSON.stringify(listed.error))
  assert.equal(listed.result.length, 1)
  const entered = server.notification(
    "window/logMessage",
    (message) => message.params.message.includes("scripted resistant resolve entered"),
  )
  server.send({
    jsonrpc: "2.0",
    id: 48,
    method: "codeAction/resolve",
    params: listed.result[0],
  })
  await entered
  server.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 48 } })
  server.send({
    jsonrpc: "2.0",
    id: 49,
    method: "codeAction/resolve",
    params: listed.result[0],
  })

  const current = await server.response(49)
  assert.equal(current.error, undefined, JSON.stringify(current.error))
  assert.equal(current.result.edit.documentChanges[0].textDocument.version, 1)
  const cancelled = await server.response(48)
  assert.equal(cancelled.result, undefined)
  assert.equal(cancelled.error.code, -32800)
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
    params: completion.result.items[0],
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

test("shutdown acknowledgement waits for the asynchronous workspace index close", async (t) => {
  const server = new LspProcess({
    serverPath: scriptedServerPath,
    env: { ARKTS_TEST_DELAY_INDEX_CLOSE: "1" },
  })
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { processId: process.pid, rootUri: pathToFileURL(projectRoot).href, capabilities: {} },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  let indexClosed = false
  const closeNotification = server.notification("window/logMessage", (message) => (
    message.params.message === "scripted index close completed"
  )).then(() => { indexClosed = true }, () => {})
  server.send({ jsonrpc: "2.0", id: 2, method: "shutdown", params: null })
  assert.equal((await server.response(2)).result, null)
  assert.equal(indexClosed, true, "shutdown acknowledged before the index released its resources")
  await closeNotification
  const exited = once(server.child, "exit")
  server.send({ jsonrpc: "2.0", method: "exit", params: null })
  assert.deepEqual(await withTimeout(exited, 2_000, "Server did not exit after drained shutdown"), [0, null])
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

function zeroLspRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}
