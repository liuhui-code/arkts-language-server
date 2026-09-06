import assert from "node:assert/strict"
import { createHash } from "node:crypto"
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
const fixtureRootUri = pathToFileURL(fixtureRoot).href
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
    data: callHierarchyData(fixtureRootUri),
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
      data: callHierarchyData(fixtureRootUri),
    },
    fromRanges: callRanges,
  }])
  assert.equal(textInRange(targetText, outgoing.result[0].to.range), targetText.trimEnd())
  assert.equal(containsRange(
    outgoing.result[0].to.range,
    outgoing.result[0].to.selectionRange,
  ), true)
  assert.equal(openedUris.has(targetUri), false, "outgoing target must stay unopened")

  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "callHierarchy/outgoingCalls",
    params: { item: outgoing.result[0].to },
  })
  const unopenedFollowup = await server.response(4)
  assert.equal(unopenedFollowup.error, undefined, JSON.stringify(unopenedFollowup.error))
  assert.deepEqual(unopenedFollowup.result, [])
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
    data: callHierarchyData(fixtureRootUri),
  }])
  assert.equal(containsRange(response.result[0].range, selectionRange), true)
  assert.equal(textInRange(arrowText, response.result[0].range), [
    "renderArrow",
    " = (): string => loadProfile()",
  ].join(""))
})

test("rejects malformed prepare and call hierarchy follow-up parameters", async (t) => {
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
        data: callHierarchyData(fixtureRootUri),
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
        data: callHierarchyData(fixtureRootUri),
      },
    },
  })
  const unsupportedKind = await server.response(23)
  assert.deepEqual(unsupportedKind.error, {
    code: -32602,
    message: "Invalid call hierarchy outgoing parameters.",
  })

  server.send({
    jsonrpc: "2.0",
    id: 24,
    method: "callHierarchy/incomingCalls",
    params: {
      item: {
        name: "renderProfile",
        kind: 12,
        uri: sourceUri,
        range: validRange,
        selectionRange: validRange,
        data: {
          ...callHierarchyData(fixtureRootUri),
          untrustedExtra: true,
        },
      },
    },
  })
  const malformedIncoming = await server.response(24)
  assert.deepEqual(malformedIncoming.error, {
    code: -32602,
    message: "Invalid call hierarchy incoming parameters.",
  })

  server.send({
    jsonrpc: "2.0",
    id: 25,
    method: "callHierarchy/outgoingCalls",
    params: {
      item: {
        name: "renderProfile",
        kind: 12,
        uri: sourceUri,
        range: validRange,
        selectionRange: validRange,
        data: callHierarchyData(pathToFileURL(os.tmpdir()).href),
      },
    },
  })
  const unconfiguredRoot = await server.response(25)
  assert.deepEqual(unconfiguredRoot.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: source-outside-workspace.",
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
          data: callHierarchyData(fixtureRootUri),
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

test("fails the whole incoming request when one caller exceeds its range budget", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 33,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: fixtureRootUri,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(33)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: targetUri,
        languageId: "arkts",
        version: 1,
        text: targetText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 34,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: targetUri },
      position: midpoint(exactTextRange(targetText, "loadProfile")),
    },
  })
  const prepared = await server.response(34)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 35,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const incoming = await server.response(35)
  assert.equal(incoming.result, undefined)
  assert.deepEqual(incoming.error, {
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
    data: callHierarchyData(fixtureRootUri),
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

test("sorts, deduplicates, and fail-closes incoming adapter budgets", (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-incoming-adapter-"))
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
  const { boundedIncomingCalls, boundedOutgoingCalls } = require(outputPath)
  const upper = semanticCallHierarchyItem("IncomingZCaller.ets", "upperCall")
  const lower = semanticCallHierarchyItem("IncomingaCaller.ets", "lowerCall")
  assert.equal(upper.uri < lower.uri, true, "fixture must distinguish ordinal from locale sort")
  const firstRange = protocolRange(1)
  const secondRange = protocolRange(2)

  const normalized = boundedIncomingCalls([
    { from: lower, fromRanges: [secondRange, firstRange, secondRange] },
    { from: upper, fromRanges: [firstRange] },
    { from: lower, fromRanges: [firstRange] },
  ], fixtureRootUri)
  assert.deepEqual(normalized.map((call) => call.from.uri), [upper.uri, lower.uri])
  assert.deepEqual(normalized[1].fromRanges, [firstRange, secondRange])

  assertCallHierarchyLimit(() => boundedIncomingCalls(
    Array.from({ length: 257 }, () => ({ from: upper, fromRanges: [firstRange] })),
    fixtureRootUri,
  ))
  assertCallHierarchyLimit(() => boundedIncomingCalls([{
    from: upper,
    fromRanges: Array.from({ length: 65 }, () => firstRange),
  }], fixtureRootUri))
  assertCallHierarchyLimit(() => boundedOutgoingCalls(
    Array.from({ length: 257 }, () => ({ to: upper, fromRanges: [firstRange] })),
    fixtureRootUri,
  ))
  assertCallHierarchyLimit(() => boundedOutgoingCalls([{
    to: upper,
    fromRanges: Array.from({ length: 65 }, () => firstRange),
  }], fixtureRootUri))

  const exactRanges = Array.from({ length: 64 }, (_value, index) => protocolRange(index))
  assert.equal(boundedIncomingCalls([
    { from: upper, fromRanges: exactRanges },
  ], fixtureRootUri)[0].fromRanges.length, 64)
  assertCallHierarchyLimit(() => boundedIncomingCalls([
    { from: upper, fromRanges: [...exactRanges, protocolRange(64)] },
  ], fixtureRootUri))

  const exactEdges = Array.from({ length: 256 }, (_value, index) => ({
    from: semanticCallHierarchyItem(`Caller${String(index).padStart(3, "0")}.ets`, `call${index}`),
    fromRanges: [firstRange],
  }))
  assert.equal(boundedIncomingCalls(exactEdges, fixtureRootUri).length, 256)
  assertCallHierarchyLimit(() => boundedIncomingCalls([
    ...exactEdges,
    { from: semanticCallHierarchyItem("CallerOverflow.ets", "overflow"), fromRanges: [firstRange] },
  ], fixtureRootUri))

  const exactTotalRanges = Array.from({ length: 32 }, (_value, index) => ({
    from: semanticCallHierarchyItem(`RangeCaller${index}.ets`, `rangeCall${index}`),
    fromRanges: exactRanges,
  }))
  assert.equal(
    boundedIncomingCalls(exactTotalRanges, fixtureRootUri)
      .reduce((total, call) => total + call.fromRanges.length, 0),
    2_048,
  )
  assertCallHierarchyLimit(() => boundedIncomingCalls([
    ...exactTotalRanges,
    { from: semanticCallHierarchyItem("RangeOverflow.ets", "rangeOverflow"), fromRanges: [firstRange] },
  ], fixtureRootUri))

  const wireOverflow = Array.from({ length: 17 }, (_value, index) => ({
    from: {
      ...semanticCallHierarchyItem(`WireCaller${index}.ets`, `wireCall${index}`),
      detail: "x".repeat(16 * 1_024),
    },
    fromRanges: [firstRange],
  }))
  assertCallHierarchyLimit(() => boundedIncomingCalls(wireOverflow, fixtureRootUri))
})

test("rejects raw duplicate work before any result-source filesystem validation", async (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-runner-preflight-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const outputPath = path.join(outputDirectory, "runner.cjs")
  buildSync({
    stdin: {
      contents: [
        "export { SemanticRequestRunner } from './src/lsp/semantic-request-runner.ts'",
        "export { assertCallHierarchyOutgoingWorkBudget } from './src/lsp/call-hierarchy-adapter.ts'",
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "runner-preflight.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: outputPath,
    logLevel: "silent",
  })
  const {
    SemanticRequestRunner,
    assertCallHierarchyOutgoingWorkBudget,
  } = require(outputPath)
  const abortController = new AbortController()
  let resultSourceLookups = 0
  const runner = new SemanticRequestRunner({
    documents: {},
    freshness: {
      start: () => ({
        signal: abortController.signal,
        clientCancelled: () => false,
        isCurrent: () => true,
        finish: () => {},
      }),
    },
    logger: { info: () => {} },
    callHierarchySources: {
      workspace: () => ({ id: "workspace", rootUri: fixtureRootUri }),
      resolve: async () => ({
        status: "complete",
        source: {
          kind: "disk",
          uri: sourceUri,
          text: sourceText,
          workspaceId: "workspace",
          workspaceRootUri: fixtureRootUri,
        },
        identity: {},
      }),
      validateResultItems: async () => {
        resultSourceLookups += 1
        return undefined
      },
      isCurrent: async () => true,
    },
    assertRunning: () => {},
    snapshot: () => { throw new Error("unused") },
  })
  const duplicate = {
    to: semanticCallHierarchyItem("Missing.ts", "missing"),
    fromRanges: [protocolRange(0)],
  }
  await assert.rejects(
    runner.runCallHierarchy({
      method: "callHierarchy/outgoingCalls",
      documentUri: sourceUri,
      rootUri: fixtureRootUri,
      fallback: { status: "stale" },
      incomplete: (reason) => ({ status: "incomplete", reason }),
      preflight: (result) => assertCallHierarchyOutgoingWorkBudget(result.calls),
      resultItems: (result) => result.calls.map((call) => call.to),
      execute: async () => ({
        status: "complete",
        calls: Array.from({ length: 257 }, () => duplicate),
      }),
    }),
    (error) => error.code === -32803
      && error.message === "Call hierarchy result is incomplete: result-limit-exceeded.",
  )
  assert.equal(resultSourceLookups, 0)
})

test("returns one exact unopened caller with both UTF-16 incoming call sites", async (t) => {
  const server = new LspProcess()
  const openedUris = new Set()
  t.after(() => server.close())
  const incomingTargetPath = path.join(fixtureRoot, "IncomingTarget.ets")
  const incomingSourcePath = path.join(fixtureRoot, "IncomingSource.ets")
  const incomingTargetUri = pathToFileURL(incomingTargetPath).href
  const incomingSourceUri = pathToFileURL(incomingSourcePath).href
  const incomingTargetText = fs.readFileSync(incomingTargetPath, "utf8")
  const incomingSourceText = fs.readFileSync(incomingSourcePath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 60,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  const initialize = await server.response(60)
  assert.equal(initialize.result.capabilities.callHierarchyProvider, undefined)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: incomingTargetUri,
        languageId: "arkts",
        version: 1,
        text: incomingTargetText,
      },
    },
  })
  openedUris.add(incomingTargetUri)

  const targetName = exactTextRange(incomingTargetText, "receiveProfile")
  server.send({
    jsonrpc: "2.0",
    id: 61,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: incomingTargetUri },
      position: midpoint(targetName),
    },
  })
  const prepare = await server.response(61)
  assert.equal(prepare.error, undefined, JSON.stringify(prepare.error))
  assert.equal(prepare.result.length, 1)

  server.send({
    jsonrpc: "2.0",
    id: 62,
    method: "callHierarchy/incomingCalls",
    params: { item: prepare.result[0] },
  })

  const incoming = await server.response(62)
  assert.equal(incoming.error, undefined, JSON.stringify(incoming.error))
  const callerName = exactTextRange(incomingSourceText, "renderIncoming")
  const fromRanges = exactTextRanges(incomingSourceText, "receiveProfile").slice(1)
  assert.equal(fromRanges.length, 2)
  for (const range of fromRanges) {
    const line = incomingSourceText.split("\n")[range.start.line]
    const codePointColumn = Array.from(line.slice(0, range.start.character)).length
    assert.equal(range.start.character, codePointColumn + 1, "emoji must prove UTF-16 columns")
  }
  assert.deepEqual(incoming.result, [{
    from: {
      name: "renderIncoming",
      kind: 12,
      uri: incomingSourceUri,
      range: {
        start: { line: 2, character: 0 },
        end: { line: 6, character: 1 },
      },
      selectionRange: callerName,
      data: callHierarchyData(fixtureRootUri),
    },
    fromRanges,
  }])
  assert.equal(openedUris.has(incomingSourceUri), false, "incoming caller must stay unopened")
})

test("uses the current caller overlay when resolving incoming calls", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const incomingTargetPath = path.join(fixtureRoot, "IncomingTarget.ets")
  const incomingSourcePath = path.join(fixtureRoot, "IncomingSource.ets")
  const incomingTargetUri = pathToFileURL(incomingTargetPath).href
  const incomingSourceUri = pathToFileURL(incomingSourcePath).href
  const incomingTargetText = fs.readFileSync(incomingTargetPath, "utf8")
  const overlayText = [
    "import { receiveProfile } from './IncomingTarget'",
    "",
    "export function renderOverlay(): string {",
    "  const only: string = `😀${receiveProfile()}`",
    "  return only",
    "}",
    "",
  ].join("\n")

  server.send({
    jsonrpc: "2.0",
    id: 63,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: fixtureRootUri,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(63)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  for (const [uri, text] of [
    [incomingTargetUri, incomingTargetText],
    [incomingSourceUri, overlayText],
  ]) {
    server.send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: { uri, languageId: "arkts", version: 1, text },
      },
    })
  }
  server.send({
    jsonrpc: "2.0",
    id: 64,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: incomingTargetUri },
      position: midpoint(exactTextRange(incomingTargetText, "receiveProfile")),
    },
  })
  const prepared = await server.response(64)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 65,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const incoming = await server.response(65)
  assert.equal(incoming.error, undefined, JSON.stringify(incoming.error))
  assert.deepEqual(incoming.result, [{
    from: {
      name: "renderOverlay",
      kind: 12,
      uri: incomingSourceUri,
      range: {
        start: { line: 2, character: 0 },
        end: { line: 5, character: 1 },
      },
      selectionRange: exactTextRange(overlayText, "renderOverlay"),
      data: callHierarchyData(fixtureRootUri),
    },
    fromRanges: exactTextRanges(overlayText, "receiveProfile").slice(1),
  }])
})

test("prepares an ArkTS struct with Struct kind and its complete declaration range", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const profilePath = path.join(fixtureRoot, "Profile.ets")
  const profileUri = pathToFileURL(profilePath).href
  const profileText = fs.readFileSync(profilePath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 70,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  const initialize = await server.response(70)
  assert.equal(initialize.result.capabilities.callHierarchyProvider, undefined)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: profileUri,
        languageId: "arkts",
        version: 1,
        text: profileText,
      },
    },
  })

  const selectionRange = exactTextRange(profileText, "Profile")
  server.send({
    jsonrpc: "2.0",
    id: 71,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: profileUri },
      position: midpoint(selectionRange),
    },
  })
  const response = await server.response(71)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [{
    name: "Profile",
    kind: 23,
    uri: profileUri,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 6, character: 1 },
    },
    selectionRange,
    data: callHierarchyData(fixtureRootUri),
  }])
  assert.equal(textInRange(profileText, response.result[0].range), profileText.trimEnd())
  assert.equal(containsRange(response.result[0].range, selectionRange), true)
})

test("rejects an old unopened item after its disk declaration identity changes", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-stale-disk-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const server = new LspProcess()
  t.after(() => server.close())
  const diskSourcePath = path.join(workspace, "Source.ets")
  const diskTargetPath = path.join(workspace, "Target.ets")
  const diskSourceText = [
    "import { diskTarget } from './Target'",
    "",
    "export function diskSource(): string {",
    "  return diskTarget()",
    "}",
    "",
  ].join("\n")
  fs.writeFileSync(diskSourcePath, diskSourceText, "utf8")
  fs.writeFileSync(
    diskTargetPath,
    "export function diskTarget(): string { return 'first' }\n",
    "utf8",
  )
  const workspaceUri = pathToFileURL(workspace).href
  const diskSourceUri = pathToFileURL(diskSourcePath).href

  server.send({
    jsonrpc: "2.0",
    id: 80,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: workspaceUri,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(80)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: diskSourceUri,
        languageId: "arkts",
        version: 1,
        text: diskSourceText,
      },
    },
  })

  server.send({
    jsonrpc: "2.0",
    id: 81,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: diskSourceUri },
      position: midpoint(exactTextRange(diskSourceText, "diskSource")),
    },
  })
  const prepared = await server.response(81)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 82,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepared.result[0] },
  })
  const outgoing = await server.response(82)
  assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
  assert.equal(outgoing.result.length, 1)

  fs.writeFileSync(
    diskTargetPath,
    "export function diskMutant(): string { return 'second' }\n",
    "utf8",
  )
  server.send({
    jsonrpc: "2.0",
    id: 83,
    method: "callHierarchy/outgoingCalls",
    params: { item: outgoing.result[0].to },
  })
  const stale = await server.response(83)
  assert.deepEqual(stale.error, {
    code: -32801,
    message: "Call hierarchy item no longer matches the current document.",
  })
})

test("preserves a UTF-8 BOM when following an unopened disk item", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-bom-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const bomSourcePath = path.join(workspace, "Source.ets")
  const bomTargetPath = path.join(workspace, "Target.ets")
  const bomSourceText = [
    "import { bomTarget } from './Target'",
    "export function bomSource(): string { return bomTarget() }",
    "",
  ].join("\n")
  const bomTargetText = "\uFEFFexport function bomTarget(): string { return 'ok' }\n"
  fs.writeFileSync(bomSourcePath, bomSourceText, "utf8")
  fs.writeFileSync(bomTargetPath, bomTargetText, "utf8")
  const bomSourceUri = pathToFileURL(bomSourcePath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 84,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(84)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: bomSourceUri,
        languageId: "arkts",
        version: 1,
        text: bomSourceText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 85,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: bomSourceUri },
      position: midpoint(exactTextRange(bomSourceText, "bomSource")),
    },
  })
  const prepared = await server.response(85)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 86,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepared.result[0] },
  })
  const outgoing = await server.response(86)
  assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
  assert.deepEqual(
    outgoing.result[0].to.selectionRange,
    exactTextRange(bomTargetText, "bomTarget"),
  )
  server.send({
    jsonrpc: "2.0",
    id: 87,
    method: "callHierarchy/outgoingCalls",
    params: { item: outgoing.result[0].to },
  })
  const followup = await server.response(87)
  assert.equal(followup.error, undefined, JSON.stringify(followup.error))
  assert.deepEqual(followup.result, [])
})

test("uses the configured project resolver workspace id for follow-up freshness", async (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-opaque-root-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const serverPath = path.join(outputDirectory, "server.cjs")
  buildSync({
    stdin: {
      contents: [
        "import { createHash } from 'node:crypto'",
        "import { pathToFileURL } from 'node:url'",
        "import { runLanguageServer } from './src/lsp/run-language-server.ts'",
        "import { LegacySemanticEngine } from './src/semantic/legacy-semantic-engine.ts'",
        "class OpaqueProjectResolver {",
        "  rootUri = pathToFileURL(process.cwd()).href",
        "  configure(rootUris) { if (rootUris[0]) this.rootUri = rootUris[0] }",
        "  projectFor() { return { id: 'opaque-workspace-id', rootUri: this.rootUri } }",
        "}",
        "const projects = new OpaqueProjectResolver()",
        "runLanguageServer({ projects, semantic: new LegacySemanticEngine(projects) })",
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "opaque-project-server.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
    logLevel: "silent",
  })
  const server = new LspProcess({ serverPath })
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 88,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: fixtureRootUri,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(88)
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
  server.send({
    jsonrpc: "2.0",
    id: 89,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: sourceUri },
      position: midpoint(exactTextRange(sourceText, "renderProfile")),
    },
  })
  const prepared = await server.response(89)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 90,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepared.result[0] },
  })
  const outgoing = await server.response(90)
  assert.equal(outgoing.error, undefined, JSON.stringify(outgoing.error))
  assert.equal(outgoing.result.length, 1)
})

test("discards a call hierarchy follow-up superseded by an overlay change", async (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-freshness-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const serverPath = path.join(outputDirectory, "server.cjs")
  buildSync({
    stdin: {
      contents: [
        "import { createHash } from 'node:crypto'",
        "import { pathToFileURL } from 'node:url'",
        "import { runLanguageServer } from './src/lsp/run-language-server.ts'",
        "class Resolver {",
        "  rootUri = pathToFileURL(process.cwd()).href",
        "  configure(rootUris) { if (rootUris[0]) this.rootUri = rootUris[0] }",
        "  projectFor() { return { id: 'fresh-workspace', rootUri: this.rootUri } }",
        "}",
        "class Semantic {",
        "  sync() {}",
        "  close() {}",
        "  dispose() {}",
        "  async diagnose(query) { return { documentVersion: query.document.version, value: [] } }",
        "  async prepareCallHierarchy(query) {",
        "    const fingerprint = createHash('sha256').update(query.document.text, 'utf8').digest('hex')",
        "    return { documentVersion: query.document.version, value: { status: 'complete', items: [{",
        "      uri: query.document.uri, name: 'delayedCall', kind: 'function', sourceFingerprint: fingerprint,",
        "      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 51 } },",
        "      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 27 } },",
        "    }] } }",
        "  }",
        "  async outgoingCalls() {",
        "    await new Promise((resolve) => setTimeout(resolve, 150))",
        "    return { status: 'complete', calls: [] }",
        "  }",
        "  async incomingCalls() { return { status: 'complete', calls: [] } }",
        "}",
        "const projects = new Resolver()",
        "runLanguageServer({ projects, semantic: new Semantic() })",
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "call-hierarchy-freshness-server.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
    logLevel: "silent",
  })
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-freshness-root-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const documentPath = path.join(workspace, "Delayed.ets")
  const firstText = "export function delayedCall(): string { return 'old' }\n"
  const secondText = "export function delayedCall(): string { return 'new' }\n"
  fs.writeFileSync(documentPath, firstText, "utf8")
  const documentUri = pathToFileURL(documentPath).href
  const server = new LspProcess({ serverPath })
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 91,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(91)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: firstText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 92,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: documentUri },
      position: midpoint(exactTextRange(firstText, "delayedCall")),
    },
  })
  const prepared = await server.response(92)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 93,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepared.result[0] },
  })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{ text: secondText }],
    },
  })
  const stale = await server.response(93)
  assert.deepEqual(stale.error, {
    code: -32801,
    message: "Call hierarchy item no longer matches the current document.",
  })
})

test("rejects prepare when an opened workspace symlink resolves outside the root", async (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-prepare-symlink-server-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const serverPath = path.join(outputDirectory, "server.cjs")
  buildSync({
    stdin: {
      contents: [
        "import { createHash } from 'node:crypto'",
        "import { pathToFileURL } from 'node:url'",
        "import { runLanguageServer } from './src/lsp/run-language-server.ts'",
        "class Resolver {",
        "  rootUri = pathToFileURL(process.cwd()).href",
        "  configure(rootUris) { if (rootUris[0]) this.rootUri = rootUris[0] }",
        "  projectFor() { return { id: 'prepare-symlink-workspace', rootUri: this.rootUri } }",
        "}",
        "class Semantic {",
        "  sync() {}",
        "  close() {}",
        "  dispose() {}",
        "  async diagnose(query) { return { documentVersion: query.document.version, value: [] } }",
        "  async prepareCallHierarchy(query) {",
        "    const fingerprint = createHash('sha256').update(query.document.text, 'utf8').digest('hex')",
        "    return { documentVersion: query.document.version, value: { status: 'complete', items: [{",
        "      uri: query.document.uri, name: 'escapedPrepare', kind: 'function', sourceFingerprint: fingerprint,",
        "      range: { start: { line: 0, character: 0 }, end: { line: 0, character: query.document.text.trimEnd().length } },",
        "      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 30 } },",
        "    }] } }",
        "  }",
        "  async outgoingCalls() { return { status: 'complete', calls: [] } }",
        "  async incomingCalls() { return { status: 'complete', calls: [] } }",
        "}",
        "const projects = new Resolver()",
        "runLanguageServer({ projects, semantic: new Semantic() })",
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "prepare-symlink-server.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
    logLevel: "silent",
  })
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-prepare-symlink-"))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const workspace = path.join(parent, "workspace")
  fs.mkdirSync(workspace)
  const externalPath = path.join(parent, "External.ets")
  const linkedPath = path.join(workspace, "Linked.ets")
  const text = "export function escapedPrepare(): string { return 'outside' }\n"
  fs.writeFileSync(externalPath, text, "utf8")
  fs.symlinkSync(externalPath, linkedPath)
  const linkedUri = pathToFileURL(linkedPath).href
  const server = new LspProcess({ serverPath })
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 94,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(94)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: linkedUri, languageId: "arkts", version: 1, text },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 95,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: linkedUri },
      position: midpoint(exactTextRange(text, "escapedPrepare")),
    },
  })
  const response = await server.response(95)
  assert.equal(response.result, undefined)
  assert.deepEqual(response.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: source-outside-workspace.",
  })
})

test("rejects an outgoing result when target bytes change after semantic execution", async (t) => {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-result-identity-server-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const serverPath = path.join(outputDirectory, "server.cjs")
  buildSync({
    stdin: {
      contents: [
        "import { createHash } from 'node:crypto'",
        "import fs from 'node:fs'",
        "import path from 'node:path'",
        "import { pathToFileURL } from 'node:url'",
        "import { runLanguageServer } from './src/lsp/run-language-server.ts'",
        "class Resolver {",
        "  rootUri = pathToFileURL(process.cwd()).href",
        "  configure(rootUris) { if (rootUris[0]) this.rootUri = rootUris[0] }",
        "  projectFor() { return { id: 'result-identity-workspace', rootUri: this.rootUri } }",
        "}",
        "const fingerprint = (text) => createHash('sha256').update(text, 'utf8').digest('hex')",
        "class Semantic {",
        "  sync() {}",
        "  close() {}",
        "  dispose() {}",
        "  async diagnose(query) { return { documentVersion: query.document.version, value: [] } }",
        "  async prepareCallHierarchy(query) {",
        "    return { documentVersion: query.document.version, value: { status: 'complete', items: [{",
        "      uri: query.document.uri, name: 'identitySource', kind: 'function', sourceFingerprint: fingerprint(query.document.text),",
        "      range: { start: { line: 0, character: 0 }, end: { line: 0, character: query.document.text.trimEnd().length } },",
        "      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 30 } },",
        "    }] } }",
        "  }",
        "  async outgoingCalls(query) {",
        "    const targetPath = path.join(path.dirname(new URL(query.item.uri).pathname), 'Target.ets')",
        "    const text = fs.readFileSync(targetPath, 'utf8')",
        "    await new Promise((resolve) => setTimeout(resolve, 150))",
        "    return { status: 'complete', calls: [{ to: {",
        "      uri: pathToFileURL(targetPath).href, name: 'oldTargetCall', kind: 'function', sourceFingerprint: fingerprint(text),",
        "      range: { start: { line: 0, character: 0 }, end: { line: 0, character: text.trimEnd().length } },",
        "      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 29 } },",
        "    }, fromRanges: [{ start: { line: 0, character: 50 }, end: { line: 0, character: 63 } }] }] }",
        "  }",
        "  async incomingCalls() { return { status: 'complete', calls: [] } }",
        "}",
        "const projects = new Resolver()",
        "runLanguageServer({ projects, semantic: new Semantic() })",
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "result-identity-server.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
    logLevel: "silent",
  })
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-result-identity-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const sourcePath = path.join(workspace, "Source.ets")
  const targetPath = path.join(workspace, "Target.ets")
  const sourceText = "export function identitySource(): string { return oldTargetCall() }\n"
  const oldTargetText = "export function oldTargetCall(): string { return 'old' }\n"
  const newTargetText = "export function newTargetCall(): string { return 'new' }\n"
  fs.writeFileSync(sourcePath, sourceText, "utf8")
  fs.writeFileSync(targetPath, oldTargetText, "utf8")
  const sourceUri = pathToFileURL(sourcePath).href
  const server = new LspProcess({ serverPath })
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 96,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(96)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri: sourceUri, languageId: "arkts", version: 1, text: sourceText } },
  })
  server.send({
    jsonrpc: "2.0",
    id: 97,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: sourceUri },
      position: midpoint(exactTextRange(sourceText, "identitySource")),
    },
  })
  const prepared = await server.response(97)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 98,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepared.result[0] },
  })
  await new Promise((resolve) => setTimeout(resolve, 50))
  fs.writeFileSync(targetPath, newTargetText, "utf8")
  const response = await server.response(98)
  assert.equal(response.result, undefined)
  assert.deepEqual(response.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: source-unavailable.",
  })
})

test("rejects an unopened result URI that names a directory with a source extension", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-directory-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const directoryPath = path.join(workspace, "NotAFile.ts")
  fs.mkdirSync(directoryPath)
  const outputPath = path.join(workspace, "authority.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "lsp", "call-hierarchy-source-authority.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: outputPath,
    logLevel: "silent",
  })
  const { CallHierarchySourceAuthority } = require(outputPath)
  const rootUri = pathToFileURL(workspace).href
  const authority = new CallHierarchySourceAuthority({
    documents: { get: () => undefined },
    snapshot: () => { throw new Error("unexpected open snapshot") },
    workspaceRoots: () => [{ id: "workspace", rootUri }],
  })

  assert.deepEqual(
    await authority.resolve(pathToFileURL(directoryPath).href, rootUri),
    { status: "incomplete", reason: "source-unavailable" },
  )
})

test("enforces physical root ownership and open-source identity in the source authority", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-physical-authority-"))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const outer = path.join(parent, "outer")
  const nested = path.join(outer, "nested")
  fs.mkdirSync(nested, { recursive: true })
  const nestedPath = path.join(nested, "Nested.ets")
  const aliasDirectory = path.join(outer, "alias")
  fs.writeFileSync(nestedPath, "export function nestedCall(): void {}\n", "utf8")
  fs.symlinkSync(nested, aliasDirectory)

  const outputPath = path.join(parent, "authority.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "lsp", "call-hierarchy-source-authority.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: outputPath,
    logLevel: "silent",
  })
  const { CallHierarchySourceAuthority } = require(outputPath)
  const outerUri = pathToFileURL(outer).href
  const nestedUri = pathToFileURL(nested).href
  const authority = new CallHierarchySourceAuthority({
    documents: { get: () => undefined },
    snapshot: () => { throw new Error("unexpected open snapshot") },
    workspaceRoots: () => [
      { id: "outer", rootUri: outerUri },
      { id: "nested", rootUri: nestedUri },
    ],
  })
  assert.deepEqual(
    await authority.resolve(pathToFileURL(path.join(aliasDirectory, "Nested.ets")).href, outerUri),
    { status: "incomplete", reason: "source-outside-workspace" },
  )

  const workspace = path.join(parent, "open-root")
  fs.mkdirSync(workspace)
  const insidePath = path.join(workspace, "Inside.ets")
  const outsidePath = path.join(parent, "Outside.ets")
  const linkPath = path.join(workspace, "Linked.ets")
  const text = "export function linkedCall(): void {}\n"
  fs.writeFileSync(insidePath, text, "utf8")
  fs.writeFileSync(outsidePath, text, "utf8")
  fs.symlinkSync(insidePath, linkPath)
  const workspaceUri = pathToFileURL(workspace).href
  const linkUri = pathToFileURL(linkPath).href
  const openDocument = { uri: linkUri, version: 1, getText: () => text }
  const openAuthority = new CallHierarchySourceAuthority({
    documents: { get: (uri) => uri === linkUri ? openDocument : undefined },
    snapshot: (document) => ({
      uri: document.uri,
      version: document.version,
      text: document.getText(),
      workspaceId: "open-root",
    }),
    workspaceRoots: () => [{ id: "open-root", rootUri: workspaceUri }],
  })
  const resolution = await openAuthority.resolve(linkUri, workspaceUri)
  assert.equal(resolution.status, "complete")
  fs.unlinkSync(linkPath)
  fs.symlinkSync(outsidePath, linkPath)
  assert.equal(await openAuthority.isCurrent(resolution), false)

  const danglingPath = path.join(workspace, "Dangling.ets")
  const danglingUri = pathToFileURL(danglingPath).href
  fs.symlinkSync(path.join(parent, "MissingOutside.ets"), danglingPath)
  const danglingDocument = { uri: danglingUri, version: 1, getText: () => text }
  const danglingAuthority = new CallHierarchySourceAuthority({
    documents: { get: (uri) => uri === danglingUri ? danglingDocument : undefined },
    snapshot: (document) => ({
      uri: document.uri,
      version: document.version,
      text: document.getText(),
      workspaceId: "open-root",
    }),
    workspaceRoots: () => [{ id: "open-root", rootUri: workspaceUri }],
  })
  assert.deepEqual(
    await danglingAuthority.resolve(danglingUri, workspaceUri),
    { status: "incomplete", reason: "source-unavailable" },
    "an existing dangling symlink must not be treated as a new in-root overlay path",
  )
})

test("validates exact UTF-8 result sources within an aggregate byte budget", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-result-source-budget-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outputPath = path.join(workspace, "authority.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "lsp", "call-hierarchy-source-authority.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: outputPath,
    logLevel: "silent",
  })
  const { CallHierarchySourceAuthority } = require(outputPath)
  const rootUri = pathToFileURL(workspace).href
  const authority = new CallHierarchySourceAuthority({
    documents: { get: () => undefined },
    snapshot: () => { throw new Error("unexpected open snapshot") },
    workspaceRoots: () => [{ id: "workspace", rootUri }],
  })
  const exactText = "x".repeat(4 * 1_024 * 1_024)
  const exactFingerprint = createHash("sha256").update(exactText, "utf8").digest("hex")
  const items = Array.from({ length: 4 }, (_value, index) => {
    const sourcePath = path.join(workspace, `Exact${index}.ts`)
    fs.writeFileSync(sourcePath, exactText, "utf8")
    return {
      ...semanticCallHierarchyItem(`Exact${index}.ts`, `exact${index}`),
      uri: pathToFileURL(sourcePath).href,
      sourceFingerprint: exactFingerprint,
    }
  })
  assert.equal(await authority.validateResultItems(items, rootUri), undefined)
  const overflowPath = path.join(workspace, "Overflow.ts")
  fs.writeFileSync(overflowPath, "x", "utf8")
  assert.equal(await authority.validateResultItems([
    ...items,
    {
      ...semanticCallHierarchyItem("Overflow.ts", "overflow"),
      uri: pathToFileURL(overflowPath).href,
      sourceFingerprint: createHash("sha256").update("x", "utf8").digest("hex"),
    },
  ], rootUri), "result-limit-exceeded")

  const invalidPath = path.join(workspace, "Invalid.ts")
  fs.writeFileSync(invalidPath, Buffer.from([0xff]))
  assert.equal(await authority.validateResultItems([{
    ...semanticCallHierarchyItem("Invalid.ts", "invalid"),
    uri: pathToFileURL(invalidPath).href,
    sourceFingerprint: "0".repeat(64),
  }], rootUri), "source-unavailable")

  const oversizedOpenUri = pathToFileURL(path.join(workspace, "OversizedOpen.ts")).href
  const oversizedOpenText = "x".repeat(4 * 1_024 * 1_024 + 1)
  const oversizedOpenDocument = {
    uri: oversizedOpenUri,
    version: 1,
    getText: () => oversizedOpenText,
  }
  const openAuthority = new CallHierarchySourceAuthority({
    documents: { get: (uri) => uri === oversizedOpenUri ? oversizedOpenDocument : undefined },
    snapshot: (document) => ({
      uri: document.uri,
      version: document.version,
      text: document.getText(),
      workspaceId: "workspace",
    }),
    workspaceRoots: () => [{ id: "workspace", rootUri }],
  })
  assert.equal(await openAuthority.validateResultItems([{
    ...semanticCallHierarchyItem("OversizedOpen.ts", "oversizedOpen"),
    uri: oversizedOpenUri,
    sourceFingerprint: createHash("sha256").update(oversizedOpenText, "utf8").digest("hex"),
  }], rootUri), "result-limit-exceeded")
})

test("fails an outgoing request atomically when a target resolves outside the workspace", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-outside-"))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const workspace = path.join(parent, "workspace")
  fs.mkdirSync(workspace)
  const insidePath = path.join(workspace, "Inside.ets")
  const outsidePath = path.join(parent, "Outside.ets")
  const insideText = [
    "import { outsideCall } from '../Outside'",
    "",
    "export function insideCall(): string {",
    "  return outsideCall()",
    "}",
    "",
  ].join("\n")
  fs.writeFileSync(insidePath, insideText, "utf8")
  fs.writeFileSync(outsidePath, "export function outsideCall(): string { return 'outside' }\n", "utf8")
  const insideUri = pathToFileURL(insidePath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 90,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(90)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: insideUri,
        languageId: "arkts",
        version: 1,
        text: insideText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 91,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: insideUri },
      position: midpoint(exactTextRange(insideText, "insideCall")),
    },
  })
  const prepared = await server.response(91)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 92,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepared.result[0] },
  })
  const outgoing = await server.response(92)
  assert.equal(outgoing.result, undefined)
  assert.deepEqual(outgoing.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: source-outside-workspace.",
  })
})

test("fails an outgoing request when a source symlink escapes the workspace", async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-symlink-"))
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }))
  const workspace = path.join(parent, "workspace")
  fs.mkdirSync(workspace)
  const sourcePath = path.join(workspace, "Source.ets")
  const escapedPath = path.join(parent, "Escaped.ets")
  const linkedPath = path.join(workspace, "Linked.ets")
  const sourceText = [
    "import { escapedCall } from './Linked'",
    "export function symlinkCaller(): string { return escapedCall() }",
    "",
  ].join("\n")
  fs.writeFileSync(sourcePath, sourceText, "utf8")
  fs.writeFileSync(escapedPath, "export function escapedCall(): string { return 'escaped' }\n", "utf8")
  fs.symlinkSync(escapedPath, linkedPath)
  const sourceUri = pathToFileURL(sourcePath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 93,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(93)
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
  server.send({
    jsonrpc: "2.0",
    id: 94,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: sourceUri },
      position: midpoint(exactTextRange(sourceText, "symlinkCaller")),
    },
  })
  const prepared = await server.response(94)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 95,
    method: "callHierarchy/outgoingCalls",
    params: { item: prepared.result[0] },
  })
  const outgoing = await server.response(95)
  assert.deepEqual(outgoing.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: source-outside-workspace.",
  })
})

test("fails incoming calls closed when workspace membership is partial", async (t) => {
  const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-call-hierarchy-partial-"))
  const targetPath = path.join(workspace, "PartialTarget.ets")
  const targetText = "export function partialTarget(): string { return 'target' }\n"
  await fs.promises.writeFile(targetPath, targetText, "utf8")
  await writeFillerSources(workspace, 20_000)
  const targetUri = pathToFileURL(targetPath).href
  const server = new LspProcess()
  t.after(async () => {
    try {
      await server.close()
    } finally {
      await fs.promises.rm(workspace, { recursive: true, force: true })
    }
  })

  server.send({
    jsonrpc: "2.0",
    id: 100,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(100)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: targetUri,
        languageId: "arkts",
        version: 1,
        text: targetText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 101,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: targetUri },
      position: midpoint(exactTextRange(targetText, "partialTarget")),
    },
  })
  const prepared = await server.response(101)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 102,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const incoming = await server.response(102, 30_000)
  assert.equal(incoming.result, undefined)
  assert.deepEqual(incoming.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: project-membership-incomplete.",
  })
})

test("fails incoming calls atomically when a caller belongs to a nested workspace", async (t) => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-cross-root-"))
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }))
  const nested = path.join(outer, "nested")
  fs.mkdirSync(nested)
  const targetPath = path.join(outer, "Target.ets")
  const callerPath = path.join(nested, "Caller.ets")
  const targetText = "export function crossRootTarget(): string { return 'target' }\n"
  fs.writeFileSync(targetPath, targetText, "utf8")
  fs.writeFileSync(callerPath, [
    "import { crossRootTarget } from '../Target'",
    "export function nestedCaller(): string { return crossRootTarget() }",
    "",
  ].join("\n"), "utf8")
  const outerUri = pathToFileURL(outer).href
  const nestedUri = pathToFileURL(nested).href
  const targetUri = pathToFileURL(targetPath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 110,
    method: "initialize",
    params: {
      processId: process.pid,
      workspaceFolders: [
        { uri: outerUri, name: "outer" },
        { uri: nestedUri, name: "nested" },
      ],
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(110)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: targetUri,
        languageId: "arkts",
        version: 1,
        text: targetText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 111,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: targetUri },
      position: midpoint(exactTextRange(targetText, "crossRootTarget")),
    },
  })
  const prepared = await server.response(111)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 112,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const incoming = await server.response(112)
  assert.equal(incoming.result, undefined)
  assert.deepEqual(incoming.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: source-outside-workspace.",
  })
})

test("fails incoming calls atomically when a previously discovered caller disappears", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-missing-caller-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const targetPath = path.join(workspace, "Target.ets")
  const callerPath = path.join(workspace, "Caller.ets")
  const targetText = "export function missingCallerTarget(): string { return 'target' }\n"
  fs.writeFileSync(targetPath, targetText, "utf8")
  fs.writeFileSync(callerPath, [
    "import { missingCallerTarget } from './Target'",
    "export function caller(): string { return missingCallerTarget() }",
    "",
  ].join("\n"), "utf8")
  const targetUri = pathToFileURL(targetPath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 120,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(120)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: targetUri,
        languageId: "arkts",
        version: 1,
        text: targetText,
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 121,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: targetUri },
      position: midpoint(exactTextRange(targetText, "missingCallerTarget")),
    },
  })
  const prepared = await server.response(121)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 122,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const first = await server.response(122)
  assert.equal(first.error, undefined, JSON.stringify(first.error))
  assert.equal(first.result.length, 1)

  fs.unlinkSync(callerPath)
  server.send({
    jsonrpc: "2.0",
    id: 123,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const missing = await server.response(123)
  assert.equal(missing.result, undefined)
  assert.deepEqual(missing.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: source-unavailable.",
  })
})

test("refreshes complete project membership before each incoming request", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-membership-refresh-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const targetPath = path.join(workspace, "Target.ets")
  const callerPath = path.join(workspace, "Caller.ets")
  const targetText = "export function refreshedTarget(): string { return 'target' }\n"
  const callerText = [
    "import { refreshedTarget } from './Target'",
    "export function lateCaller(): string { return refreshedTarget() }",
    "",
  ].join("\n")
  fs.writeFileSync(targetPath, targetText, "utf8")
  const targetUri = pathToFileURL(targetPath).href
  const callerUri = pathToFileURL(callerPath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 124,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(124)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: targetUri, languageId: "arkts", version: 1, text: targetText },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 125,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: targetUri },
      position: midpoint(exactTextRange(targetText, "refreshedTarget")),
    },
  })
  const prepared = await server.response(125)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 126,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const before = await server.response(126)
  assert.equal(before.error, undefined, JSON.stringify(before.error))
  assert.deepEqual(before.result, [])

  fs.writeFileSync(callerPath, callerText, "utf8")
  server.send({
    jsonrpc: "2.0",
    id: 127,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const after = await server.response(127)
  assert.equal(after.error, undefined, JSON.stringify(after.error))
  assert.deepEqual(after.result, [{
    from: {
      name: "lateCaller",
      kind: 12,
      uri: callerUri,
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: callerText.split("\n")[1].length },
      },
      selectionRange: exactTextRange(callerText, "lateCaller"),
      data: callHierarchyData(pathToFileURL(workspace).href),
    },
    fromRanges: exactTextRanges(callerText, "refreshedTarget").slice(1),
  }])
})

test("refreshes unchanged membership source contents before each incoming request", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-content-refresh-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const targetPath = path.join(workspace, "Target.ets")
  const callerPath = path.join(workspace, "ZCaller.ets")
  const targetText = "export function contentTarget(): string { return 'target' }\n"
  const firstCallerText = "export function changedCaller(): string { return 'none' }\n"
  const secondCallerText = [
    "import { contentTarget } from './Target'",
    "export function changedCaller(): string { return contentTarget() }",
    "",
  ].join("\n")
  fs.writeFileSync(targetPath, targetText, "utf8")
  fs.writeFileSync(callerPath, firstCallerText, "utf8")
  for (let index = 0; index < 256; index += 1) {
    fs.writeFileSync(
      path.join(workspace, `A${String(index).padStart(3, "0")}.ets`),
      "",
      "utf8",
    )
  }
  const targetUri = pathToFileURL(targetPath).href
  const callerUri = pathToFileURL(callerPath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 131,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(131)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: targetUri, languageId: "arkts", version: 1, text: targetText },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 132,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: targetUri },
      position: midpoint(exactTextRange(targetText, "contentTarget")),
    },
  })
  const prepared = await server.response(132)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 133,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const before = await server.response(133)
  assert.equal(before.error, undefined, JSON.stringify(before.error))
  assert.deepEqual(before.result, [])

  fs.writeFileSync(callerPath, secondCallerText, "utf8")
  server.send({
    jsonrpc: "2.0",
    id: 134,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const after = await server.response(134)
  assert.equal(after.error, undefined, JSON.stringify(after.error))
  assert.equal(after.result.length, 1)
  assert.equal(after.result[0].from.uri, callerUri)
  assert.equal(after.result[0].from.name, "changedCaller")
  assert.deepEqual(
    after.result[0].fromRanges,
    exactTextRanges(secondCallerText, "contentTarget").slice(1),
  )
})

test("fails incoming calls closed before loading an oversized workspace source", async (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-oversized-source-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const targetPath = path.join(workspace, "Target.ets")
  const callerPath = path.join(workspace, "OversizedCaller.ets")
  const targetText = "export function boundedTarget(): string { return 'target' }\n"
  const callerPrefix = [
    "import { boundedTarget } from './Target'",
    "export function oversizedCaller(): string { return boundedTarget() }",
    "//",
  ].join("\n")
  fs.writeFileSync(targetPath, targetText, "utf8")
  fs.writeFileSync(callerPath, callerPrefix + "x".repeat(4 * 1_024 * 1_024), "utf8")
  const targetUri = pathToFileURL(targetPath).href
  const server = new LspProcess()
  t.after(() => server.close())

  server.send({
    jsonrpc: "2.0",
    id: 128,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { general: { positionEncodings: ["utf-16"] } },
    },
  })
  await server.response(128)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: targetUri, languageId: "arkts", version: 1, text: targetText },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 129,
    method: "textDocument/prepareCallHierarchy",
    params: {
      textDocument: { uri: targetUri },
      position: midpoint(exactTextRange(targetText, "boundedTarget")),
    },
  })
  const prepared = await server.response(129)
  assert.equal(prepared.error, undefined, JSON.stringify(prepared.error))
  server.send({
    jsonrpc: "2.0",
    id: 130,
    method: "callHierarchy/incomingCalls",
    params: { item: prepared.result[0] },
  })
  const response = await server.response(130)
  assert.equal(response.result, undefined)
  assert.deepEqual(response.error, {
    code: -32803,
    message: "Call hierarchy result is incomplete: project-membership-incomplete.",
  })
})

test("preflights oversized and nonregular TypeScript host sources before reading", (t) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-call-hierarchy-host-source-cap-"))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const outputPath = path.join(workspace, "typescript-engine.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "types", "typescript-language-service.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: outputPath,
    logLevel: "silent",
  })
  const { TypeScriptLanguageServiceEngine } = require(outputPath)
  const rootPath = path.join(workspace, "root")
  fs.mkdirSync(rootPath)
  const targetPath = path.join(rootPath, "Target.ets")
  const oversizedPath = path.join(rootPath, "Oversized.ets")
  const directoryPath = path.join(rootPath, "Directory.ets")
  const targetText = "export function hostBoundedTarget(): string { return 'target' }\n"
  fs.writeFileSync(targetPath, targetText, "utf8")
  fs.writeFileSync(oversizedPath, "x".repeat(4 * 1_024 * 1_024 + 1), "utf8")
  fs.mkdirSync(directoryPath)
  const engine = new TypeScriptLanguageServiceEngine(rootPath)
  t.after(() => engine.dispose())
  engine.prepare({
    rootPath,
    documents: [{
      path: targetPath,
      content: targetText,
      documentVersion: 1,
      overlay: true,
    }],
    projectMembership: {
      paths: [targetPath, oversizedPath, directoryPath],
      status: "complete",
      revision: 1,
    },
    contentRevision: 0,
    state: {
      path: targetPath,
      contentGeneration: 1,
      documentVersion: 1,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: 1,
      syntaxReady: true,
    },
  })
  const position = {
    path: targetPath,
    line: 1,
    column: exactTextRange(targetText, "hostBoundedTarget").start.character + 2,
    documentVersion: 1,
    workspaceRoot: rootPath,
  }
  const originalReadFileSync = fs.readFileSync
  let forbiddenReads = 0
  fs.readFileSync = function patchedReadFileSync(filePath, ...args) {
    if (filePath === oversizedPath || filePath === directoryPath) forbiddenReads += 1
    return originalReadFileSync.call(this, filePath, ...args)
  }
  try {
    const prepared = engine.prepareCallHierarchy(position)
    assert.equal(prepared.status, "complete")
    assert.equal(prepared.items.length, 1)
    engine.incomingCalls(position, prepared.items[0])
  } finally {
    fs.readFileSync = originalReadFileSync
  }
  assert.equal(forbiddenReads, 0, "host must reject by stat/size before any full source read")
})

function callHierarchyData(rootUri) {
  return {
    arktsCallHierarchy: {
      protocol: 1,
      rootUri,
    },
  }
}

async function writeFillerSources(workspace, count) {
  const filesPerDirectory = 200
  const directories = Array.from(
    { length: Math.ceil(count / filesPerDirectory) },
    (_value, index) => path.join(workspace, `fillers-${String(index).padStart(3, "0")}`),
  )
  await Promise.all(directories.map((directory) => fs.promises.mkdir(directory)))
  for (let start = 0; start < count; start += 500) {
    const end = Math.min(count, start + 500)
    await Promise.all(Array.from({ length: end - start }, (_value, offset) => {
      const index = start + offset
      const directory = directories[Math.floor(index / filesPerDirectory)]
      return fs.promises.writeFile(
        path.join(directory, `F${String(index).padStart(5, "0")}.ets`),
        "",
        "utf8",
      )
    }))
  }
}

function semanticCallHierarchyItem(fileName, name) {
  const range = protocolRange(0)
  return {
    uri: pathToFileURL(path.join(fixtureRoot, fileName)).href,
    name,
    kind: "function",
    range,
    selectionRange: range,
  }
}

function protocolRange(line) {
  return {
    start: { line, character: 0 },
    end: { line, character: 1 },
  }
}

function assertCallHierarchyLimit(action) {
  assert.throws(action, (error) => {
    assert.equal(error.code, -32803)
    assert.equal(
      error.message,
      "Call hierarchy result is incomplete: result-limit-exceeded.",
    )
    return true
  })
}

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
