import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const require = createRequire(import.meta.url)

const fixtureRoot = path.join(projectRoot, "fixtures", "basic")
const sourcePath = path.join(fixtureRoot, "CallSource.ets")
const targetPath = path.join(fixtureRoot, "CallTarget.ets")
const sourceUri = pathToFileURL(sourcePath).href
const targetUri = pathToFileURL(targetPath).href
const sourceText = fs.readFileSync(sourcePath, "utf8")
const targetText = fs.readFileSync(targetPath, "utf8")

test("prepares a callable and returns its exact cross-file outgoing calls over production stdio", async (t) => {
  const server = new LspProcess()
  const openedUris = new Set()
  t.after(() => server.close())

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
  const initialize = await server.response(1)
  assert.equal(
    initialize.result.capabilities.callHierarchyProvider,
    undefined,
    "CH1 must remain undiscoverable until incoming/reliability/artifact evidence is complete",
  )
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: sourceUri,
        languageId: "arkts",
        version: 1,
        text: sourceText,
      },
    },
  })
  openedUris.add(sourceUri)

  const sourceName = exactTextRange(sourceText, "renderProfile")
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: sourceUri },
      position: midpoint(sourceName),
    },
  })

  const prepare = await server.response(2)
  assert.equal(prepare.error, undefined, JSON.stringify(prepare.error))
  assert.deepEqual(prepare.result, [{
    name: "renderProfile",
    kind: 12,
    uri: sourceUri,
    range: {
      start: { line: 2, character: 0 },
      end: { line: 6, character: 1 },
    },
    selectionRange: sourceName,
  }])
  assert.equal(textInRange(sourceText, prepare.result[0].range), [
    "export function renderProfile(): string {",
    "  const first: string = `😀${loadProfile()}`",
    "  const second: string = `😀${loadProfile()}`",
    "  return first + second",
    "}",
  ].join("\n"))
  assert.equal(containsRange(prepare.result[0].range, prepare.result[0].selectionRange), true)

  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepare.result[0] },
  })

  const outgoing = await server.response(3)
  assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
  const targetName = exactTextRange(targetText, "loadProfile")
  const callRanges = exactTextRanges(sourceText, "loadProfile").slice(1)
  assert.equal(callRanges.length, 2)
  for (const range of callRanges) {
    const line = sourceText.split("\n")[range.start.line]
    const codePointColumn = Array.from(line.slice(0, range.start.character)).length
    assert.equal(range.start.character, codePointColumn + 1, "emoji must prove UTF-16 columns")
  }
  assert.deepEqual(outgoing.result, [{
    to: {
      name: "loadProfile",
      kind: 12,
      uri: targetUri,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 2, character: 1 },
      },
      selectionRange: targetName,
    },
    fromRanges: callRanges,
  }])
  assert.equal(textInRange(targetText, outgoing.result[0].to.range), targetText.trimEnd())
  assert.equal(containsRange(
    outgoing.result[0].to.range,
    outgoing.result[0].to.selectionRange,
  ), true)
  assert.equal(openedUris.has(targetUri), false, "outgoing target must stay unopened")
})

test("widens a TypeScript arrow span so the exact selection stays inside its range", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const arrowPath = path.join(fixtureRoot, "CallArrow.ets")
  const arrowUri = pathToFileURL(arrowPath).href
  const arrowText = fs.readFileSync(arrowPath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 10,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(10)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: arrowUri,
        languageId: "arkts",
        version: 1,
        text: arrowText,
      },
    },
  })

  const selectionRange = exactTextRange(arrowText, "renderArrow")
  server.send({
    jsonrpc: "2.0",
    id: 11,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: arrowUri },
      position: midpoint(selectionRange),
    },
  })

  const response = await server.response(11)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [{
    name: "renderArrow",
    kind: 12,
    uri: arrowUri,
    range: {
      start: { line: 2, character: 13 },
      end: { line: 2, character: 54 },
    },
    selectionRange,
  }])
  assert.equal(containsRange(response.result[0].range, selectionRange), true)
  assert.equal(textInRange(arrowText, response.result[0].range), [
    "renderArrow",
    " = (): string => loadProfile()",
  ].join(""))
})

test("rejects malformed prepare and outgoing call hierarchy parameters", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 20,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(20)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  server.send({
    jsonrpc: "2.0",
    id: 21,
    method: "textDocument/prepareCallHierarchy",
    params: { textDocument: { uri: sourceUri } },
  })
  const malformedPrepare = await server.response(21)
  assert.deepEqual(malformedPrepare.error, {
    code: -32602,
    message: "Invalid call hierarchy prepare parameters.",
  })

  server.send({
    jsonrpc: "2.0",
    id: 22,
    method: "callHierarchy/outgoingCalls",
    params: {
      item: {
        name: "renderProfile",
        kind: 12,
        uri: sourceUri,
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 1 },
        },
        selectionRange: exactTextRange(sourceText, "renderProfile"),
      },
    },
  })
  const malformedOutgoing = await server.response(22)
  assert.deepEqual(malformedOutgoing.error, {
    code: -32602,
    message: "Invalid call hierarchy outgoing parameters.",
  })

  const validRange = exactTextRange(sourceText, "renderProfile")
  server.send({
    jsonrpc: "2.0",
    id: 23,
    method: "callHierarchy/outgoingCalls",
    params: {
      item: {
        name: "renderProfile",
        kind: 999,
        uri: sourceUri,
        range: validRange,
        selectionRange: validRange,
      },
    },
  })
  const unsupportedKind = await server.response(23)
  assert.deepEqual(unsupportedKind.error, {
    code: -32602,
    message: "Invalid call hierarchy outgoing parameters.",
  })
})

test("rejects non-canonical call hierarchy document and item URIs", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 25,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(25)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  const invalidUris = [
    "https://example.test/CallSource.ets",
    "file:///tmp/%",
    `${sourceUri}?revision=1`,
    `${sourceUri}#renderProfile`,
  ]
  let requestId = 26
  for (const uri of invalidUris) {
    server.send({
      jsonrpc: "2.0",
      id: requestId,
      method: "textDocument/prepareCallHierarchy",
      params: {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      },
    })
    const response = await server.response(requestId)
    assert.equal(response.error?.code, -32602, `prepare accepted ${uri}`)
    requestId += 1
  }

  const validRange = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 1 },
  }
  for (const uri of invalidUris) {
    server.send({
      jsonrpc: "2.0",
      id: requestId,
      method: "callHierarchy/outgoingCalls",
      params: {
        item: {
          name: "call",
          kind: 12,
          uri,
          range: validRange,
          selectionRange: validRange,
        },
      },
    })
    const response = await server.response(requestId)
    assert.equal(response.error?.code, -32602, `outgoing accepted ${uri}`)
    requestId += 1
  }
})

test("fails the whole outgoing request when one edge exceeds its range budget", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const overflowPath = path.join(fixtureRoot, "CallOverflow.ets")
  const overflowUri = pathToFileURL(overflowPath).href
  const overflowText = fs.readFileSync(overflowPath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 30,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(30)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: overflowUri,
        languageId: "arkts",
        version: 1,
        text: overflowText,
      },
    },
  })

  const nameRange = exactTextRange(overflowText, "overflowCalls")
  server.send({
    jsonrpc: "2.0",
    id: 31,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: overflowUri },
      position: midpoint(nameRange),
    },
  })
  const prepare = await server.response(31)
  assert.equal(prepare.error, undefined, JSON.stringify(prepare.error))
  assert.equal(prepare.result.length, 1)

  server.send({
    jsonrpc: "2.0",
    id: 32,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepare.result[0] },
  })
  const outgoing = await server.response(32)
  assert.equal(outgoing.result, undefined)
  assert.deepEqual(outgoing.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: result-limit-exceeded.",
  })
})

test("re-locates a prepared item against the current overlay without an item cache", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fallbackPath = path.join(fixtureRoot, "CallFallback.ets")
  const fallbackUri = pathToFileURL(fallbackPath).href
  const fallbackText = fs.readFileSync(fallbackPath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 40,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(40)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: sourceUri,
        languageId: "arkts",
        version: 1,
        text: sourceText,
      },
    },
  })

  const sourceName = exactTextRange(sourceText, "renderProfile")
  server.send({
    jsonrpc: "2.0",
    id: 41,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: sourceUri },
      position: midpoint(sourceName),
    },
  })
  const prepare = await server.response(41)
  assert.equal(prepare.error, undefined, JSON.stringify(prepare.error))

  const changedText = sourceText
    .replaceAll("loadProfile", "loadFallback")
    .replace("./CallTarget", "./CallFallback")
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: sourceUri, version: 2 },
      contentChanges: [{ text: changedText }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 42,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepare.result[0] },
  })

  const outgoing = await server.response(42)
  assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
  assert.equal(outgoing.result.length, 1)
  assert.deepEqual(outgoing.result[0].to, {
    name: "loadFallback",
    kind: 12,
    uri: fallbackUri,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 2, character: 1 },
    },
    selectionRange: exactTextRange(fallbackText, "loadFallback"),
  })
  assert.deepEqual(
    outgoing.result[0].fromRanges,
    exactTextRanges(changedText, "loadFallback").slice(1),
  )
})

test("sorts reversed outgoing targets by locale-independent ordinal URI and groups repeats", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const sortPath = path.join(fixtureRoot, "CallSortSource.ets")
  const sortUri = pathToFileURL(sortPath).href
  const sortText = fs.readFileSync(sortPath, "utf8")
  const upperUri = pathToFileURL(path.join(fixtureRoot, "CallZTarget.ets")).href
  const lowerUri = pathToFileURL(path.join(fixtureRoot, "CallaTarget.ets")).href

  assert.equal(upperUri < lowerUri, true, "fixture must distinguish ordinal from locale sort")

  server.send({
    jsonrpc: "2.0",
    id: 50,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(50)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: sortUri,
        languageId: "arkts",
        version: 1,
        text: sortText,
      },
    },
  })

  const nameRange = exactTextRange(sortText, "sortedCalls")
  server.send({
    jsonrpc: "2.0",
    id: 51,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: sortUri },
      position: midpoint(nameRange),
    },
  })
  const prepare = await server.response(51)
  assert.equal(prepare.error, undefined, JSON.stringify(prepare.error))
  server.send({
    jsonrpc: "2.0",
    id: 52,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepare.result[0] },
  })

  const outgoing = await server.response(52)
  assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
  assert.deepEqual(outgoing.result.map((call) => call.to.uri), [upperUri, lowerUri])
  assert.deepEqual(outgoing.result.map((call) => call.fromRanges.length), [1, 2])
  assert.deepEqual(
    outgoing.result[1].fromRanges,
    exactTextRanges(sortText, "lowerCall").slice(1),
  )
})

test("converts malformed internal call hierarchy items into fixed RequestFailed errors", async (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-adapter-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const outputPath = path.join(outputDirectory, "adapter.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "lsp", "call-hierarchy-adapter.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: outputPath,
    logLevel: "silent",
  })
  const { boundedCallHierarchyItems } = require(outputPath)

  assert.throws(
    () => boundedCallHierarchyItems([null]),
    (error) => {
      assert.equal(error.code, -32803)
      assert.equal(
        error.message,
        "Call hierarchy result is incomplete: source-unmappable.",
      )
      return true
    },
  )
})

function exactTextRanges(text, needle) {
  const ranges = []
  let offset = 0
  while ((offset = text.indexOf(needle, offset)) >= 0) {
    ranges.push(rangeAt(text, offset, needle.length))
    offset += needle.length
  }
  return ranges
}

function exactTextRange(text, needle) {
  const offset = text.indexOf(needle)
  assert.notEqual(offset, -1, `${JSON.stringify(needle)} must exist in fixture`)
  return rangeAt(text, offset, needle.length)
}

function rangeAt(text, offset, length) {
  return { start: positionAt(text, offset), end: positionAt(text, offset + length) }
}

function positionAt(text, offset) {
  const before = text.slice(0, offset)
  const lines = before.split("\n")
  return { line: lines.length - 1, character: lines.at(-1).length }
}

function midpoint(range) {
  return { line: range.start.line, character: range.start.character + 1 }
}

function containsRange(outer, inner) {
  return comparePositions(outer.start, inner.start) <= 0
    && comparePositions(inner.end, outer.end) <= 0
}

function comparePositions(left, right) {
  return left.line - right.line || left.character - right.character
}

function textInRange(text, range) {
  const start = offsetAt(text, range.start)
  const end = offsetAt(text, range.end)
  return text.slice(start, end)
}

function offsetAt(text, position) {
  const lines = text.split("\n")
  return lines.slice(0, position.line).reduce((total, line) => total + line.length + 1, 0)
    + position.character
}
