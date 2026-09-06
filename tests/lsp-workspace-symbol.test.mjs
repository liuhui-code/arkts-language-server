import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildScriptedSemanticServer } from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const scriptedServerPath = buildScriptedSemanticServer()
const modernWorkspaceSymbolCapabilities = {
  workspace: {
    symbol: {
      symbolKind: { valueSet: Array.from({ length: 26 }, (_, index) => index + 1) },
    },
  },
}

test("search stays live during catalog work and returns the unsaved overlay without status rows", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const rootUri = pathToFileURL(projectRoot).href
  const uri = pathToFileURL(`${projectRoot}/fixtures/UnsavedWorkspaceSymbol.ets`).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      capabilities: modernWorkspaceSymbolCapabilities,
    },
  })
  const initialized = await server.response(1)
  assert.equal(initialized.result.capabilities.workspaceSymbolProvider, true)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "struct UnsavedWorkspaceType {}",
      },
    },
  })
  const searchStartedAt = performance.now()
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "workspace/symbol",
    params: { query: "UnsavedWorkspaceType" },
  })
  const response = await server.response(2)
  assert.ok(performance.now() - searchStartedAt < 400, "workspace search waited for catalog completion")
  assert.deepEqual(response.result, [{
    name: "UnsavedWorkspaceType",
    kind: 23,
    location: { uri, range: zeroRange() },
  }])
  assert.ok(response.result.every((item) => !item.name.startsWith("Partial workspace results")))
})

test("maps every workspace symbol contract kind and conservatively falls back for an unknown index kind", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const rootUri = pathToFileURL(projectRoot).href
  const uri = pathToFileURL(`${projectRoot}/fixtures/W2WorkspaceSymbolKinds.ets`).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      capabilities: modernWorkspaceSymbolCapabilities,
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
        text: "// WORKSPACE_SYMBOL_KIND_FIXTURE",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "workspace/symbol",
    params: { query: "W2Symbol" },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(
    Object.fromEntries(response.result.map(({ name, kind }) => [name, kind])),
    {
      W2Symbolclass: 5,
      W2Symbolconstructor: 9,
      W2Symbolenum: 10,
      W2SymbolenumMember: 22,
      W2Symbolfunction: 12,
      W2Symbolinterface: 11,
      W2Symbolmethod: 6,
      W2Symbolmodule: 2,
      W2Symbolproperty: 7,
      W2Symbolstruct: 23,
      W2Symboltype: 26,
      W2SymbolUnknown: 13,
      W2Symbolvariable: 13,
    },
  )
})

test("maps workspace symbol cancellation and rejects requests after shutdown", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri: pathToFileURL(projectRoot).href, capabilities: {} },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({ jsonrpc: "2.0", id: 10, method: "workspace/symbol", params: { query: "WAIT_CANCEL" } })
  server.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 10 } })
  assert.equal((await server.response(10)).error.code, -32800)

  server.send({ jsonrpc: "2.0", id: 11, method: "shutdown", params: null })
  await server.response(11)
  server.send({ jsonrpc: "2.0", id: 12, method: "workspace/symbol", params: { query: "Anything" } })
  assert.equal((await server.response(12)).error.code, -32600)
})

test("matches an open ArkTS symbol by uppercase acronym without treating digits as capitals", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/AcronymWorkspaceSymbol.ets`).href
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri: pathToFileURL(projectRoot).href, capabilities: {} },
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
        text: "struct Chat2BaseViewModel {}",
      },
    },
  })
  server.send({ jsonrpc: "2.0", id: 20, method: "workspace/symbol", params: { query: "CBVM" } })
  assert.equal((await server.response(20)).result[0].name, "Chat2BaseViewModel")
})

test("reports discovery without fake zero percent and completes monotonic indexing progress", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(projectRoot).href,
      capabilities: { window: { workDoneProgress: true } },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  const create = await server.serverRequest("window/workDoneProgress/create")
  server.send({ jsonrpc: "2.0", id: create.id, result: null })
  const begin = await server.progress(create.params.token, (message) => (
    message.params.value.kind === "begin"
  ))
  assert.equal(begin.params.value.message, "Discovering project files")
  assert.equal("percentage" in begin.params.value, false)

  const reports = []
  while (reports.length < 3) {
    reports.push(await server.progress(
      create.params.token,
      (message) => message.params.value.kind === "report",
    ))
  }
  const percentages = reports
    .map((message) => message.params.value.percentage)
    .filter((value) => value !== undefined)
  assert.deepEqual(percentages, [33, 100])
  assert.ok(percentages.every((value, index) => index === 0 || value >= percentages[index - 1]))
  assert.ok(reports.some((message) => /1\/3 files/.test(message.params.value.message)))

  const end = await server.progress(create.params.token, (message) => (
    message.params.value.kind === "end"
  ))
  assert.equal(end.params.value.kind, "end")
})

function zeroRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}
