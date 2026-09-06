import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
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
const largeFixtureRoot = path.join(fixtureRoot, "large-project")
const partialFixtureRoot = path.join(fixtureRoot, "partial-project")

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

test("finds unopened rewritten struct references beyond resident and lazy windows", async (t) => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-large-"))
  const consumerName = "A000Consumer.ets"
  const remoteName = "YRemoteUse.ets"
  const targetName = "ZRemoteProfile.ets"
  const consumerPath = path.join(workspaceRoot, consumerName)
  const remotePath = path.join(workspaceRoot, remoteName)
  const targetPath = path.join(workspaceRoot, targetName)
  const fixtureNames = [consumerName, remoteName, targetName]
  await Promise.all(fixtureNames.map((name) => (
    fs.promises.copyFile(path.join(largeFixtureRoot, name), path.join(workspaceRoot, name))
  )))

  const fillerPaths = Array.from({ length: 400 }, (_, index) => (
    path.join(workspaceRoot, `M${String(index).padStart(3, "0")}Filler.ets`)
  ))
  await Promise.all(fillerPaths.map((filePath, index) => (
    fs.promises.writeFile(filePath, `const filler${index} = ${index}\n`, "utf8")
  )))

  const sortedPaths = [consumerPath, remotePath, targetPath, ...fillerPaths].sort()
  const firstPathPastBothWindows = 256 + 128
  assert.equal(sortedPaths.length, 403)
  assert.ok(
    sortedPaths.indexOf(remotePath) >= firstPathPastBothWindows,
    "the unopened usage must follow both the 256 resident and 128 lazy windows",
  )
  assert.ok(
    sortedPaths.indexOf(targetPath) >= firstPathPastBothWindows,
    "the unopened declaration must follow both the 256 resident and 128 lazy windows",
  )

  const consumerText = fs.readFileSync(consumerPath, "utf8")
  const remoteText = fs.readFileSync(remotePath, "utf8")
  const targetText = fs.readFileSync(targetPath, "utf8")
  const consumerUri = pathToFileURL(consumerPath).href
  const remoteUri = pathToFileURL(remotePath).href
  const targetUri = pathToFileURL(targetPath).href
  const queryRange = utf16RangeOf(consumerText, "RemoteProfile", 0)
  for (const [source, range] of [
    [consumerText, queryRange],
    [remoteText, utf16RangeOf(remoteText, "RemoteProfile", 0)],
    [targetText, utf16RangeOf(targetText, "RemoteProfile", 0)],
  ]) {
    assert.equal(
      range.start.character - codePointColumnAt(source, range.start),
      1,
      "every expected range must exercise an emoji-derived UTF-16 column",
    )
  }

  const server = new LspProcess()
  t.after(async () => {
    try {
      await server.close()
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true })
    }
  })
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspaceRoot).href,
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

  const withoutDeclaration = await requestReferencesAt(
    server,
    2,
    consumerUri,
    queryRange.start,
    false,
    20_000,
  )
  const withoutDeclarationAgain = await requestReferencesAt(
    server,
    3,
    consumerUri,
    queryRange.start,
    false,
    20_000,
  )
  const withDeclaration = await requestReferencesAt(
    server,
    4,
    consumerUri,
    queryRange.start,
    true,
    20_000,
  )
  const withDeclarationAgain = await requestReferencesAt(
    server,
    5,
    consumerUri,
    queryRange.start,
    true,
    20_000,
  )

  assert.equal(withoutDeclaration.error, undefined, JSON.stringify(withoutDeclaration.error))
  assert.equal(withDeclaration.error, undefined, JSON.stringify(withDeclaration.error))
  const usages = sortedLocations([
    location(consumerUri, queryRange),
    location(remoteUri, utf16RangeOf(remoteText, "RemoteProfile", 0)),
  ])
  const declaration = location(targetUri, utf16RangeOf(targetText, "RemoteProfile", 0))
  const allReferences = sortedLocations([...usages, declaration])

  assert.deepEqual(withoutDeclaration.result, usages)
  assert.deepEqual(withoutDeclarationAgain.result, usages)
  assert.deepEqual(withDeclaration.result, allReferences)
  assert.deepEqual(withDeclarationAgain.result, allReferences)
  assertUniqueNonEmptyLocations(withDeclaration.result)
})

test("fails references closed when public workspace membership is partial", async (t) => {
  const workspaceRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arkts-references-partial-"))
  const consumerPath = path.join(workspaceRoot, "PartialConsumer.ets")
  await fs.promises.copyFile(
    path.join(partialFixtureRoot, "PartialConsumer.ets"),
    consumerPath,
  )
  await writeFillerSources(workspaceRoot, 20_000)

  const consumerText = fs.readFileSync(consumerPath, "utf8")
  const consumerUri = pathToFileURL(consumerPath).href
  const queryRange = utf16RangeOf(consumerText, "localReferenceTarget", 1)
  assert.equal(
    queryRange.start.character - codePointColumnAt(consumerText, queryRange.start),
    1,
    "the partial-membership query must exercise an emoji-derived UTF-16 column",
  )

  const server = new LspProcess()
  t.after(async () => {
    try {
      await server.close()
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true })
    }
  })
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(workspaceRoot).href,
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

  const expectedError = {
    code: -32803,
    message: "References require a complete workspace snapshot",
  }
  const first = await requestReferencesAt(
    server,
    2,
    consumerUri,
    queryRange.start,
    false,
    30_000,
  )
  const repeated = await requestReferencesAt(
    server,
    3,
    consumerUri,
    queryRange.start,
    true,
    30_000,
  )

  assert.deepEqual(first, { jsonrpc: "2.0", id: 2, error: expectedError })
  assert.deepEqual(repeated, { jsonrpc: "2.0", id: 3, error: expectedError })
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
  return requestReferencesAt(server, id, consumerUri, position, includeDeclaration)
}

async function requestReferencesAt(
  server,
  id,
  documentUri,
  position,
  includeDeclaration,
  timeoutMs = 5_000,
) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/references",
    params: {
      textDocument: { uri: documentUri },
      position,
      context: { includeDeclaration },
    },
  })
  return server.response(id, timeoutMs)
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

async function writeFillerSources(workspaceRoot, count) {
  const filesPerDirectory = 200
  const directoryCount = Math.ceil(count / filesPerDirectory)
  const directories = Array.from({ length: directoryCount }, (_, index) => (
    path.join(workspaceRoot, `fillers-${String(index).padStart(3, "0")}`)
  ))
  await Promise.all(directories.map((directory) => fs.promises.mkdir(directory)))

  const batchSize = 500
  for (let start = 0; start < count; start += batchSize) {
    const end = Math.min(count, start + batchSize)
    await Promise.all(Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset
      const directory = directories[Math.floor(index / filesPerDirectory)]
      const fileName = `F${String(index).padStart(5, "0")}.ets`
      return fs.promises.writeFile(path.join(directory, fileName), "", "utf8")
    }))
  }
}
