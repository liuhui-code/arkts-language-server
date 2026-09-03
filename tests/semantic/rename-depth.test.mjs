import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"
import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "rename-depth")

test("prepareRename returns the source alias range and placeholder after an emoji", async (t) => {
  const { server, documentUri, text } = await openFixture(t, "ConsumerAlias.ets")
  const targetRange = utf16RangeOf(text, "UserProfile", { occurrence: 2 })
  const targetLine = text.split("\n")[targetRange.start.line]
  const prefix = targetLine.slice(0, targetRange.start.character)
  assert.match(prefix, /😀/)
  assert.equal(
    prefix.length - Array.from(prefix).length,
    1,
    "the alias reference must follow a non-BMP UTF-16 character",
  )

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/prepareRename",
    params: {
      textDocument: { uri: documentUri },
      position: midpoint(targetRange),
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, {
    range: targetRange,
    placeholder: "UserProfile",
  })
})

test("prepareRename rejects a non-symbol with a fixed RequestFailed error", async (t) => {
  const { server, documentUri, text } = await openFixture(t, "ConsumerAlias.ets")
  const nonTarget = utf16RangeOf(text, "unknown")

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/prepareRename",
    params: {
      textDocument: { uri: documentUri },
      position: midpoint(nonTarget),
    },
  })

  const response = await server.response(2)
  assert.deepEqual(response.error, {
    code: -32803,
    message: "Rename is not available at this position.",
  })
})

test("rename preserves an unaliased import's exported name with versioned local edits", async (t) => {
  const { server, documentUri, text } = await openFixture(t, "ConsumerUnaliased.ets")
  const importedRange = utf16RangeOf(text, "Profile", { occurrence: 1 })
  const targetRange = utf16RangeOf(text, "Profile", { occurrence: 2 })

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/rename",
    params: {
      textDocument: { uri: documentUri },
      position: midpoint(targetRange),
      newName: "Account",
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.changes, undefined)
  assert.deepEqual(response.result.documentChanges, [{
    textDocument: { uri: documentUri, version: 1 },
    edits: [
      { range: importedRange, newText: "Profile as Account" },
      { range: targetRange, newText: "Account" },
    ],
  }])

  const updated = applyWorkspaceEdit(
    new Map([[documentUri, text]]),
    response.result,
    { documentVersions: new Map([[documentUri, 1]]) },
  )
  assert.equal(updated.get(documentUri), [
    'import { Profile as Account } from "./models"',
    "",
    'const profileValue = "😀" as unknown as Account',
  ].join("\n"))
})

test("rename preserves the barrel API while changing the origin declaration", async (t) => {
  const originPath = path.join(fixtureRoot, "models", "Profile.ets")
  const barrelPath = path.join(fixtureRoot, "models", "index.ets")
  const consumerPath = path.join(fixtureRoot, "ConsumerUnaliased.ets")
  const originUri = pathToFileURL(originPath).href
  const barrelUri = pathToFileURL(barrelPath).href
  const consumerUri = pathToFileURL(consumerPath).href
  const origin = fs.readFileSync(originPath, "utf8")
  const barrel = fs.readFileSync(barrelPath, "utf8")
  const consumer = fs.readFileSync(consumerPath, "utf8")
  const targetRange = utf16RangeOf(origin, "Profile")
  const { server } = await openDocument(t, {
    documentUri: originUri,
    text: origin,
    version: 3,
  })

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/rename",
    params: {
      textDocument: { uri: originUri },
      position: midpoint(targetRange),
      newName: "Account",
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.changes, undefined)
  const expectedChanges = [
    {
      textDocument: { uri: originUri, version: 3 },
      edits: [{ range: targetRange, newText: "Account" }],
    },
    {
      textDocument: { uri: barrelUri, version: null },
      edits: [{
        range: utf16RangeOf(barrel, "Profile", { occurrence: 1 }),
        newText: "Account as Profile",
      }],
    },
  ].sort((left, right) => left.textDocument.uri.localeCompare(right.textDocument.uri))
  assert.deepEqual(response.result.documentChanges, expectedChanges)

  const updated = applyWorkspaceEdit(
    new Map([
      [originUri, origin],
      [barrelUri, barrel],
      [consumerUri, consumer],
    ]),
    response.result,
    {
      documentVersions: new Map([
        [originUri, 3],
        [barrelUri, null],
        [consumerUri, null],
      ]),
    },
  )
  assert.equal(updated.get(originUri), origin.replace("Profile", "Account"))
  assert.equal(
    updated.get(barrelUri),
    'export { Account as Profile } from "./Profile"\n',
  )
  assert.equal(updated.get(consumerUri), consumer, "the public barrel name must stay stable")
})

async function openFixture(t, fileName) {
  const documentPath = path.join(fixtureRoot, fileName)
  return openDocument(t, {
    documentUri: pathToFileURL(documentPath).href,
    text: fs.readFileSync(documentPath, "utf8"),
    version: 1,
  })
}

async function openDocument(t, { documentUri, text, version }) {
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
        workspace: { workspaceEdit: { documentChanges: true } },
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
        uri: documentUri,
        languageId: "arkts",
        version,
        text,
      },
    },
  })
  return { server, documentUri, text }
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
