import assert from "node:assert/strict"
import test from "node:test"
import { pathToFileURL } from "node:url"

import {
  buildScriptedSemanticServer,
  scriptedServerPath,
} from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

buildScriptedSemanticServer()

test("advertises workspace symbols and returns the unsaved document overlay without status rows", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const rootUri = pathToFileURL(projectRoot).href
  const uri = pathToFileURL(`${projectRoot}/fixtures/UnsavedWorkspaceSymbol.ets`).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { processId: process.pid, rootUri, capabilities: {} },
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
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "workspace/symbol",
    params: { query: "UnsavedWorkspaceType" },
  })
  const response = await server.response(2)
  assert.deepEqual(response.result, [{
    name: "UnsavedWorkspaceType",
    kind: 23,
    location: { uri, range: zeroRange() },
  }])
  assert.ok(response.result.every((item) => !item.name.startsWith("Partial workspace results")))
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

  const create = await server.notification("window/workDoneProgress/create")
  server.send({ jsonrpc: "2.0", id: create.id, result: null })
  const begin = await server.notification("$/progress", (message) => message.params.value.kind === "begin")
  assert.equal(begin.params.value.message, "Discovering project files")
  assert.equal("percentage" in begin.params.value, false)

  const reports = []
  while (reports.length < 3) {
    reports.push(await server.notification(
      "$/progress",
      (message) => message.params.value.kind === "report",
    ))
  }
  const percentages = reports
    .map((message) => message.params.value.percentage)
    .filter((value) => value !== undefined)
  assert.deepEqual(percentages, [33, 100])
  assert.ok(percentages.every((value, index) => index === 0 || value >= percentages[index - 1]))
  assert.ok(reports.some((message) => /1\/3 files/.test(message.params.value.message)))

  const end = await server.notification("$/progress", (message) => message.params.value.kind === "end")
  assert.equal(end.params.value.kind, "end")
})

function zeroRange() {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  }
}
