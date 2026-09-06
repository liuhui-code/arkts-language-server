import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "folding-range")
const documentPath = path.join(fixtureRoot, "FoldingPage.ets")
const documentUri = pathToFileURL(documentPath).href
const documentText = fs.readFileSync(documentPath, "utf8")

test("returns ArkUI, import, comment, and group folds for a line-only client", async (t) => {
  const session = await openDocument(t, {
    lineFoldingOnly: true,
    rangeLimit: 100,
    foldingRangeKind: { valueSet: ["comment", "imports", "region"] },
    foldingRange: { collapsedText: true },
  })

  const response = await requestFoldingRanges(session.server, 2)
  const ranges = Array.isArray(response.result) ? response.result : null
  assert.deepEqual({
    advertised: session.initializeResult.result?.capabilities?.foldingRangeProvider ?? null,
    errorCode: response.error?.code ?? null,
    ranges,
  }, {
    advertised: true,
    errorCode: null,
    ranges: expectedLineRanges(),
  })
  assert.ok(ranges.every(({ startLine, endLine, startCharacter, endCharacter }) => (
    endLine > startLine
    && startCharacter === undefined
    && endCharacter === undefined
  )))
})

test("honors rangeLimit with deterministic bounded character ranges", async (t) => {
  const session = await openDocument(t, {
    lineFoldingOnly: false,
    rangeLimit: 3,
    foldingRangeKind: { valueSet: ["comment", "imports", "region"] },
  })

  const first = await requestFoldingRanges(session.server, 2)
  const second = await requestFoldingRanges(session.server, 3)
  const firstRanges = Array.isArray(first.result) ? first.result : null
  const secondRanges = Array.isArray(second.result) ? second.result : null
  assert.deepEqual({
    advertised: session.initializeResult.result?.capabilities?.foldingRangeProvider ?? null,
    firstErrorCode: first.error?.code ?? null,
    secondErrorCode: second.error?.code ?? null,
    firstRanges,
    secondRanges,
  }, {
    advertised: true,
    firstErrorCode: null,
    secondErrorCode: null,
    firstRanges: secondRanges,
    secondRanges,
  })
  assert.equal(firstRanges.length, 3)
  assert.ok(firstRanges.every(({ startLine, endLine, startCharacter, endCharacter }) => (
    endLine > startLine
    && Number.isSafeInteger(startCharacter)
    && Number.isSafeInteger(endCharacter)
  )))
  assert.ok(firstRanges.every(isValidCharacterRange))
  assert.equal(new Set(firstRanges.map((range) => JSON.stringify(range))).size, firstRanges.length)
  assert.deepEqual(
    [...firstRanges].sort(compareRanges),
    firstRanges,
    "bounded folding ranges must retain deterministic source order",
  )
})

async function openDocument(t, foldingRange) {
  const server = new LspProcess()
  t.after(async () => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: { foldingRange },
      },
    },
  })
  const initializeResult = await server.response(1)
  assert.equal(initializeResult.error, undefined, JSON.stringify(initializeResult.error))
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: documentText,
      },
    },
  })
  return { initializeResult, server }
}

async function requestFoldingRanges(server, id) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/foldingRange",
    params: { textDocument: { uri: documentUri } },
  })
  return server.response(id)
}

function expectedLineRanges() {
  return [
    lineRange("import { Alpha", "import { Beta", "imports"),
    lineRange("/*", " */", "comment"),
    lineRange("struct FoldingPage {", "} // FoldingPage"),
    lineRange("private readonly labels", "] // labels"),
    lineRange("build() {", "} // build"),
    lineRange("Column() {", "} // Column"),
    lineRange("Row() {", "} // Row"),
    lineRange("if (this.labels.length", "} // if"),
  ]
}

function lineRange(startAnchor, endAnchor, kind) {
  const startLine = lineOf(startAnchor)
  const endLine = lineOf(endAnchor)
  assert.ok(endLine > startLine, `${startAnchor} must span multiple lines`)
  return { startLine, endLine, ...(kind ? { kind } : {}) }
}

function lineOf(anchor) {
  const lines = documentText.split("\n")
  const matches = lines.flatMap((line, index) => line.includes(anchor) ? [index] : [])
  assert.equal(matches.length, 1, `expected one line containing ${anchor}`)
  return matches[0]
}

function compareRanges(left, right) {
  return left.startLine - right.startLine
    || left.endLine - right.endLine
    || (left.startCharacter ?? 0) - (right.startCharacter ?? 0)
    || (left.endCharacter ?? 0) - (right.endCharacter ?? 0)
}

function isValidCharacterRange({ startLine, endLine, startCharacter, endCharacter }) {
  const lines = documentText.split("\n")
  return startLine >= 0
    && endLine < lines.length
    && startCharacter >= 0
    && startCharacter <= lines[startLine].length
    && endCharacter >= 0
    && endCharacter <= lines[endLine].length
}
