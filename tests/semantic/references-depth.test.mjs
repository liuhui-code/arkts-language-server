import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "references-depth")
const apiPath = path.join(fixtureRoot, "Api.ets")
const consumerPath = path.join(fixtureRoot, "Consumer.ets")
const consumerOverlayPath = path.join(fixtureRoot, "Consumer.v2.overlay")
const originPath = path.join(fixtureRoot, "model", "Profile.ets")
const apiUri = pathToFileURL(apiPath).href
const consumerUri = pathToFileURL(consumerPath).href
const originUri = pathToFileURL(originPath).href
const apiText = fs.readFileSync(apiPath, "utf8")
const consumerText = fs.readFileSync(consumerPath, "utf8")
const consumerOverlayText = fs.readFileSync(consumerOverlayPath, "utf8")
const originText = fs.readFileSync(originPath, "utf8")

test("finds unopened barrel references with exact UTF-16 ranges and declaration policy", async (t) => {
  const server = new LspProcess()
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
  const initialized = await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: consumerUri,
        languageId: "arkts",
        version: 1,
        text: consumerText,
      },
    },
  })

  const queryRange = utf16RangeOf(consumerText, "Profile", 1)
  assert.equal(
    queryRange.start.character - codePointColumnAt(consumerText, queryRange.start),
    1,
    "the references query must exercise an emoji-derived UTF-16 column",
  )

  const withoutDeclaration = await requestReferences(server, 2, queryRange.start, false)
  const withoutDeclarationAgain = await requestReferences(server, 3, queryRange.start, false)
  const withDeclaration = await requestReferences(server, 4, queryRange.start, true)
  const withDeclarationAgain = await requestReferences(server, 5, queryRange.start, true)

  assert.deepEqual({
    advertised: initialized.result.capabilities.referencesProvider,
    withoutDeclarationError: withoutDeclaration.error ?? null,
    withDeclarationError: withDeclaration.error ?? null,
  }, {
    advertised: true,
    withoutDeclarationError: null,
    withDeclarationError: null,
  })

  const expectedUsages = [
    location(apiUri, utf16RangeOf(apiText, "Profile", 0)),
    location(consumerUri, utf16RangeOf(consumerText, "Profile", 0)),
    location(consumerUri, utf16RangeOf(consumerText, "Profile", 1)),
    location(consumerUri, utf16RangeOf(consumerText, "Profile", 2)),
    location(consumerUri, utf16RangeOf(consumerText, "Profile", 3)),
  ]
  const expectedWithDeclaration = [
    ...expectedUsages,
    location(originUri, utf16RangeOf(originText, "Profile", 0)),
  ]

  assert.deepEqual(withoutDeclaration.result, expectedUsages)
  assert.deepEqual(withoutDeclarationAgain.result, expectedUsages)
  assert.deepEqual(withDeclaration.result, expectedWithDeclaration)
  assert.deepEqual(withDeclarationAgain.result, expectedWithDeclaration)
  assert.deepEqual(withoutDeclaration.result, sortedLocations(withoutDeclaration.result))
  assert.deepEqual(withDeclaration.result, sortedLocations(withDeclaration.result))
  assertUniqueNonEmptyLocations(withDeclaration.result)

  const addedForDeclaration = withDeclaration.result.filter((candidate) => (
    !withoutDeclaration.result.some((usage) => locationKey(usage) === locationKey(candidate))
  ))
  assert.deepEqual(addedForDeclaration, [
    location(originUri, utf16RangeOf(originText, "Profile", 0)),
  ])

  const shadowRanges = [
    utf16RangeOf(consumerText, "Profile", 4),
    utf16RangeOf(consumerText, "Profile", 5),
  ].map((range) => locationKey(location(consumerUri, range)))
  assert.ok(withDeclaration.result.every((candidate) => !shadowRanges.includes(locationKey(candidate))))
})

test("uses only changed overlay references for both declaration policies", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
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
  const initialized = await server.response(10)
  assert.equal(initialized.result.capabilities.referencesProvider, true)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: consumerUri,
        languageId: "arkts",
        version: 1,
        text: consumerText,
      },
    },
  })

  const diskQueryRange = utf16RangeOf(consumerText, "Profile", 1)
  const diskReferences = await requestReferences(server, 11, diskQueryRange.start, false)
  assert.equal(diskReferences.error, undefined, JSON.stringify(diskReferences.error))
  const staleDiskLocations = [
    location(consumerUri, utf16RangeOf(consumerText, "Profile", 2)),
    location(consumerUri, utf16RangeOf(consumerText, "Profile", 3)),
  ]
  for (const stale of staleDiskLocations) {
    assert.ok(
      diskReferences.result.some((candidate) => locationKey(candidate) === locationKey(stale)),
      "v1 must populate the TypeScript Program with each soon-to-be-deleted disk reference",
    )
  }

  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: consumerUri, version: 2 },
      contentChanges: [{ text: consumerOverlayText }],
    },
  })

  const overlayQueryRange = utf16RangeOf(consumerOverlayText, "Profile", 1)
  const addedEmojiRange = utf16RangeOf(consumerOverlayText, "Profile", 3)
  assert.equal(
    addedEmojiRange.start.character
      - codePointColumnAt(consumerOverlayText, addedEmojiRange.start),
    1,
    "the added v2 reference must retain its emoji-derived UTF-16 column",
  )
  const withoutDeclaration = await requestReferences(
    server,
    12,
    overlayQueryRange.start,
    false,
  )
  const withDeclaration = await requestReferences(
    server,
    13,
    overlayQueryRange.start,
    true,
  )
  assert.equal(withoutDeclaration.error, undefined, JSON.stringify(withoutDeclaration.error))
  assert.equal(withDeclaration.error, undefined, JSON.stringify(withDeclaration.error))

  const expectedOverlayUsages = [
    location(apiUri, utf16RangeOf(apiText, "Profile", 0)),
    location(consumerUri, utf16RangeOf(consumerOverlayText, "Profile", 0)),
    location(consumerUri, utf16RangeOf(consumerOverlayText, "Profile", 1)),
    location(consumerUri, utf16RangeOf(consumerOverlayText, "Profile", 2)),
    location(consumerUri, addedEmojiRange),
  ]
  const expectedWithDeclaration = [
    ...expectedOverlayUsages,
    location(originUri, utf16RangeOf(originText, "Profile", 0)),
  ]
  assert.deepEqual(withoutDeclaration.result, expectedOverlayUsages)
  assert.deepEqual(withDeclaration.result, expectedWithDeclaration)
  assertUniqueNonEmptyLocations(withDeclaration.result)

  const staleDiskKeys = new Set(staleDiskLocations.map(locationKey))
  assert.ok(
    withDeclaration.result.every((candidate) => !staleDiskKeys.has(locationKey(candidate))),
    "v2 results must not retain either deleted v1 disk range",
  )
  for (const candidate of withDeclaration.result.filter(({ uri }) => uri === consumerUri)) {
    assert.equal(
      textInRange(consumerOverlayText, candidate.range),
      "Profile",
      "every consumer result must address authoritative v2 overlay text",
    )
  }

  const addedOverlayKeys = [
    utf16RangeOf(consumerOverlayText, "Profile", 2),
    addedEmojiRange,
  ].map((range) => locationKey(location(consumerUri, range)))
  assert.ok(addedOverlayKeys.every((key) => (
    !diskReferences.result.some((candidate) => locationKey(candidate) === key)
  )), "both v2 ranges must be absent from the populated v1 Program")
  assert.ok(addedOverlayKeys.every((key) => (
    withDeclaration.result.some((candidate) => locationKey(candidate) === key)
  )))

  const shadowKeys = [
    utf16RangeOf(consumerOverlayText, "Profile", 4),
    utf16RangeOf(consumerOverlayText, "Profile", 5),
  ].map((range) => locationKey(location(consumerUri, range)))
  assert.ok(withDeclaration.result.every((candidate) => !shadowKeys.includes(locationKey(candidate))))
})

async function requestReferences(server, id, position, includeDeclaration) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/references",
    params: {
      textDocument: { uri: consumerUri },
      position,
      context: { includeDeclaration },
    },
  })
  return server.response(id)
}

function location(uri, range) {
  return { uri, range }
}

function utf16RangeOf(source, token, occurrence) {
  let offset = -1
  for (let index = 0; index <= occurrence; index += 1) {
    offset = source.indexOf(token, offset + 1)
    assert.notEqual(offset, -1, `missing ${token} occurrence ${occurrence}`)
  }
  return {
    start: utf16PositionAt(source, offset),
    end: utf16PositionAt(source, offset + token.length),
  }
}

function utf16PositionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  const lineStart = prefix.lastIndexOf("\n") + 1
  return { line, character: prefix.slice(lineStart).length }
}

function codePointColumnAt(source, position) {
  return Array.from(source.split("\n")[position.line].slice(0, position.character)).length
}

function textInRange(source, range) {
  assert.equal(range.start.line, range.end.line, "reference range must be single-line")
  return source
    .split("\n")[range.start.line]
    .slice(range.start.character, range.end.character)
}

function sortedLocations(locations) {
  return [...locations].sort((left, right) => (
    left.uri.localeCompare(right.uri)
      || left.range.start.line - right.range.start.line
      || left.range.start.character - right.range.start.character
      || left.range.end.line - right.range.end.line
      || left.range.end.character - right.range.end.character
  ))
}

function locationKey(candidate) {
  const { uri, range } = candidate
  return [
    uri,
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  ].join(":")
}

function assertUniqueNonEmptyLocations(locations) {
  assert.equal(new Set(locations.map(locationKey)).size, locations.length)
  for (const { range } of locations) {
    assert.notDeepEqual(range.start, range.end, "reference ranges must be non-empty")
  }
}
