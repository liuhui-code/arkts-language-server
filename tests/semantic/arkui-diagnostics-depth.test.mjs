import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "arkui-sdk-depth")
const sdkRoot = path.join(fixtureRoot, "sdk", "openharmony")

test("publishes TS2552 for a misspelled ArkUI decorator at its exact UTF-16 range", async (t) => {
  const opened = await openDiagnosticDocument(t, "MisspelledDecorator.ets", 3)
  const expectedRange = rangeInAnchor(opened.text, "/* 😀 */ @Componet", "Componet")
  const line = opened.text.split("\n")[expectedRange.start.line]
  const prefix = line.slice(0, expectedRange.start.character)
  assert.match(prefix, /😀/)
  assert.equal(prefix.length - Array.from(prefix).length, 1)

  const published = await opened.diagnostics
  assert.deepEqual(
    published.params.diagnostics
      .filter(({ code }) => code === 2552)
      .map(({ code, severity, source, range }) => ({ code, severity, source, range })),
    [{ code: 2552, severity: 1, source: "arkts", range: expectedRange }],
  )
})

test("publishes a stable diagnostic for a missing ArkUI string resource key", async (t) => {
  const opened = await openDiagnosticDocument(t, "MissingResource.ets", 5)
  const expectedRange = rangeInAnchor(
    opened.text,
    'app.string.missing_title"',
    "missing_title",
  )
  const line = opened.text.split("\n")[expectedRange.start.line]
  const prefix = line.slice(0, expectedRange.start.character)
  assert.match(prefix, /😀/)
  assert.equal(prefix.length - Array.from(prefix).length, 1)

  const published = await opened.diagnostics
  assert.deepEqual(
    published.params.diagnostics
      .filter(({ code }) => code === "arkui.resource.not-found")
      .map(({ code, severity, source, range }) => ({ code, severity, source, range })),
    [{
      code: "arkui.resource.not-found",
      severity: 1,
      source: "arkts",
      range: expectedRange,
    }],
  )
})

test("preserves real non-builder TypeScript syntax and unknown-name diagnostics", async (t) => {
  const opened = await openDiagnosticDocument(t, "TypeScriptGuard.ets", 7)
  const unknownNameRange = rangeInAnchor(
    opened.text,
    "missing = DefinitelyMissingSymbol",
    "DefinitelyMissingSymbol",
  )
  const finalBraceOffset = opened.text.lastIndexOf("}")
  assert.notEqual(finalBraceOffset, -1)
  const syntaxRange = {
    start: positionAt(opened.text, finalBraceOffset),
    end: positionAt(opened.text, finalBraceOffset + 1),
  }

  const published = await opened.diagnostics
  const protectedDiagnostics = published.params.diagnostics
    .filter(({ code }) => code === 1128 || code === 2304)
    .map(({ code, severity, source, range }) => ({ code, severity, source, range }))
    .sort((left, right) => left.code - right.code)
  assert.deepEqual(protectedDiagnostics, [
    { code: 1128, severity: 1, source: "arkts", range: syntaxRange },
    { code: 2304, severity: 1, source: "arkts", range: unknownNameRange },
  ])
})

async function openDiagnosticDocument(t, fileName, version) {
  const documentPath = path.join(fixtureRoot, fileName)
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")
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
    ({ params }) => params.uri === documentUri && params.version === version,
  )
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: documentUri, languageId: "arkts", version, text },
    },
  })
  return { diagnostics, documentUri, server, text }
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
