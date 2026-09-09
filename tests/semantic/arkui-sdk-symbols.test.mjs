import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "arkui-sdk-depth")
const documentPath = path.join(fixtureRoot, "SdkSymbols.ets")
const widthDocumentPath = path.join(fixtureRoot, "SdkWidth.ets")
const sdkPath = path.join(
  fixtureRoot,
  "sdk",
  "openharmony",
  "ets",
  "component",
  "arkui.d.ts",
)
const documentUri = pathToFileURL(documentPath).href
const widthDocumentUri = pathToFileURL(widthDocumentPath).href
const sdkUri = pathToFileURL(sdkPath).href
const source = fs.readFileSync(documentPath, "utf8")
const widthSource = fs.readFileSync(widthDocumentPath, "utf8")
const sdkSource = fs.readFileSync(sdkPath, "utf8")
const sdkRoot = path.join(fixtureRoot, "sdk", "openharmony")

const scenarios = [
  {
    label: "Entry",
    kind: CompletionItemKind.Variable,
    completionAnchor: "@Ent",
    completionPrefix: "Ent",
    usageAnchor: "@Entry",
    definitionAnchor: "declare const Entry",
    hoverPattern: /const Entry: \(target: object\) => void/,
  },
  {
    label: "Component",
    kind: CompletionItemKind.Variable,
    completionAnchor: "@Com",
    completionPrefix: "Com",
    usageAnchor: "@Component",
    definitionAnchor: "declare const Component",
    hoverPattern: /const Component: \(target: object\) => void/,
  },
  {
    label: "State",
    kind: CompletionItemKind.Variable,
    completionAnchor: "@Sta value",
    completionPrefix: "Sta",
    usageAnchor: "@State private",
    definitionAnchor: "declare const State",
    hoverPattern: /const State: \(target: object, propertyKey: string\) => void/,
  },
  {
    label: "Column",
    kind: CompletionItemKind.Function,
    completionAnchor: "columnCandidate = Col",
    completionPrefix: "Col",
    usageAnchor: "    Column()",
    definitionAnchor: "declare function Column",
    hoverPattern: /function Column\(\): ColumnAttribute/,
  },
  {
    label: "Text",
    kind: CompletionItemKind.Function,
    completionAnchor: "textCandidate = Te",
    completionPrefix: "Te",
    usageAnchor: "    Text(this.title)",
    definitionAnchor: "declare function Text",
    hoverPattern: /function Text\(value: string \| ArkUIResourceValue\): TextAttribute/,
  },
]

test("exposes ArkUI SDK decorators, builders, and attributes through completion hover and definition", async (t) => {
  const server = await openDocument(t, documentUri, source)
  let requestId = 10

  for (const scenario of scenarios) {
    const completionRange = rangeInAnchor(
      source,
      scenario.completionAnchor,
      scenario.completionPrefix,
    )
    const completion = await request(server, requestId++, "textDocument/completion", {
      textDocument: { uri: documentUri },
      position: completionRange.end,
      context: { triggerKind: 1 },
    })
    const completionItems = Array.isArray(completion.result)
      ? completion.result
      : completion.result?.items ?? []
    const matchingItems = completionItems
      .filter(({ label }) => label === scenario.label)
      .map(({ label, kind, textEdit }) => ({ label, kind, textEdit }))
    assert.deepEqual(matchingItems, [{
      label: scenario.label,
      kind: scenario.kind,
      textEdit: { range: completionRange, newText: scenario.label },
    }], `${scenario.label} completion: ${JSON.stringify(completionItems)}`)

    const usageRange = rangeInAnchor(source, scenario.usageAnchor, scenario.label)
    const hover = await request(server, requestId++, "textDocument/hover", {
      textDocument: { uri: documentUri },
      position: midpoint(usageRange),
    })
    assert.equal(hover.result?.contents?.kind, "markdown", `${scenario.label} hover kind`)
    assert.match(hover.result.contents.value, scenario.hoverPattern)
    assert.deepEqual(hover.result.range, usageRange, `${scenario.label} hover range`)

    const definition = await request(server, requestId++, "textDocument/definition", {
      textDocument: { uri: documentUri },
      position: midpoint(usageRange),
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
        range: rangeInAnchor(sdkSource, scenario.definitionAnchor, scenario.label),
      }],
      `${scenario.label} SDK definition`,
    )
  }
})

test("exposes an ordinary Text attribute through completion hover and definition", async (t) => {
  const server = await openDocument(t, widthDocumentUri, widthSource)
  const completionRange = rangeAtLastTokenInAnchor(
    widthSource,
    'widthCandidate = Text("Ready").wi',
    "wi",
  )
  const completion = await request(server, 30, "textDocument/completion", {
    textDocument: { uri: widthDocumentUri },
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
    `width completion: ${JSON.stringify(completionItems)}`,
  )

  const usageRange = rangeAtLastTokenInAnchor(
    widthSource,
    'widthUsage = Text("Ready").width("100%")',
    "width",
  )
  const hover = await request(server, 31, "textDocument/hover", {
    textDocument: { uri: widthDocumentUri },
    position: midpoint(usageRange),
  })
  assert.equal(hover.result?.contents?.kind, "markdown")
  assert.match(
    hover.result.contents.value,
    /ArkUICommonAttribute\.width\(value: ArkUILength\): TextAttribute/,
  )
  assert.deepEqual(hover.result.range, usageRange)

  const definition = await request(server, 32, "textDocument/definition", {
    textDocument: { uri: widthDocumentUri },
    position: midpoint(usageRange),
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
})

async function openDocument(t, uri, text) {
  const server = new LspProcess({ env: { ARKLINE_HARMONY_SDK_PATH: sdkRoot } })
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
        uri,
        languageId: "arkts",
        version: 1,
        text,
      },
    },
  })
  return server
}

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

function rangeAtLastTokenInAnchor(text, anchor, token) {
  const anchorOffset = text.indexOf(anchor)
  assert.notEqual(anchorOffset, -1, `missing anchor: ${anchor}`)
  const tokenOffset = anchor.lastIndexOf(token)
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
