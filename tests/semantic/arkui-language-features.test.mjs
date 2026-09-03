import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "arkui-language-features")
const documentPath = path.join(fixtureRoot, "ResourcePage.ets")
const resourcePath = path.join(fixtureRoot, "resources", "base", "element", "string.json")
const documentUri = pathToFileURL(documentPath).href
const resourceUri = pathToFileURL(resourcePath).href
const documentText = fs.readFileSync(documentPath, "utf8")
const resourceText = fs.readFileSync(resourcePath, "utf8")
const sdkRoot = path.join(fixtureRoot, "sdk", "openharmony")

test("completes and defines an ArkUI string resource through $r", async (t) => {
  const completionRange = suffixRangeOf(documentText, "app.string.ti", "ti")
  const definitionRange = suffixRangeOf(documentText, "app.string.title", "title")
  const resourceKeyRange = suffixRangeOf(resourceText, '"name": "title', "title")
  const completionLine = documentText.split("\n")[completionRange.start.line]
  const completionPrefix = completionLine.slice(0, completionRange.start.character)
  assert.match(completionPrefix, /😀/)
  assert.equal(
    completionPrefix.length - Array.from(completionPrefix).length,
    1,
    "the resource completion must use an emoji-derived UTF-16 position",
  )

  const server = new LspProcess({
    env: { ARKLINE_HARMONY_SDK_PATH: sdkRoot },
  })
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

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: {
      textDocument: { uri: documentUri },
      position: completionRange.end,
      context: { triggerKind: 1 },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: documentUri },
      position: midpoint(definitionRange),
    },
  })

  const completion = await server.response(2)
  const definition = await server.response(3)
  const completionItems = Array.isArray(completion.result)
    ? completion.result
    : completion.result?.items ?? []
  const definitionLocations = definition.result === null || definition.result === undefined
    ? []
    : Array.isArray(definition.result)
      ? definition.result
      : [definition.result]

  assert.deepEqual({
    completionError: completion.error ?? null,
    titleItems: completionItems
      .filter(({ label }) => label === "title")
      .map(({ label, textEdit }) => ({ label, textEdit })),
    definitionError: definition.error ?? null,
    definitionLocations,
  }, {
    completionError: null,
    titleItems: [{
      label: "title",
      textEdit: { range: completionRange, newText: "title" },
    }],
    definitionError: null,
    definitionLocations: [{ uri: resourceUri, range: resourceKeyRange }],
  })
})

test("publishes no diagnostics for declared ArkUI component and resource DSL", async (t) => {
  const { server, documentUri, text } = await openDiagnosticFixture(t, "ValidPage.ets", 5)
  const published = await server.notification(
    "textDocument/publishDiagnostics",
    ({ params }) => params.uri === documentUri && params.version === 5,
  )

  assert.deepEqual(published.params, {
    uri: documentUri,
    version: 5,
    diagnostics: [],
  }, text)
})

test("publishes a numeric syntax diagnostic at its exact UTF-16 token range", async (t) => {
  const { server, documentUri, text } = await openDiagnosticFixture(t, "SyntaxBroken.ets", 9)
  const expectedRange = suffixRangeOf(text, "values = [1 2", "2")
  const diagnosticLine = text.split("\n")[expectedRange.start.line]
  const diagnosticPrefix = diagnosticLine.slice(0, expectedRange.start.character)
  assert.match(diagnosticPrefix, /😀/)
  assert.equal(
    diagnosticPrefix.length - Array.from(diagnosticPrefix).length,
    1,
    "the syntax diagnostic must use an emoji-derived UTF-16 range",
  )

  const published = await server.notification(
    "textDocument/publishDiagnostics",
    ({ params }) => params.uri === documentUri && params.version === 9,
  )
  const syntaxDiagnostics = published.params.diagnostics
    .filter(({ code }) => code === 1005)
    .map(({ code, severity, source, range }) => ({ code, severity, source, range }))

  assert.deepEqual(syntaxDiagnostics, [{
    code: 1005,
    severity: 1,
    source: "arkts",
    range: expectedRange,
  }])
})

async function openDiagnosticFixture(t, fileName, version) {
  const documentPath = path.join(fixtureRoot, fileName)
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")
  const server = new LspProcess({
    env: { ARKLINE_HARMONY_SDK_PATH: sdkRoot },
  })
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
        textDocument: { publishDiagnostics: { versionSupport: true } },
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
      textDocument: { uri: documentUri, languageId: "arkts", version, text },
    },
  })
  return { server, documentUri, text }
}

function suffixRangeOf(source, container, suffix) {
  const containerOffset = source.indexOf(container)
  assert.notEqual(containerOffset, -1, `missing ${container}`)
  assert.ok(container.endsWith(suffix), `${suffix} must be a suffix of ${container}`)
  const startOffset = containerOffset + container.length - suffix.length
  return {
    start: positionAt(source, startOffset),
    end: positionAt(source, startOffset + suffix.length),
  }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  const lineStart = prefix.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}

function midpoint(range) {
  assert.equal(range.start.line, range.end.line)
  return {
    line: range.start.line,
    character: range.start.character
      + Math.floor((range.end.character - range.start.character) / 2),
  }
}
