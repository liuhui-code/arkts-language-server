import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(
  projectRoot,
  "fixtures",
  "semantic",
  "workspace-symbol-production",
)
const documentPath = path.join(fixtureRoot, "AllKinds.ets")
const documentUri = pathToFileURL(documentPath).href
const diskText = fs.readFileSync(documentPath, "utf8")
const overlayText = diskText.replaceAll("WorkspaceKind", "OverlayKind")

test("returns every production overlay workspace-symbol kind with exact UTF-16 name ranges", async (t) => {
  const server = openProductionServer(t)
  await initialize(server, Array.from({ length: 26 }, (_, index) => index + 1))
  openOverlay(server, overlayText, 1)

  const first = await workspaceSymbols(server, 2, "")
  const second = await workspaceSymbols(server, 3, "")
  assert.deepEqual(second, first, "repeated overlay searches must remain deterministic")

  const expected = [
    ["constructor", 9, "OverlayKindClass"],
    ["OverlayKindClass", 5, "OverlayKindModule"],
    ["OverlayKindEnum", 10, "OverlayKindModule"],
    ["OverlayKindEnumMember", 22, "OverlayKindEnum"],
    ["OverlayKindFunction", 12],
    ["OverlayKindInterface", 11, "OverlayKindModule"],
    ["OverlayKindMethod", 6, "OverlayKindClass"],
    ["OverlayKindModule", 2],
    ["OverlayKindProperty", 7, "OverlayKindClass"],
    ["OverlayKindStruct", 23],
    ["OverlayKindType", 26],
    ["OverlayKindVariable", 13],
  ].map(([name, kind, containerName]) => ({
    name,
    kind,
    location: {
      uri: documentUri,
      range: utf16RangeOf(overlayText, name),
    },
    ...(containerName ? { containerName } : {}),
  }))

  assert.deepEqual(first, expected)
  assert.equal(
    first.some(({ name }) => name.startsWith("WorkspaceKind")),
    false,
    "workspace symbols must use the unsaved overlay instead of disk text",
  )
})

test("uses only legacy symbol kinds when the client omits workspace symbol valueSet", async (t) => {
  const server = openProductionServer(t)
  await initialize(server)
  openOverlay(server, overlayText, 1)

  const symbols = await workspaceSymbols(server, 4, "")
  assert.deepEqual(Object.fromEntries(symbols.map(({ name, kind }) => [name, kind])), {
    constructor: 9,
    OverlayKindClass: 5,
    OverlayKindEnum: 10,
    OverlayKindEnumMember: 10,
    OverlayKindFunction: 12,
    OverlayKindInterface: 11,
    OverlayKindMethod: 6,
    OverlayKindModule: 2,
    OverlayKindProperty: 7,
    OverlayKindStruct: 5,
    OverlayKindType: 13,
    OverlayKindVariable: 13,
  })
  assert.ok(symbols.every(({ kind }) => kind >= 1 && kind <= 18))
})

test("bounds production workspace-symbol results at 100 complete Locations without resolve data", async (t) => {
  const server = openProductionServer(t)
  await initialize(server)
  const boundedText = Array.from({ length: 120 }, (_, index) => (
    `/* 😀 */ export const BoundedWorkspaceValue${String(index).padStart(3, "0")} = ${index}`
  )).join("\n") + "\n"
  openOverlay(server, boundedText, 1)

  const result = await workspaceSymbols(server, 2, "BoundedWorkspaceValue")
  assert.equal(result.length, 100)
  assert.deepEqual(result, Array.from({ length: 100 }, (_, index) => {
    const name = `BoundedWorkspaceValue${String(index).padStart(3, "0")}`
    return {
      name,
      kind: 13,
      location: { uri: documentUri, range: utf16RangeOf(boundedText, name) },
    }
  }))
  assert.ok(result.every((symbol) => !Object.hasOwn(symbol, "data")))
})

function openProductionServer(t) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-workspace-symbol-"))
  const server = new LspProcess({
    env: {
      ARKTS_INDEX_CACHE_DIR: path.join(temporaryRoot, "index-cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(temporaryRoot, "missing-sidecar"),
      ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs"),
    },
  })
  t.after(async () => {
    await server.close()
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  })
  return server
}

async function initialize(server, symbolKindValueSet) {
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        ...(symbolKindValueSet
          ? { workspace: { symbol: { symbolKind: { valueSet: symbolKindValueSet } } } }
          : {}),
      },
    },
  })
  const response = await server.response(1)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.capabilities.workspaceSymbolProvider, true)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
}

function openOverlay(server, text, version) {
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version,
        text,
      },
    },
  })
}

async function workspaceSymbols(server, id, query) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "workspace/symbol",
    params: { query },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.ok(Array.isArray(response.result))
  return response.result
}

function utf16RangeOf(source, token) {
  const offset = source.indexOf(token)
  assert.notEqual(offset, -1, `missing ${token}`)
  return {
    start: positionAt(source, offset),
    end: positionAt(source, offset + token.length),
  }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  const lineStart = prefix.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}
