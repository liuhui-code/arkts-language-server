import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

async function openFixture(t, directory, fileName, capabilities = {}) {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", directory)
  const documentPath = path.join(fixtureRoot, fileName)
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(fixtureRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        ...capabilities,
      },
    },
  })
  const initialized = await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text,
      },
    },
  })

  return { server, initialized, documentUri, text }
}

test("returns ArkTS signature help with the active parameter", async (t) => {
  const { server, documentUri } = await openFixture(t, "signature-help", "Calculator.ets")

  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/signatureHelp",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 6, character: 16 },
    },
  })

  const response = await server.response(2)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.activeParameter, 1)
  assert.match(response.result.signatures[0].label, /add\(left: number, right: number\): number/)
})

test("selects the nested generic overload from an unopened import at an emoji UTF-16 position", async (t) => {
  const { server, documentUri, text } = await openFixture(
    t,
    "signature-help-depth",
    "Main.ets",
  )
  const marker = "transform<number>(1,"
  const markerOffset = text.indexOf(marker)
  assert.notEqual(markerOffset, -1)

  server.send({
    jsonrpc: "2.0",
    id: 20,
    method: "textDocument/signatureHelp",
    params: {
      textDocument: { uri: documentUri },
      position: utf16PositionAt(text, markerOffset + marker.length),
      context: {
        triggerKind: 2,
        triggerCharacter: ",",
        isRetrigger: false,
      },
    },
  })

  const response = await server.response(20)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result.signatures.map(({ label }) => label), [
    "transform<T>(value: T): T",
    "transform(value: number, mapper: (value: number) => number): number",
  ])
  assert.equal(response.result.activeSignature, 1)
  assert.equal(response.result.activeParameter, 1)
})

test("uses a ranged didChange snapshot for nested generic signature help", async (t) => {
  const { server, documentUri, text } = await openFixture(
    t,
    "signature-help-depth",
    "Main.ets",
  )
  const previousCall = "transform<number>(1,"
  const currentCall = 'transform<string>("value",'
  const changedText = text.replace(previousCall, currentCall)
  assert.notEqual(changedText, text)

  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{
        range: utf16RangeOf(text, previousCall),
        text: currentCall,
      }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 21,
    method: "textDocument/signatureHelp",
    params: {
      textDocument: { uri: documentUri },
      position: utf16PositionAt(
        changedText,
        changedText.indexOf(currentCall) + currentCall.length,
      ),
      context: {
        triggerKind: 2,
        triggerCharacter: ",",
        isRetrigger: false,
      },
    },
  })

  const response = await server.response(21)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(
    response.result.signatures[1].label,
    "transform(value: string, mapper: (value: string) => string): string",
  )
  assert.equal(response.result.activeSignature, 1)
  assert.equal(response.result.activeParameter, 1)
})

test("returns null signature help outside a call", async (t) => {
  const { server, documentUri } = await openFixture(t, "signature-help", "Calculator.ets")

  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/signatureHelp",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 4, character: 0 },
    },
  })

  const response = await server.response(3)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result, null)
})

test("advertises signature help only after its transcript is supported", async (t) => {
  const { initialized } = await openFixture(t, "signature-help", "Calculator.ets")

  assert.deepEqual(initialized.result.capabilities.signatureHelpProvider, {
    triggerCharacters: ["(", ",", "<"],
    retriggerCharacters: [")"],
  })
})

test("returns documented ArkTS hover information at the exact source range", async (t) => {
  const { server, documentUri } = await openFixture(t, "hover", "Profile.ets")

  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "textDocument/hover",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 5, character: 11 },
    },
  })

  const response = await server.response(4)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.contents.kind, "markdown")
  assert.match(response.result.contents.value, /Profile\.title: string/)
  assert.match(response.result.contents.value, /Human-readable title\./)
  assert.deepEqual(response.result.range, {
    start: { line: 5, character: 9 },
    end: { line: 5, character: 14 },
  })
})

test("returns null hover information on whitespace", async (t) => {
  const { server, documentUri } = await openFixture(t, "hover", "Profile.ets")

  server.send({
    jsonrpc: "2.0",
    id: 5,
    method: "textDocument/hover",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 3, character: 0 },
    },
  })

  const response = await server.response(5)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result, null)
})

test("returns source documentation and UTF-16 reference ranges for an unopened imported alias and member", async (t) => {
  const { server, documentUri, text } = await openFixture(
    t,
    "cross-file-hover",
    "Consumer.ets",
  )

  const aliasRange = utf16RangeOf(text, "ServiceAlias", 2)
  server.send({
    jsonrpc: "2.0",
    id: 8,
    method: "textDocument/hover",
    params: {
      textDocument: { uri: documentUri },
      position: aliasRange.start,
    },
  })
  const alias = await server.response(8)
  assert.equal(alias.error, undefined, JSON.stringify(alias.error))
  assert.equal(alias.result.contents.kind, "markdown")
  assert.equal(
    hoverSignature(alias.result.contents.value),
    "(alias) class ServiceAlias\nimport ServiceAlias",
  )
  assert.match(alias.result.contents.value, /Remote greeting service\./)
  assert.match(alias.result.contents.value, /Keeps greeting behavior in a reusable module\./)
  assert.match(alias.result.contents.value, /@since\s+1\.2\.3/)
  assert.deepEqual(alias.result.range, aliasRange)

  const memberRange = utf16RangeOf(text, "formatGreeting")
  server.send({
    jsonrpc: "2.0",
    id: 9,
    method: "textDocument/hover",
    params: {
      textDocument: { uri: documentUri },
      position: memberRange.start,
    },
  })
  const member = await server.response(9)
  assert.equal(member.error, undefined, JSON.stringify(member.error))
  assert.equal(member.result.contents.kind, "markdown")
  assert.equal(
    hoverSignature(member.result.contents.value),
    "(method) RemoteService.formatGreeting(name: string): string",
  )
  assert.match(member.result.contents.value, /Formats a greeting for one recipient\./)
  assert.match(member.result.contents.value, /@param\s+name.*Recipient display name\./)
  assert.match(member.result.contents.value, /@returns\s+A formatted greeting\./)
  assert.deepEqual(member.result.range, memberRange)
})

test("advertises hover only after documented and empty transcripts are supported", async (t) => {
  const { initialized } = await openFixture(t, "hover", "Profile.ets")

  assert.equal(initialized.result.capabilities.hoverProvider, true)
})

test("returns hierarchical ArkTS document symbols from the changed overlay", async (t) => {
  const { server, documentUri } = await openFixture(
    t,
    "document-symbols",
    "Panel.ets",
    {
      textDocument: {
        documentSymbol: {
          hierarchicalDocumentSymbolSupport: true,
          symbolKind: { valueSet: Array.from({ length: 26 }, (_, index) => index + 1) },
        },
      },
    },
  )

  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri: documentUri, version: 2 },
      contentChanges: [{
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 0 },
        },
        text: "  refresh(force: boolean): void {\n  }\n",
      }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 6,
    method: "textDocument/documentSymbol",
    params: { textDocument: { uri: documentUri } },
  })

  const response = await server.response(6)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result, [
    {
      name: "Panel",
      kind: 23,
      range: {
        start: { line: 0, character: 0 },
        end: { line: 4, character: 1 },
      },
      selectionRange: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 12 },
      },
      children: [
        {
          name: "title",
          kind: 7,
          range: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 24 },
          },
          selectionRange: {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 7 },
          },
        },
        {
          name: "refresh",
          kind: 6,
          range: {
            start: { line: 2, character: 2 },
            end: { line: 3, character: 3 },
          },
          selectionRange: {
            start: { line: 2, character: 2 },
            end: { line: 2, character: 9 },
          },
        },
      ],
    },
    {
      name: "helper",
      kind: 12,
      range: {
        start: { line: 6, character: 0 },
        end: { line: 8, character: 1 },
      },
      selectionRange: {
        start: { line: 6, character: 9 },
        end: { line: 6, character: 15 },
      },
    },
  ])
})

test("uses legacy symbol kinds in flat results when the client omits valueSet", async (t) => {
  const { server, documentUri } = await openFixture(
    t,
    "document-symbols",
    "Panel.ets",
    {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: false },
      },
    },
  )

  server.send({
    jsonrpc: "2.0",
    id: 7,
    method: "textDocument/documentSymbol",
    params: { textDocument: { uri: documentUri } },
  })

  const response = await server.response(7)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.deepEqual(response.result.map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    containerName: symbol.containerName,
    location: symbol.location,
  })), [
    {
      name: "Panel",
      kind: 5,
      containerName: undefined,
      location: {
        uri: documentUri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 2, character: 1 },
        },
      },
    },
    {
      name: "title",
      kind: 7,
      containerName: "Panel",
      location: {
        uri: documentUri,
        range: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 24 },
        },
      },
    },
    {
      name: "helper",
      kind: 12,
      containerName: undefined,
      location: {
        uri: documentUri,
        range: {
          start: { line: 4, character: 0 },
          end: { line: 6, character: 1 },
        },
      },
    },
  ])
})

test("advertises document symbols only after both client response shapes work", async (t) => {
  const { initialized } = await openFixture(
    t,
    "document-symbols",
    "Panel.ets",
    {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      },
    },
  )

  assert.equal(initialized.result.capabilities.documentSymbolProvider, true)
})

function utf16RangeOf(text, token, occurrence = 1) {
  let startOffset = -1
  for (let found = 0; found < occurrence; found += 1) {
    startOffset = text.indexOf(token, startOffset + 1)
    if (startOffset === -1) break
  }
  assert.notEqual(startOffset, -1, `missing ${token} marker`)
  const endOffset = startOffset + token.length
  return {
    start: utf16PositionAt(text, startOffset),
    end: utf16PositionAt(text, endOffset),
  }
}

function utf16PositionAt(text, offset) {
  const prefix = text.slice(0, offset)
  const line = prefix.split("\n").length - 1
  const lineStart = prefix.lastIndexOf("\n") + 1
  return { line, character: prefix.slice(lineStart).length }
}

function hoverSignature(markdown) {
  const match = /^```arkts\n([\s\S]*?)\n```/.exec(markdown)
  assert.ok(match, "hover must start with an ArkTS signature fence")
  return match[1]
}
