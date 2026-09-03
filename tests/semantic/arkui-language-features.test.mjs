import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "arkui-language-features")
const documentPath = path.join(fixtureRoot, "ResourcePage.ets")
const resourcePath = path.join(fixtureRoot, "resources", "base", "element", "string.json")
const documentUri = pathToFileURL(documentPath).href
const resourceUri = pathToFileURL(resourcePath).href
const documentText = fs.readFileSync(documentPath, "utf8")
const resourceText = fs.readFileSync(resourcePath, "utf8")
const sdkRoot = path.join(fixtureRoot, "sdk", "openharmony")

test("provides deterministic ArkUI resource completion and definition candidates", (t) => {
  const { ArkUIResourceLanguageProvider } = buildArkUIProviderDriver(t)
  const provider = new ArkUIResourceLanguageProvider(fixtureRoot)
  const completionRange = suffixRangeOf(documentText, "app.string.ti", "ti")
  const definitionRange = suffixRangeOf(documentText, "app.string.title", "title")
  const resourceKeyRange = suffixRangeOf(resourceText, '"name": "title', "title")

  assert.deepEqual(
    provider.complete(toSemanticPosition(documentPath, completionRange.end), documentText),
    [{
      label: "title",
      detail: "ArkUI string resource app.string.title",
      kind: "property",
      insertText: "title",
      filterText: "title",
      sortText: "0000:title",
      source: "arkui",
      replacementRange: toSemanticRange(completionRange),
      data: { provider: "arkui-resource", reference: "app.string.title" },
    }],
  )
  assert.deepEqual(
    provider.define(toSemanticPosition(documentPath, midpoint(definitionRange)), documentText),
    [{ path: resourcePath, range: toSemanticRange(resourceKeyRange) }],
  )
})

test("bounds and caches each workspace resource snapshot without escaping its root", (t) => {
  const { ArkUIResourceLanguageProvider } = buildArkUIProviderDriver(t)
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-index-"))
  const workspaceRoot = path.join(temporaryRoot, "workspace")
  const outsideRoot = path.join(temporaryRoot, "outside")
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const safeResourcePath = path.join(
    workspaceRoot,
    "resources",
    "base",
    "element",
    "string.json",
  )
  const malformedResourcePath = path.join(
    workspaceRoot,
    "resources",
    "malformed",
    "element",
    "string.json",
  )
  const escapedResourcePath = path.join(
    workspaceRoot,
    "resources",
    "escaped",
    "element",
    "string.json",
  )
  const outsideResourcePath = path.join(
    outsideRoot,
    "resources",
    "base",
    "element",
    "string.json",
  )
  const lateResourcePath = path.join(
    workspaceRoot,
    "resources",
    "late",
    "element",
    "string.json",
  )
  for (const resourcePath of [
    safeResourcePath,
    malformedResourcePath,
    escapedResourcePath,
    outsideResourcePath,
    lateResourcePath,
  ]) {
    fs.mkdirSync(path.dirname(resourcePath), { recursive: true })
  }
  fs.writeFileSync(safeResourcePath, resourceJson("safe"), "utf8")
  fs.writeFileSync(malformedResourcePath, '{ "string": [', "utf8")
  fs.writeFileSync(outsideResourcePath, resourceJson("secret"), "utf8")
  fs.symlinkSync(outsideResourcePath, escapedResourcePath, "file")

  const source = 'const value = $r("app.string.")\n'
  const documentPath = path.join(workspaceRoot, "Main.ets")
  const outsideDocumentPath = path.join(outsideRoot, "Outside.ets")
  fs.writeFileSync(documentPath, source, "utf8")
  fs.writeFileSync(outsideDocumentPath, source, "utf8")
  const queryPosition = positionAt(source, source.indexOf('")'))
  const provider = new ArkUIResourceLanguageProvider(workspaceRoot)
  const labels = (filePath = documentPath) => provider.complete(
    toSemanticPosition(filePath, queryPosition, workspaceRoot),
    source,
  ).map(({ label }) => label)

  assert.deepEqual(labels(), ["safe"])
  fs.writeFileSync(lateResourcePath, resourceJson("later"), "utf8")
  assert.deepEqual(labels(), ["safe"], "a request must retain its immutable cached snapshot")
  provider.invalidate()
  assert.deepEqual(labels(), ["later", "safe"])
  assert.deepEqual(labels(outsideDocumentPath), [])

  const bounded = new ArkUIResourceLanguageProvider(workspaceRoot, { maxResourceFiles: 1 })
  assert.deepEqual(
    bounded.complete(toSemanticPosition(documentPath, queryPosition, workspaceRoot), source),
    [],
    "an exceeded resource-file limit must fail closed instead of returning a partial index",
  )
})

test("defines the name property inside the ArkUI string array, not unrelated JSON metadata", (t) => {
  const { ArkUIResourceLanguageProvider } = buildArkUIProviderDriver(t)
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-json-range-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const resourcePath = path.join(workspaceRoot, "resources", "base", "element", "string.json")
  fs.mkdirSync(path.dirname(resourcePath), { recursive: true })
  const content = [
    "{",
    '  "metadata": { "name": "title" },',
    '  "string": [{ "name": "title", "value": "Ready" }]',
    "}",
    "",
  ].join("\n")
  fs.writeFileSync(resourcePath, content, "utf8")
  const source = 'const title = $r("app.string.title")\n'
  const documentPath = path.join(workspaceRoot, "Page.ets")
  fs.writeFileSync(documentPath, source, "utf8")
  const sourceNameRange = suffixRangeOf(source, "app.string.title", "title")
  const expectedKeyOffset = content.lastIndexOf('"title"') + 1
  const provider = new ArkUIResourceLanguageProvider(workspaceRoot)

  assert.deepEqual(
    provider.define(
      toSemanticPosition(documentPath, midpoint(sourceNameRange), workspaceRoot),
      source,
    ),
    [{
      path: resourcePath,
      range: {
        startLine: positionAt(content, expectedKeyOffset).line + 1,
        startColumn: positionAt(content, expectedKeyOffset).character + 1,
        endLine: positionAt(content, expectedKeyOffset + "title".length).line + 1,
        endColumn: positionAt(content, expectedKeyOffset + "title".length).character + 1,
      },
    }],
  )
})

test("rewrites only ArkUI builder blocks while preserving exact source offsets", (t) => {
  const { createArktsVirtualDocument } = buildArkUIVirtualDocumentDriver(t)
  const source = [
    "struct Page {",
    "  build() {",
    "    if (this.ready) { this.refresh() }",
    "    lowercase() { this.bad() }",
    "    Column() {",
    "      Row() { Text(\"Ready\") }",
    "    }",
    "    const face = \"😀\"; const values = [1 2]",
    "  }",
    "}",
    "function helper() { return 1 }",
    "",
  ].join("\n")
  const expected = [
    "class Page {",
    "  build() {",
    "    if (this.ready) { this.refresh() }",
    "    lowercase() { this.bad() }",
    "    ([Column(),()=>{",
    "      ([Row(),()=>{ Text(\"Ready\") }] as const)[0]",
    "    }] as const)[0]",
    "    const face = \"😀\"; const values = [1 2]",
    "  }",
    "}",
    "function helper() { return 1 }",
    "",
  ].join("\n")

  const virtual = createArktsVirtualDocument("/workspace/Page.ets", source)
  const numericErrorOffset = source.indexOf("[1 2]") + 3
  const generatedNumericErrorOffset = virtual.toGeneratedOffset(numericErrorOffset)

  assert.equal(virtual.generatedContent, expected)
  assert.equal(virtual.generatedContent.length, expected.length)
  assert.equal(generatedNumericErrorOffset, expected.indexOf("[1 2]") + 3)
  assert.equal(virtual.toSourceOffset(generatedNumericErrorOffset), numericErrorOffset)
  assert.deepEqual(
    virtual.generatedSpanToSourceRange(generatedNumericErrorOffset, 1),
    toSemanticRange(suffixRangeOf(source, "values = [1 2", "2")),
  )
})

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

test("refreshes a cached ArkUI resource before the next request after a watched change", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-watch-"))
  const workspaceRoot = path.join(temporaryRoot, "workspace")
  const temporarySdkRoot = path.join(workspaceRoot, "sdk", "openharmony")
  const temporaryResourcePath = path.join(
    workspaceRoot,
    "resources",
    "base",
    "element",
    "string.json",
  )
  fs.cpSync(sdkRoot, temporarySdkRoot, { recursive: true })
  fs.mkdirSync(path.dirname(temporaryResourcePath), { recursive: true })
  fs.writeFileSync(temporaryResourcePath, resourceJson("title"), "utf8")
  const text = [
    "struct WatchedResourcePage {",
    "  build() {",
    '    const choice = $r("app.string.")',
    '    const oldValue = $r("app.string.title")',
    '    const newValue = $r("app.string.subtitle")',
    "  }",
    "}",
    "",
  ].join("\n")
  const temporaryDocumentPath = path.join(workspaceRoot, "WatchedResourcePage.ets")
  fs.writeFileSync(temporaryDocumentPath, text, "utf8")
  const temporaryDocumentUri = pathToFileURL(temporaryDocumentPath).href
  const temporaryResourceUri = pathToFileURL(temporaryResourcePath).href
  const rootUri = pathToFileURL(workspaceRoot).href
  const completionPosition = positionAt(text, text.indexOf('")', text.indexOf("app.string.")))
  const oldRange = suffixRangeOf(text, "app.string.title", "title")
  const newRange = suffixRangeOf(text, "app.string.subtitle", "subtitle")
  const server = new LspProcess({
    env: { ARKLINE_HARMONY_SDK_PATH: temporarySdkRoot },
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
      rootUri,
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
        uri: temporaryDocumentUri,
        languageId: "arkts",
        version: 1,
        text,
      },
    },
  })

  const initialItems = await completionItems(server, 2, temporaryDocumentUri, completionPosition)
  const initialDefinition = await definitionLocations(
    server,
    3,
    temporaryDocumentUri,
    midpoint(oldRange),
  )
  assert.deepEqual(resourceLabels(initialItems), ["title"])
  assert.equal(initialDefinition[0]?.uri, temporaryResourceUri)

  const changedResourceText = resourceJson("subtitle")
  fs.writeFileSync(temporaryResourcePath, changedResourceText, "utf8")
  server.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: temporaryResourceUri, type: 2 }] },
  })
  const changedItemsPromise = completionItems(
    server,
    4,
    temporaryDocumentUri,
    completionPosition,
  )
  const oldDefinitionPromise = definitionLocations(
    server,
    5,
    temporaryDocumentUri,
    midpoint(oldRange),
  )
  const newDefinitionPromise = definitionLocations(
    server,
    6,
    temporaryDocumentUri,
    midpoint(newRange),
  )
  const [changedItems, oldDefinition, newDefinition] = await Promise.all([
    changedItemsPromise,
    oldDefinitionPromise,
    newDefinitionPromise,
  ])
  const changedKeyRange = suffixRangeOf(
    changedResourceText,
    '"name": "subtitle',
    "subtitle",
  )

  assert.deepEqual(resourceLabels(changedItems), ["subtitle"])
  assert.deepEqual(oldDefinition, [])
  assert.deepEqual(newDefinition, [{ uri: temporaryResourceUri, range: changedKeyRange }])
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

async function completionItems(server, id, uri, position) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/completion",
    params: { textDocument: { uri }, position, context: { triggerKind: 1 } },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  return Array.isArray(response.result) ? response.result : response.result?.items ?? []
}

async function definitionLocations(server, id, uri, position) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/definition",
    params: { textDocument: { uri }, position },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  if (response.result === null || response.result === undefined) return []
  return Array.isArray(response.result) ? response.result : [response.result]
}

function resourceLabels(items) {
  return items.map(({ label }) => label).filter((label) => label === "title" || label === "subtitle")
}

function midpoint(range) {
  assert.equal(range.start.line, range.end.line)
  return {
    line: range.start.line,
    character: range.start.character
      + Math.floor((range.end.character - range.start.character) / 2),
  }
}

function toSemanticPosition(filePath, position, workspaceRoot = fixtureRoot) {
  return {
    path: filePath,
    line: position.line + 1,
    column: position.character + 1,
    documentVersion: 1,
    workspaceRoot,
  }
}

function resourceJson(name) {
  return `${JSON.stringify({ string: [{ name, value: name }] }, null, 2)}\n`
}

function toSemanticRange(range) {
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

function buildArkUIProviderDriver(t) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-provider-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const driverPath = path.join(outputDirectory, "arkui-resource-language-provider.cjs")
  buildSync({
    entryPoints: [path.join(
      projectRoot,
      "src",
      "core",
      "arkui",
      "resource-language-provider.ts",
    )],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: driverPath,
  })
  return createRequire(import.meta.url)(driverPath)
}

function buildArkUIVirtualDocumentDriver(t) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-arkui-virtual-"))
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }))
  const driverPath = path.join(outputDirectory, "arkts-virtual-document.cjs")
  buildSync({
    entryPoints: [path.join(
      projectRoot,
      "src",
      "core",
      "virtual",
      "arkts-virtual-document.ts",
    )],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: driverPath,
  })
  return createRequire(import.meta.url)(driverPath)
}
