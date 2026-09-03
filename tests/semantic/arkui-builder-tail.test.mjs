import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"

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

test("supports a width attribute after nested ArkUI builder blocks", async (t) => {
  const server = new LspProcess({ env: { ARKLINE_HARMONY_SDK_PATH: sdkRoot } })
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
  assert.match(hover.result.contents.value, /\bwidth\b/)
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
