import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"
import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "arkui-sdk-depth")
const documentPath = path.join(fixtureRoot, "BuilderTail.ets")
const sdkPath = path.join(
  fixtureRoot,
  "sdk",
  "openharmony",
  "ets",
  "component",
  "arkui.d.ts",
)
const documentUri = pathToFileURL(documentPath).href
const sdkUri = pathToFileURL(sdkPath).href
const source = fs.readFileSync(documentPath, "utf8")
const sdkSource = fs.readFileSync(sdkPath, "utf8")
const sdkRoot = path.join(fixtureRoot, "sdk", "openharmony")
const serverPath = process.env.ARKTS_BUILDER_TAIL_SERVER_PATH ?? "dist/server.cjs"

test("lowers nested ArkUI builders to type-preserving expressions with exact source maps", (t) => {
  const { createArktsVirtualDocument } = buildVirtualDocumentDriver(t)
  const input = [
    "struct Page {",
    "  build() {",
    "    if (this.ready) { this.refresh() }",
    "    function helper() { return 1 }",
    "    lowercase() { this.bad() }",
    "    Column() {",
    '      Row() { Text("Ready") }',
    '    }.width("100%")',
    "  }",
    "}",
    "",
  ].join("\n")
  const expected = [
    "class Page {",
    "  build() {",
    "    if (this.ready) { this.refresh() }",
    "    function helper() { return 1 }",
    "    lowercase() { this.bad() }",
    "    ([Column(),()=>{",
    '      ([Row(),()=>{ Text("Ready") }] as const)[0]',
    '    }] as const)[0].width("100%")',
    "  }",
    "}",
    "",
  ].join("\n")

  const virtual = createArktsVirtualDocument("/workspace/Page.ets", input)
  assert.equal(virtual.generatedContent, expected)
  assert.match(virtual.generatedContent, /if \(this\.ready\) \{ this\.refresh\(\) \}/)
  assert.match(virtual.generatedContent, /function helper\(\) \{ return 1 \}/)
  assert.match(virtual.generatedContent, /lowercase\(\) \{ this\.bad\(\) \}/)

  const sourceCall = input.indexOf("Column()")
  const generatedPrefix = virtual.generatedContent.indexOf("([Column()")
  assert.notEqual(sourceCall, -1)
  assert.notEqual(generatedPrefix, -1)
  assert.equal(virtual.toGeneratedOffset(sourceCall), generatedPrefix + 2)
  assert.equal(virtual.toSourceOffset(generatedPrefix), sourceCall)

  const sourceOpenBrace = input.indexOf("{", sourceCall)
  const generatedArrow = virtual.generatedContent.indexOf("()=>{", generatedPrefix)
  assert.notEqual(sourceOpenBrace, -1)
  assert.notEqual(generatedArrow, -1)
  assert.equal(virtual.toSourceOffset(generatedArrow), sourceOpenBrace)

  const sourceWidth = input.indexOf(".width", sourceCall) + 1
  const generatedWidth = virtual.generatedContent.indexOf(".width", generatedPrefix) + 1
  assert.ok(sourceWidth > 0)
  assert.ok(generatedWidth > 0)
  assert.equal(virtual.toGeneratedOffset(sourceWidth), generatedWidth)
  assert.equal(virtual.toSourceOffset(generatedWidth), sourceWidth)
  assert.deepEqual(
    virtual.generatedSpanToSourceRange(generatedWidth, "width".length),
    toSemanticRange(rangeAt(input, sourceWidth, "width".length)),
  )

  const sourceTailBoundary = sourceWidth - 1
  const generatedTailBoundary = generatedWidth - 1
  assert.equal(virtual.toGeneratedOffset(sourceTailBoundary), generatedTailBoundary)
  const generatedSuffix = virtual.generatedContent.lastIndexOf("] as const)[0]", generatedTailBoundary)
  assert.notEqual(generatedSuffix, -1)
  assert.equal(virtual.toSourceOffset(generatedSuffix), sourceTailBoundary)
})

test("fails safe without partial lowering when a document exceeds the builder transform limit", (t) => {
  const { createArktsVirtualDocument } = buildVirtualDocumentDriver(t)
  const builderLine = `    Column()${" ".repeat(32)}{}`
  const atLimitInput = [
    "struct AtLimitPage {",
    "  build() {",
    ...Array.from({ length: 512 }, () => builderLine),
    "  }",
    "}",
    "",
  ].join("\n")
  const atLimit = createArktsVirtualDocument("/workspace/AtLimitPage.ets", atLimitInput)
  assert.equal(atLimit.generatedContent.split("([Column()").length - 1, 512)

  const builderLines = Array.from({ length: 513 }, () => builderLine)
  const input = ["struct BoundedPage {", "  build() {", ...builderLines, "  }", "}", ""].join("\n")
  const virtual = createArktsVirtualDocument("/workspace/BoundedPage.ets", input)

  assert.equal(virtual.generatedContent, input.replace("struct", "class"))
  assert.equal(virtual.generatedContent.includes("([Column()"), false)
})

test("fails safe without partial lowering when generated builder expansion exceeds its budget", (t) => {
  const { createArktsVirtualDocument } = buildVirtualDocumentDriver(t)
  const builderLines = Array.from({ length: 410 }, () => "    Column() {}")
  const input = ["struct ExpandedPage {", "  build() {", ...builderLines, "  }", "}", ""].join("\n")
  const virtual = createArktsVirtualDocument("/workspace/ExpandedPage.ets", input)

  assert.equal(virtual.generatedContent, input.replace("struct", "class"))
  assert.equal(virtual.generatedContent.includes("([Column()"), false)
})

test("supports a width attribute after nested ArkUI builder blocks", async (t) => {
  const server = new LspProcess({
    serverPath,
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
  const diagnostics = server.notification(
    "textDocument/publishDiagnostics",
    ({ params }) => params.uri === documentUri && params.version === 1,
  )
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: source,
      },
    },
  })

  const published = await diagnostics
  assert.deepEqual(published.params, {
    uri: documentUri,
    version: 1,
    diagnostics: [],
  })

  const widthRange = rangeInAnchor(source, '}.width("100%")', "width")
  const hover = await request(server, 2, "textDocument/hover", {
    textDocument: { uri: documentUri },
    position: midpoint(widthRange),
  })
  assert.equal(hover.result?.contents?.kind, "markdown")
  assert.match(
    hover.result.contents.value,
    /ArkUICommonAttribute\.width\(value: ArkUILength\): ArkUIColumnAttribute/,
  )
  assert.deepEqual(hover.result.range, widthRange)

  const definition = await request(server, 3, "textDocument/definition", {
    textDocument: { uri: documentUri },
    position: midpoint(widthRange),
  })
  const definitionLocations = definition.result === null || definition.result === undefined
    ? []
    : Array.isArray(definition.result)
      ? definition.result
      : [definition.result]
  assert.deepEqual(
    definitionLocations.filter(({ uri }) => uri === sdkUri),
    [{
      uri: sdkUri,
      range: rangeInAnchor(sdkSource, "width(value: ArkUILength)", "width"),
    }],
  )

  const completionText = source.replace('}.width("100%")', "}.wi")
  assert.notEqual(completionText, source)
  const completionRange = rangeInAnchor(completionText, "}.wi", "wi")
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{ text: completionText }],
    },
  })
  const completion = await request(server, 4, "textDocument/completion", {
    textDocument: { uri: documentUri },
    position: completionRange.end,
    context: { triggerKind: 1 },
  })
  const completionItems = Array.isArray(completion.result)
    ? completion.result
    : completion.result?.items ?? []
  assert.deepEqual(
    completionItems
      .filter(({ label }) => label === "width")
      .map(({ label, kind, textEdit }) => ({ label, kind, textEdit })),
    [{
      label: "width",
      kind: CompletionItemKind.Method,
      textEdit: { range: completionRange, newText: "width" },
    }],
  )
})

async function request(server, id, method, params) {
  server.send({ jsonrpc: "2.0", id, method, params })
  const response = await server.response(id)
  assert.equal(response.error, undefined, `${method}: ${JSON.stringify(response.error)}`)
  return response
}

function rangeInAnchor(text, anchor, token) {
  const anchorOffset = text.indexOf(anchor)
  assert.notEqual(anchorOffset, -1, `missing anchor: ${anchor}`)
  const tokenOffset = anchor.indexOf(token)
  assert.notEqual(tokenOffset, -1, `${token} is absent from ${anchor}`)
  const start = anchorOffset + tokenOffset
  return { start: positionAt(text, start), end: positionAt(text, start + token.length) }
}

function positionAt(text, offset) {
  const prefix = text.slice(0, offset)
  return {
    line: prefix.split("\n").length - 1,
    character: offset - (prefix.lastIndexOf("\n") + 1),
  }
}

function midpoint(range) {
  assert.equal(range.start.line, range.end.line)
  return {
    line: range.start.line,
    character: range.start.character
      + Math.floor((range.end.character - range.start.character) / 2),
  }
}

function rangeAt(text, start, length) {
  return { start: positionAt(text, start), end: positionAt(text, start + length) }
}

function toSemanticRange(range) {
  return {
    startLine: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  }
}

function buildVirtualDocumentDriver(t) {
  const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-builder-tail-"))
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
