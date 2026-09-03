import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "references-completeness")
const consumerPath = path.join(fixtureRoot, "Consumer.ets")
const formatterPath = path.join(fixtureRoot, "lib", "Formatter.ets")
const consumerUri = pathToFileURL(consumerPath).href
const formatterUri = pathToFileURL(formatterPath).href
const consumerText = fs.readFileSync(consumerPath, "utf8")
const formatterText = fs.readFileSync(formatterPath, "utf8")

test("classifies every overload declaration without losing stable usage references", async (t) => {
  const server = await openConsumer(t)
  const queryRange = utf16RangeOf(consumerText, "renderChoice", 1)
  assert.equal(
    queryRange.start.character - codePointColumnAt(consumerText, queryRange.start),
    1,
    "the query must exercise an emoji-derived UTF-16 column",
  )

  const withoutDeclaration = await requestReferences(server, 2, queryRange.start, false)
  const withoutDeclarationAgain = await requestReferences(server, 3, queryRange.start, false)
  const withDeclaration = await requestReferences(server, 4, queryRange.start, true)
  const withDeclarationAgain = await requestReferences(server, 5, queryRange.start, true)

  assert.equal(withoutDeclaration.error, undefined, JSON.stringify(withoutDeclaration.error))
  assert.equal(withDeclaration.error, undefined, JSON.stringify(withDeclaration.error))

  const usages = [
    location(consumerUri, utf16RangeOf(consumerText, "renderChoice", 0)),
    location(consumerUri, utf16RangeOf(consumerText, "renderChoice", 1)),
    location(consumerUri, utf16RangeOf(consumerText, "renderChoice", 2)),
  ]
  const declarations = [0, 1, 2].map((occurrence) => (
    location(formatterUri, utf16RangeOf(formatterText, "renderChoice", occurrence))
  ))
  const expectedWithoutDeclaration = sortedLocations(usages)
  const expectedWithDeclaration = sortedLocations([...usages, ...declarations])

  assert.deepEqual(withoutDeclaration.result, expectedWithoutDeclaration)
  assert.deepEqual(withoutDeclarationAgain.result, expectedWithoutDeclaration)
  assert.deepEqual(withDeclaration.result, expectedWithDeclaration)
  assert.deepEqual(withDeclarationAgain.result, expectedWithDeclaration)
  assertUniqueNonEmptyLocations(withDeclaration.result)

  const addedForDeclaration = withDeclaration.result.filter((candidate) => (
    !withoutDeclaration.result.some((usage) => locationKey(usage) === locationKey(candidate))
  ))
  assert.deepEqual(addedForDeclaration, sortedLocations(declarations))
})

async function openConsumer(t) {
  const server = new LspProcess()
  t.after(async () => server.close())
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
  return server
}

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

function location(uri, range) {
  return { uri, range }
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
