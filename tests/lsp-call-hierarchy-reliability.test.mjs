import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildScriptedSemanticServer } from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const scriptedServerPath = buildScriptedSemanticServer()
const rootUri = pathToFileURL(projectRoot).href
const documentUri = pathToFileURL(
  `${projectRoot}/fixtures/basic/CallSource.ets`,
).href

test("maps prepareCallHierarchy client cancellation to RequestCancelled", async (t) => {
  const server = await openCallHierarchyServer(t, "// CALL_HIERARCHY_WAITS_FOR_ABORT")
  const entered = server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(
      `scripted call-hierarchy prepare entered ${documentUri}`,
    ),
  )
  server.send(prepareRequest(10))
  await entered
  server.send(cancelRequest(10))

  const response = await server.response(10)
  assert.equal(response.result, undefined, "a cancelled prepare result must not leak")
  assert.deepEqual(response.error, {
    code: -32800,
    message: "Request cancelled by client",
  })
})

test("maps outgoingCalls client cancellation to RequestCancelled", async (t) => {
  const server = await openCallHierarchyServer(t, "// CALL_HIERARCHY_WAITS_FOR_ABORT")
  const entered = server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(
      `scripted call-hierarchy outgoing entered ${documentUri}`,
    ),
  )
  server.send(followupRequest(20, "callHierarchy/outgoingCalls"))
  await entered
  server.send(cancelRequest(20))

  const response = await server.response(20)
  assert.equal(response.result, undefined, "cancelled outgoing calls must not leak")
  assert.deepEqual(response.error, {
    code: -32800,
    message: "Request cancelled by client",
  })
})

test("maps incomingCalls client cancellation to RequestCancelled", async (t) => {
  const server = await openCallHierarchyServer(t, "// CALL_HIERARCHY_WAITS_FOR_ABORT")
  const entered = server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(
      `scripted call-hierarchy incoming entered ${documentUri}`,
    ),
  )
  server.send(followupRequest(30, "callHierarchy/incomingCalls"))
  await entered
  server.send(cancelRequest(30))

  const response = await server.response(30)
  assert.equal(response.result, undefined, "cancelled incoming calls must not leak")
  assert.deepEqual(response.error, {
    code: -32800,
    message: "Request cancelled by client",
  })
})

test("rejects cancellation-resistant prepareCallHierarchy after didChange", async (t) => {
  const server = await openCallHierarchyServer(t, "// CALL_HIERARCHY_IGNORES_ABORT")
  const entered = server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(
      `scripted resistant call-hierarchy prepare entered ${documentUri}`,
    ),
  )
  server.send(prepareRequest(40))
  await entered
  changeDocument(server)

  const response = await server.response(40)
  assert.equal(response.result, undefined, "a stale prepare item must not leak")
  assert.deepEqual(response.error, {
    code: -32801,
    message: "Call hierarchy item no longer matches the current document.",
  })
})

test("rejects cancellation-resistant outgoingCalls after didChange", async (t) => {
  const server = await openCallHierarchyServer(t, "// CALL_HIERARCHY_IGNORES_ABORT")
  const entered = server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(
      `scripted resistant call-hierarchy outgoing entered ${documentUri}`,
    ),
  )
  server.send(followupRequest(50, "callHierarchy/outgoingCalls"))
  await entered
  changeDocument(server)

  const response = await server.response(50)
  assert.equal(response.result, undefined, "stale outgoing calls must not leak")
  assert.deepEqual(response.error, {
    code: -32801,
    message: "Call hierarchy item no longer matches the current document.",
  })
})

test("rejects cancellation-resistant incomingCalls after didChange", async (t) => {
  const server = await openCallHierarchyServer(t, "// CALL_HIERARCHY_IGNORES_ABORT")
  const entered = server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(
      `scripted resistant call-hierarchy incoming entered ${documentUri}`,
    ),
  )
  server.send(followupRequest(60, "callHierarchy/incomingCalls"))
  await entered
  changeDocument(server)

  const response = await server.response(60)
  assert.equal(response.result, undefined, "stale incoming calls must not leak")
  assert.deepEqual(response.error, {
    code: -32801,
    message: "Call hierarchy item no longer matches the current document.",
  })
})

test("rejects every call hierarchy request after shutdown", async (t) => {
  const server = await openCallHierarchyServer(t, "// CALL_HIERARCHY_SHUTDOWN")
  server.send({ jsonrpc: "2.0", id: 70, method: "shutdown", params: null })
  assert.deepEqual(await server.response(70), {
    jsonrpc: "2.0",
    id: 70,
    result: null,
  })

  const requests = [
    prepareRequest(71),
    followupRequest(72, "callHierarchy/outgoingCalls"),
    followupRequest(73, "callHierarchy/incomingCalls"),
  ]
  for (const request of requests) {
    server.send(request)
    const response = await server.response(request.id)
    assert.equal(response.result, undefined, `${request.method} must not run after shutdown`)
    assert.deepEqual(response.error, {
      code: -32600,
      message: "Language server is shutting down",
    }, request.method)
  }
})

async function openCallHierarchyServer(t, text) {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
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
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text,
      },
    },
  })
  return server
}

function prepareRequest(id) {
  return {
    jsonrpc: "2.0",
    id,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 0, character: 0 },
    },
  }
}

function cancelRequest(id) {
  return {
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id },
  }
}

function changeDocument(server) {
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{ text: "// CURRENT_CALL_HIERARCHY_CONTENT" }],
    },
  })
}

function followupRequest(id, method) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: { item: callHierarchyItem() },
  }
}

function callHierarchyItem() {
  return {
    name: "scriptedCallHierarchy",
    kind: 12,
    uri: documentUri,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    selectionRange: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    data: {
      arktsCallHierarchy: {
        protocol: 1,
        rootUri,
      },
    },
  }
}
