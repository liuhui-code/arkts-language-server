import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "document-symbol-depth")
const documentPath = path.join(fixtureRoot, "AllKinds.ets")
const documentUri = pathToFileURL(documentPath).href
const text = fs.readFileSync(documentPath, "utf8")

test("returns every ArkTS symbol kind in stable source-ordered hierarchy with UTF-16 ranges", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: {
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
            symbolKind: { valueSet: Array.from({ length: 26 }, (_, index) => index + 1) },
          },
        },
      },
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

  const first = await requestDocumentSymbols(server, 2)
  const second = await requestDocumentSymbols(server, 3)
  assert.deepEqual(second, first, "repeated document-symbol requests must keep stable order")

  const flat = flatten(first)
  assert.deepEqual(flat.map(({ name }) => name), [
    "DeepModule",
    "ServiceContract",
    "Mode",
    "Ready",
    "Worker",
    "label",
    "constructor",
    "run",
    "Identifier",
    "sharedIdentifier",
    "makeIdentifier",
    "Panel",
  ])
  assert.deepEqual(Object.fromEntries(flat.map(({ name, kind }) => [name, kind])), {
    DeepModule: 2,
    ServiceContract: 11,
    Mode: 10,
    Ready: 22,
    Worker: 5,
    label: 7,
    constructor: 9,
    run: 6,
    Identifier: 26,
    sharedIdentifier: 13,
    makeIdentifier: 12,
    Panel: 23,
  })

  const deepModule = first[0]
  assert.deepEqual(deepModule.children.map(({ name }) => name), [
    "ServiceContract",
    "Mode",
    "Worker",
  ])
  const mode = deepModule.children[1]
  assert.deepEqual(mode.children.map(({ name }) => name), ["Ready"])
  const worker = deepModule.children[2]
  assert.deepEqual(worker.children.map(({ name }) => name), ["label", "constructor", "run"])

  assert.deepEqual(deepModule.selectionRange, utf16RangeOf(text, "DeepModule"))
  assert.deepEqual(mode.children[0].selectionRange, utf16RangeOf(text, "Ready"))
  assert.deepEqual(worker.children[0].selectionRange, utf16RangeOf(text, "label"))
})

test("falls back to flat symbols with legacy struct kind, containers, and stable UTF-16 ranges", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: {
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: false,
            symbolKind: {
              valueSet: Array.from({ length: 26 }, (_, index) => index + 1)
                .filter((kind) => kind !== 23),
            },
          },
        },
      },
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

  const first = await requestDocumentSymbols(server, 2)
  const second = await requestDocumentSymbols(server, 3)
  assert.deepEqual(second, first, "flat document symbols must be deterministic")
  assert.deepEqual(first.map(({ name }) => name), [
    "DeepModule",
    "ServiceContract",
    "Mode",
    "Ready",
    "Worker",
    "label",
    "constructor",
    "run",
    "Identifier",
    "sharedIdentifier",
    "makeIdentifier",
    "Panel",
  ])
  assert.deepEqual(first.map(({ kind }) => kind), [2, 11, 10, 22, 5, 7, 9, 6, 26, 13, 12, 5])
  assert.deepEqual(first.map(({ containerName }) => containerName ?? null), [
    null,
    "DeepModule",
    "DeepModule",
    "Mode",
    "DeepModule",
    "Worker",
    "Worker",
    "Worker",
    null,
    null,
    null,
    null,
  ])
  assert.deepEqual(first.map(({ location }) => location.uri), Array(12).fill(documentUri))
  assert.deepEqual(first.map(({ location }) => location.range), [
    lspRange(0, 9, 16, 1),
    lspRange(1, 2, 1, 37),
    lspRange(3, 2, 5, 3),
    lspRange(4, 13, 4, 22),
    lspRange(7, 2, 15, 3),
    lspRange(8, 13, 8, 35),
    lspRange(10, 4, 12, 5),
    lspRange(14, 4, 14, 18),
    lspRange(18, 0, 18, 31),
    lspRange(19, 13, 19, 52),
    lspRange(21, 0, 23, 1),
    lspRange(25, 0, 25, 22),
  ])
})

test("uses only legacy symbol kinds when the client omits document symbol valueSet", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: {
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        },
      },
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

  const symbols = flatten(await requestDocumentSymbols(server, 4))
  assert.deepEqual(Object.fromEntries(symbols.map(({ name, kind }) => [name, kind])), {
    DeepModule: 2,
    ServiceContract: 11,
    Mode: 10,
    Ready: 10,
    Worker: 5,
    label: 7,
    constructor: 9,
    run: 6,
    Identifier: 13,
    sharedIdentifier: 13,
    makeIdentifier: 12,
    Panel: 5,
  })
  assert.ok(symbols.every(({ kind }) => kind >= 1 && kind <= 18))
})

async function requestDocumentSymbols(server, id) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/documentSymbol",
    params: { textDocument: { uri: documentUri } },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.ok(Array.isArray(response.result))
  return response.result
}

function flatten(symbols) {
  return symbols.flatMap((symbol) => [
    { name: symbol.name, kind: symbol.kind },
    ...flatten(symbol.children ?? []),
  ])
}

function utf16RangeOf(source, token) {
  const startOffset = source.indexOf(token)
  assert.notEqual(startOffset, -1, `missing ${token} marker`)
  return {
    start: utf16PositionAt(source, startOffset),
    end: utf16PositionAt(source, startOffset + token.length),
  }
}

function utf16PositionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  const lineStart = prefix.lastIndexOf("\n") + 1
  return { line, character: prefix.slice(lineStart).length }
}

function lspRange(startLine, startCharacter, endLine, endCharacter) {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  }
}
