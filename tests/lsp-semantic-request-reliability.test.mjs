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
  [
    "textDocument/references",
    { position: { line: 0, character: 0 }, context: { includeDeclaration: false } },
    { staleError: -32801 },
  ],
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
    const response = await server.response(id)
    if (staleValue?.staleError) assert.equal(response.error.code, staleValue.staleError, method)
    else assert.deepEqual(response.result, staleValue, method)
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

test("maps LSP signature-help context to bounded semantic trigger reasons", async (t) => {
  const server = await openScriptedServer(t, "SignatureContext.ets", "scripted(1)")
  const cases = [
    [undefined, "scripted invoked"],
    [{ triggerKind: 1, isRetrigger: false }, "scripted invoked"],
    [{ triggerKind: 2, triggerCharacter: "(", isRetrigger: false }, "scripted characterTyped:("],
    [{ triggerKind: 2, triggerCharacter: ",", isRetrigger: false }, "scripted characterTyped:,"],
    [{ triggerKind: 2, triggerCharacter: "<", isRetrigger: false }, "scripted characterTyped:<"],
    [{ triggerKind: 2, triggerCharacter: ")", isRetrigger: true }, "scripted retrigger:)"],
    [{ triggerKind: 3, isRetrigger: true }, "scripted retrigger"],
    [{ triggerKind: 2, triggerCharacter: ")", isRetrigger: false }, "scripted invoked"],
    [{ triggerKind: 2, triggerCharacter: "x", isRetrigger: false }, "scripted invoked"],
    [{ triggerKind: 99, triggerCharacter: "(", isRetrigger: "yes" }, "scripted invoked"],
    [{ triggerKind: 99, isRetrigger: true }, "scripted invoked"],
  ]

  for (const [index, [context, expectedLabel]] of cases.entries()) {
    const id = 400 + index
    server.send({
      jsonrpc: "2.0",
      id,
      method: "textDocument/signatureHelp",
      params: {
        textDocument: { uri: server.documentUri },
        position: { line: 0, character: 9 },
        ...(context === undefined ? {} : { context }),
      },
    })
    const response = await server.response(id)
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.equal(response.result.signatures[0].label, expectedLabel)
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
