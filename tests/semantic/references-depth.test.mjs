import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "references-depth")
const apiPath = path.join(fixtureRoot, "Api.ets")
const consumerPath = path.join(fixtureRoot, "Consumer.ets")
const originPath = path.join(fixtureRoot, "model", "Profile.ets")
const apiUri = pathToFileURL(apiPath).href
const consumerUri = pathToFileURL(consumerPath).href
const originUri = pathToFileURL(originPath).href
const apiText = fs.readFileSync(apiPath, "utf8")
const consumerText = fs.readFileSync(consumerPath, "utf8")
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
