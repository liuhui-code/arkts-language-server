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

test("maps rename client cancellation to RequestCancelled without leaking an edit", async (t) => {
  const cases = [
    ["textDocument/prepareRename", "scripted prepare-rename wait entered"],
    ["textDocument/rename", "scripted rename wait entered"],
  ]

  for (const [index, [method, enteredMessage]] of cases.entries()) {
    const server = await openScriptedServer(
      t,
      `RenameCancel${index}.ets`,
      "// RENAME_WAITS_FOR_ABORT",
      renameCapableClientCapabilities(),
    )
    const entered = server.notification(
      "window/logMessage",
      (message) => message.params.message.includes(enteredMessage),
    )
    const id = 500 + index
    server.send(renameRequest(id, method, server.documentUri))
    await entered
    server.send({
      jsonrpc: "2.0",
      method: "$/cancelRequest",
      params: { id },
    })

    const response = await server.response(id)
    assert.equal(response.result, undefined, `${method} must not leak a result or edit`)
    assert.deepEqual(response.error, {
      code: -32800,
      message: "Request cancelled by client",
    })
  }
})

test("rejects cancellation-resistant rename after didChange and didClose with ContentModified", async (t) => {
  const lifecycles = ["change", "close"]

  for (const [index, lifecycle] of lifecycles.entries()) {
    const server = await openScriptedServer(
      t,
      `RenameStale${index}.ets`,
      "// RENAME_IGNORES_ABORT",
      renameCapableClientCapabilities(),
    )
    const entered = server.notification(
      "window/logMessage",
      (message) => message.params.message.includes("scripted resistant rename entered"),
    )
    const id = 510 + index
    server.send(renameRequest(id, "textDocument/rename", server.documentUri))
    await entered
    server.send(lifecycle === "change"
      ? {
          jsonrpc: "2.0",
          method: "textDocument/didChange",
          params: {
            textDocument: { uri: server.documentUri, version: 2 },
            contentChanges: [{ text: "struct Current {}" }],
          },
        }
      : {
          jsonrpc: "2.0",
          method: "textDocument/didClose",
          params: { textDocument: { uri: server.documentUri } },
        })

    const response = await server.response(id)
    assert.equal(response.result, undefined, `${lifecycle} must not leak a WorkspaceEdit`)
    assert.deepEqual(response.error, {
      code: -32801,
      message: "Rename request is stale",
    })
  }
})

test("maps invalid rename names to InvalidParams without leaking an edit", async (t) => {
  const server = await openScriptedServer(
    t,
    "RenameInvalidName.ets",
    "struct RenameInvalidName {}",
    renameCapableClientCapabilities(),
  )
  server.send(renameRequest(
    520,
    "textDocument/rename",
    server.documentUri,
    { newName: "not valid" },
  ))

  const response = await server.response(520)
  assert.equal(response.result, undefined, "invalid names must not return a WorkspaceEdit")
  assert.deepEqual(response.error, {
    code: -32602,
    message: "Rename requires a valid identifier.",
  })
})

test("maps incomplete and unavailable prepare/rename outcomes to fixed RequestFailed", async (t) => {
  const cases = [
    ["incomplete", "// RENAME_INCOMPLETE"],
    ["unavailable", "// RENAME_UNAVAILABLE"],
  ]
  const methods = ["textDocument/prepareRename", "textDocument/rename"]

  for (const [caseIndex, [outcome, text]] of cases.entries()) {
    for (const [methodIndex, method] of methods.entries()) {
      const server = await openScriptedServer(
        t,
        `RenameFailure${caseIndex}-${methodIndex}.ets`,
        text,
        renameCapableClientCapabilities(),
      )
      const id = 530 + caseIndex * methods.length + methodIndex
      server.send(renameRequest(id, method, server.documentUri))

      const response = await server.response(id)
      assert.equal(response.result, undefined, `${method} ${outcome} must not return an edit`)
      assert.deepEqual(response.error, {
        code: -32803,
        message: "Rename is not available at this position.",
      })
    }
  }
})

async function openScriptedServer(t, fileName, text, capabilities = {}) {
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
      capabilities,
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

function renameRequest(id, method, documentUri, overrides = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      textDocument: { uri: documentUri },
      position: { line: 0, character: 0 },
      ...(method === "textDocument/rename" ? { newName: "Renamed" } : {}),
      ...overrides,
    },
  }
}

function renameCapableClientCapabilities() {
  return {
    workspace: {
      workspaceEdit: {
        documentChanges: true,
        failureHandling: "transactional",
      },
    },
    textDocument: { rename: { prepareSupport: true } },
  }
}
