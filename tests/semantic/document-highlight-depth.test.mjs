import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "document-highlight")
const overlayText = [
  "/* 😀 */ export let tracked = 0",
  "/* 😀 */ tracked = tracked + 1",
  "/* 😀 */ export const snapshot = tracked",
  "",
].join("\n")

test("highlights declaration writes and reads from the current changed overlay", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-highlight-depth-"))
  const serverPath = path.join(temporaryRoot, "server.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
  })
  const documentPath = path.join(fixtureRoot, "Current.ets")
  const documentUri = pathToFileURL(documentPath).href
  const ranges = rangesOf(overlayText, "tracked")
  assert.equal(ranges.length, 4)
  const server = new LspProcess({
    serverPath,
    env: { ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs") },
  })
  t.after(async () => {
    try {
      await server.close()
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  const initialized = await server.response(1)
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 7,
        text: overlayText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/documentHighlight",
    params: {
      textDocument: { uri: documentUri },
      position: ranges[2].start,
    },
  })
  const response = await server.response(2)
  const expectedHighlights = [
    { range: ranges[0], kind: 3 },
    { range: ranges[1], kind: 3 },
    { range: ranges[2], kind: 2 },
    { range: ranges[3], kind: 2 },
  ]

  assert.deepEqual({
    advertised: initialized.result.capabilities.documentHighlightProvider ?? false,
    error: response.error ?? null,
    highlights: response.result ?? null,
  }, {
    advertised: true,
    error: null,
    highlights: expectedHighlights,
  })
  assert.equal(
    new Set(response.result.map(({ range }) => rangeKey(range))).size,
    response.result.length,
    "document highlights must not contain duplicate ranges",
  )
})

function rangesOf(source, name) {
  const ranges = []
  let offset = 0
  while ((offset = source.indexOf(name, offset)) >= 0) {
    ranges.push({
      start: positionAt(source, offset),
      end: positionAt(source, offset + name.length),
    })
    offset += name.length
  }
  assert.deepEqual(ranges.map(({ start }) => start.character), [20, 9, 19, 33])
  return ranges
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  const lineStart = prefix.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}

function rangeKey(range) {
  return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`
}
