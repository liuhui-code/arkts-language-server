import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"
import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "rename-completeness")

test("renaming a barrel exported name preserves the origin and updates every public consumer", async (t) => {
  const scenarioRoot = path.join(fixtureRoot, "barrel-public")
  const origin = fixtureDocument(scenarioRoot, "model/Profile.ets")
  const barrel = fixtureDocument(scenarioRoot, "model/index.ets")
  const consumer = fixtureDocument(scenarioRoot, "Consumer.ets")
  const otherConsumer = fixtureDocument(scenarioRoot, "OtherConsumer.ets")
  const { server } = await openDocument(t, {
    scenarioRoot,
    document: barrel,
    version: 7,
  })

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/rename",
    params: {
      textDocument: { uri: barrel.uri },
      position: midpoint(utf16RangeOf(barrel.text, "Profile")),
      newName: "Account",
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.changes, undefined)
  const expectedChanges = [
    {
      textDocument: { uri: barrel.uri, version: 7 },
      edits: [{
        range: utf16RangeOf(barrel.text, "Profile"),
        newText: "Profile as Account",
      }],
    },
    {
      textDocument: { uri: consumer.uri, version: null },
      edits: [
        { range: utf16RangeOf(consumer.text, "Profile", { occurrence: 1 }), newText: "Account" },
        { range: utf16RangeOf(consumer.text, "Profile", { occurrence: 2 }), newText: "Account" },
        { range: utf16RangeOf(consumer.text, "Profile", { occurrence: 3 }), newText: "Account" },
      ],
    },
    {
      textDocument: { uri: otherConsumer.uri, version: null },
      edits: [
        { range: utf16RangeOf(otherConsumer.text, "Profile", { occurrence: 1 }), newText: "Account" },
        { range: utf16RangeOf(otherConsumer.text, "Profile", { occurrence: 2 }), newText: "Account" },
      ],
    },
  ].sort((left, right) => left.textDocument.uri.localeCompare(right.textDocument.uri))
  assert.deepEqual(response.result.documentChanges, expectedChanges)

  const sourceDocuments = new Map([
    [origin.uri, origin.text],
    [barrel.uri, barrel.text],
    [consumer.uri, consumer.text],
    [otherConsumer.uri, otherConsumer.text],
  ])
  const updated = applyWorkspaceEdit(sourceDocuments, response.result, {
    documentVersions: new Map([
      [origin.uri, null],
      [barrel.uri, 7],
      [consumer.uri, null],
      [otherConsumer.uri, null],
    ]),
  })
  assert.equal(updated.get(origin.uri), origin.text, "the origin declaration must stay stable")
  assert.equal(updated.get(barrel.uri), 'export { Profile as Account } from "./Profile"\n')
  assert.equal(updated.get(consumer.uri), [
    'import { Account } from "./model"',
    "",
    "export function renderValue(value: Account): Account {",
    "  return value",
    "}",
    "",
  ].join("\n"))
  assert.equal(updated.get(otherConsumer.uri), [
    'import { Account } from "./model"',
    "",
    "export const fallbackValue = {} as Account",
    "",
  ].join("\n"))
})

test("renaming an explicit barrel alias changes only the public alias layer", async (t) => {
  const scenarioRoot = path.join(fixtureRoot, "alias-layers")
  const origin = fixtureDocument(scenarioRoot, "model/Profile.ets")
  const barrel = fixtureDocument(scenarioRoot, "model/index.ets")
  const aliasedConsumer = fixtureDocument(scenarioRoot, "AliasedConsumer.ets")
  const publicConsumer = fixtureDocument(scenarioRoot, "PublicConsumer.ets")
  const { server } = await openDocument(t, {
    scenarioRoot,
    document: barrel,
    version: 11,
  })

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/rename",
    params: {
      textDocument: { uri: barrel.uri },
      position: midpoint(utf16RangeOf(barrel.text, "PublicProfile")),
      newName: "Account",
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.changes, undefined)
  const expectedChanges = [
    {
      textDocument: { uri: barrel.uri, version: 11 },
      edits: [{ range: utf16RangeOf(barrel.text, "PublicProfile"), newText: "Account" }],
    },
    {
      textDocument: { uri: aliasedConsumer.uri, version: null },
      edits: [{
        range: utf16RangeOf(aliasedConsumer.text, "PublicProfile"),
        newText: "Account",
      }],
    },
    {
      textDocument: { uri: publicConsumer.uri, version: null },
      edits: [
        { range: utf16RangeOf(publicConsumer.text, "PublicProfile", { occurrence: 1 }), newText: "Account" },
        { range: utf16RangeOf(publicConsumer.text, "PublicProfile", { occurrence: 2 }), newText: "Account" },
        { range: utf16RangeOf(publicConsumer.text, "PublicProfile", { occurrence: 3 }), newText: "Account" },
      ],
    },
  ].sort((left, right) => left.textDocument.uri.localeCompare(right.textDocument.uri))
  assert.deepEqual(response.result.documentChanges, expectedChanges)

  const updated = applyWorkspaceEdit(new Map([
    [origin.uri, origin.text],
    [barrel.uri, barrel.text],
    [aliasedConsumer.uri, aliasedConsumer.text],
    [publicConsumer.uri, publicConsumer.text],
  ]), response.result, {
    documentVersions: new Map([
      [origin.uri, null],
      [barrel.uri, 11],
      [aliasedConsumer.uri, null],
      [publicConsumer.uri, null],
    ]),
  })
  assert.equal(updated.get(origin.uri), origin.text, "the origin name must stay stable")
  assert.equal(
    updated.get(barrel.uri),
    'export { Profile as Account } from "./Profile"\n',
  )
  assert.equal(updated.get(aliasedConsumer.uri), [
    'import { Account as UserProfile } from "./model"',
    "",
    "export function displayUser(value: UserProfile): UserProfile {",
    "  return value",
    "}",
    "",
  ].join("\n"), "the consumer-local alias must stay stable")
  assert.equal(updated.get(publicConsumer.uri), [
    'import { Account } from "./model"',
    "",
    "export function displayPublic(value: Account): Account {",
    "  return value",
    "}",
    "",
  ].join("\n"))
})

test("renaming an explicit consumer alias changes only that local alias layer", async (t) => {
  const scenarioRoot = path.join(fixtureRoot, "alias-layers")
  const origin = fixtureDocument(scenarioRoot, "model/Profile.ets")
  const barrel = fixtureDocument(scenarioRoot, "model/index.ets")
  const aliasedConsumer = fixtureDocument(scenarioRoot, "AliasedConsumer.ets")
  const publicConsumer = fixtureDocument(scenarioRoot, "PublicConsumer.ets")
  const targetRange = utf16RangeOf(aliasedConsumer.text, "UserProfile", { occurrence: 2 })
  const { server } = await openDocument(t, {
    scenarioRoot,
    document: aliasedConsumer,
    version: 13,
  })

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/rename",
    params: {
      textDocument: { uri: aliasedConsumer.uri },
      position: midpoint(targetRange),
      newName: "Account",
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.changes, undefined)
  assert.deepEqual(response.result.documentChanges, [{
    textDocument: { uri: aliasedConsumer.uri, version: 13 },
    edits: [
      { range: utf16RangeOf(aliasedConsumer.text, "UserProfile", { occurrence: 1 }), newText: "Account" },
      { range: targetRange, newText: "Account" },
      { range: utf16RangeOf(aliasedConsumer.text, "UserProfile", { occurrence: 3 }), newText: "Account" },
    ],
  }])

  const updated = applyWorkspaceEdit(new Map([
    [origin.uri, origin.text],
    [barrel.uri, barrel.text],
    [aliasedConsumer.uri, aliasedConsumer.text],
    [publicConsumer.uri, publicConsumer.text],
  ]), response.result, {
    documentVersions: new Map([
      [origin.uri, null],
      [barrel.uri, null],
      [aliasedConsumer.uri, 13],
      [publicConsumer.uri, null],
    ]),
  })
  assert.equal(updated.get(origin.uri), origin.text)
  assert.equal(updated.get(barrel.uri), barrel.text, "the public alias must stay stable")
  assert.equal(updated.get(publicConsumer.uri), publicConsumer.text)
  assert.equal(updated.get(aliasedConsumer.uri), [
    'import { PublicProfile as Account } from "./model"',
    "",
    "export function displayUser(value: Account): Account {",
    "  return value",
    "}",
    "",
  ].join("\n"))
})

test("rejects an invalid rename name with fixed InvalidParams and no edit", async (t) => {
  const scenarioRoot = path.join(fixtureRoot, "alias-layers")
  const aliasedConsumer = fixtureDocument(scenarioRoot, "AliasedConsumer.ets")
  const { server } = await openDocument(t, {
    scenarioRoot,
    document: aliasedConsumer,
    version: 17,
  })

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/rename",
    params: {
      textDocument: { uri: aliasedConsumer.uri },
      position: midpoint(utf16RangeOf(aliasedConsumer.text, "UserProfile", { occurrence: 2 })),
      newName: "not valid",
    },
  })

  const response = await server.response(2)
  assert.equal(response.result, undefined, "invalid names must not leak a WorkspaceEdit")
  assert.deepEqual(response.error, {
    code: -32602,
    message: "Rename requires a valid identifier.",
  })
})

test("atomically rejects rename when TypeScript reports an out-of-workspace location", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-rename-outside-"))
  const scenarioRoot = path.join(temporaryRoot, "workspace")
  const outsideRoot = path.join(temporaryRoot, "outside")
  fs.mkdirSync(scenarioRoot)
  fs.mkdirSync(outsideRoot)
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))

  const documentPath = path.join(scenarioRoot, "Consumer.ets")
  const outsidePath = path.join(outsideRoot, "External.ets")
  const text = [
    'import { ExternalProfile } from "../outside/External"',
    "",
    "export const externalValue = {} as ExternalProfile",
    "",
  ].join("\n")
  const outsideText = "export class ExternalProfile {}\n"
  fs.writeFileSync(documentPath, text, "utf8")
  fs.writeFileSync(outsidePath, outsideText, "utf8")
  const document = { uri: pathToFileURL(outsidePath).href, text: outsideText }
  const { server } = await openDocument(t, {
    scenarioRoot,
    document,
    version: 19,
  })

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/rename",
    params: {
      textDocument: { uri: document.uri },
      position: midpoint(utf16RangeOf(outsideText, "ExternalProfile")),
      newName: "Account",
    },
  })

  const response = await server.response(2)
  assert.equal(response.result, undefined, "unsafe rename must not return a partial edit")
  assert.deepEqual(response.error, {
    code: -32803,
    message: "Rename is not available at this position.",
  })
  assert.equal(fs.readFileSync(documentPath, "utf8"), text)
  assert.equal(fs.readFileSync(outsidePath, "utf8"), outsideText)
})

function fixtureDocument(scenarioRoot, relativePath) {
  const filePath = path.join(scenarioRoot, relativePath)
  return {
    uri: pathToFileURL(filePath).href,
    text: fs.readFileSync(filePath, "utf8"),
  }
}

async function openDocument(t, { scenarioRoot, document, version }) {
  const server = new LspProcess()
  t.after(async () => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(scenarioRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        workspace: {
          workspaceEdit: {
            documentChanges: true,
            failureHandling: "transactional",
          },
        },
        textDocument: { rename: { prepareSupport: true } },
      },
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
        uri: document.uri,
        languageId: "arkts",
        version,
        text: document.text,
      },
    },
  })
  return { server }
}

function utf16RangeOf(text, needle, { occurrence = 1 } = {}) {
  let offset = -1
  for (let index = 0; index < occurrence; index += 1) {
    offset = text.indexOf(needle, offset + 1)
  }
  assert.notEqual(offset, -1, `Expected occurrence ${occurrence} of ${needle}`)
  return {
    start: positionAt(text, offset),
    end: positionAt(text, offset + needle.length),
  }
}

function positionAt(text, offset) {
  const prefix = text.slice(0, offset)
  const lines = prefix.split("\n")
  return { line: lines.length - 1, character: lines.at(-1).length }
}

function midpoint(range) {
  return {
    line: range.start.line,
    character: range.start.character + 1,
  }
}
