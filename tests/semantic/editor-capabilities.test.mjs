import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

async function openFixture(t, directory, fileName, capabilities = {}) {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", directory)
  const documentPath = path.join(fixtureRoot, fileName)
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        ...capabilities,
      },
    },
  })
  const initialized = await server.response(1)
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

  return { server, initialized, documentUri, text }
}

test("returns ArkTS signature help with the active parameter", async (t) => {
  const { server, documentUri } = await openFixture(t, "signature-help", "Calculator.ets")

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/signatureHelp",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 6, character: 16 },
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.activeParameter, 1)
  assert.match(response.result.signatures[0].label, /add\(left: number, right: number\): number/)
})

test("returns null signature help outside a call", async (t) => {
  const { server, documentUri } = await openFixture(t, "signature-help", "Calculator.ets")

  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/signatureHelp",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 4, character: 0 },
    },
  })

  const response = await server.response(3)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result, null)
})

test("advertises signature help only after its transcript is supported", async (t) => {
  const { initialized } = await openFixture(t, "signature-help", "Calculator.ets")

  assert.deepEqual(initialized.result.capabilities.signatureHelpProvider, {
    triggerCharacters: ["(", ","],
  })
})

test("returns documented ArkTS hover information at the exact source range", async (t) => {
  const { server, documentUri } = await openFixture(t, "hover", "Profile.ets")

  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "textDocument/hover",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 5, character: 11 },
    },
  })

  const response = await server.response(4)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.contents.kind, "markdown")
  assert.match(response.result.contents.value, /Profile\.title: string/)
  assert.match(response.result.contents.value, /Human-readable title\./)
  assert.deepEqual(response.result.range, {
    start: { line: 5, character: 9 },
    end: { line: 5, character: 14 },
  })
})

test("returns null hover information on whitespace", async (t) => {
  const { server, documentUri } = await openFixture(t, "hover", "Profile.ets")

  server.send({
    jsonrpc: "2.0",
    id: 5,
    method: "textDocument/hover",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 3, character: 0 },
    },
  })

  const response = await server.response(5)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result, null)
})

test("advertises hover only after documented and empty transcripts are supported", async (t) => {
  const { initialized } = await openFixture(t, "hover", "Profile.ets")

  assert.equal(initialized.result.capabilities.hoverProvider, true)
})

test("returns hierarchical ArkTS document symbols from the changed overlay", async (t) => {
  const { server, documentUri } = await openFixture(
    t,
    "document-symbols",
    "Panel.ets",
    {
      textDocument: {
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
          symbolKind: { valueSet: Array.from({ length: 26 }, (_, index) => index + 1) },
        },
      },
    },
  )

  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 0 },
        },
        text: "  refresh(force: boolean): void {\n  }\n",
      }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 6,
    method: "textDocument/documentSymbol",
    params: { textDocument: { uri: documentUri } },
  })

  const response = await server.response(6)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [
    {
      name: "Panel",
      kind: 23,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 4, character: 1 },
      },
      selectionRange: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 12 },
      },
      children: [
        {
          name: "title",
          kind: 7,
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 24 },
          },
          selectionRange: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 7 },
          },
        },
        {
          name: "refresh",
          kind: 6,
          range: {
            start: { line: 2, character: 2 },
            end: { line: 3, character: 3 },
          },
          selectionRange: {
            start: { line: 2, character: 2 },
            end: { line: 2, character: 9 },
          },
        },
      ],
    },
    {
      name: "helper",
      kind: 12,
      range: {
        start: { line: 6, character: 0 },
        end: { line: 8, character: 1 },
      },
      selectionRange: {
        start: { line: 6, character: 9 },
        end: { line: 6, character: 15 },
      },
    },
  ])
})

test("uses legacy symbol kinds in flat results when the client omits valueSet", async (t) => {
  const { server, documentUri } = await openFixture(
    t,
    "document-symbols",
    "Panel.ets",
    {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: false },
      },
    },
  )

  server.send({
    jsonrpc: "2.0",
    id: 7,
    method: "textDocument/documentSymbol",
    params: { textDocument: { uri: documentUri } },
  })

  const response = await server.response(7)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result.map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    containerName: symbol.containerName,
    location: symbol.location,
  })), [
    {
      name: "Panel",
      kind: 5,
      containerName: undefined,
      location: {
        uri: documentUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 2, character: 1 },
        },
      },
    },
    {
      name: "title",
      kind: 7,
      containerName: "Panel",
      location: {
        uri: documentUri,
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 24 },
        },
      },
    },
    {
      name: "helper",
      kind: 12,
      containerName: undefined,
      location: {
        uri: documentUri,
        range: {
          start: { line: 4, character: 0 },
          end: { line: 6, character: 1 },
        },
      },
    },
  ])
})

test("advertises document symbols only after both client response shapes work", async (t) => {
  const { initialized } = await openFixture(
    t,
    "document-symbols",
    "Panel.ets",
    {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      },
    },
  )

  assert.equal(initialized.result.capabilities.documentSymbolProvider, true)
})
