import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"

import {
  buildScriptedSemanticServer,
  scriptedServerPath,
} from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

buildScriptedSemanticServer()

const semanticRequests = [
  ["textDocument/definition", { position: { line: 0, character: 0 } }, []],
  ["textDocument/hover", { position: { line: 0, character: 0 } }, null],
  ["textDocument/signatureHelp", { position: { line: 0, character: 0 } }, null],
  ["textDocument/documentSymbol", {}, []],
]

test("maps cancellation for every advertised semantic request to RequestCancelled", async (t) => {
  const server = await openScriptedServer(t, "SemanticCancel.ets", "// SEMANTIC_WAITS_FOR_ABORT")

  for (const [offset, [method, params]] of semanticRequests.entries()) {
    const id = 100 + offset
    server.send({
      jsonrpc: "2.0",
      id,
      method,
      params: { textDocument: { uri: server.documentUri }, ...params },
    })
    server.send({
      jsonrpc: "2.0",
      method: "$/cancelRequest",
      params: { id },
    })
    assert.equal((await server.response(id)).error.code, -32800, method)
  }
})

test("drops stale results for every advertised semantic request after didChange", async (t) => {
  for (const [offset, [method, params, staleValue]] of semanticRequests.entries()) {
    const server = await openScriptedServer(
      t,
      `SemanticStale${offset}.ets`,
      "// SEMANTIC_DELAY_IGNORING_ABORT",
    )
    const id = 200 + offset
    server.send({
      jsonrpc: "2.0",
      id,
      method,
      params: { textDocument: { uri: server.documentUri }, ...params },
    })
    server.send({
      jsonrpc: "2.0",
      method: "textDocument/didChange",
      params: {
        textDocument: { uri: server.documentUri, version: 2 },
        contentChanges: [{ text: "struct Current {}" }],
      },
    })
    assert.deepEqual((await server.response(id)).result, staleValue, method)
  }
})

test("rejects every advertised semantic request after shutdown", async (t) => {
  const server = await openScriptedServer(t, "SemanticShutdown.ets", "struct Shutdown {}")
  server.send({ jsonrpc: "2.0", id: 300, method: "shutdown", params: null })
  await server.response(300)

  for (const [offset, [method, params]] of semanticRequests.entries()) {
    const id = 301 + offset
    server.send({
      jsonrpc: "2.0",
      id,
      method,
      params: { textDocument: { uri: server.documentUri }, ...params },
    })
    assert.equal((await server.response(id)).error.code, -32600, method)
  }
})

async function openScriptedServer(t, fileName, text) {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/${fileName}`).href
  server.documentUri = uri
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
      textDocument: { uri, languageId: "arkts", version: 1, text },
    },
  })
  return server
}
