import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(
  projectRoot,
  "fixtures",
  "semantic",
  "arkui-resource-watch",
)
const missingResourceCode = "arkui.resource.not-found"

test("republishes open-document diagnostics when an ArkUI resource is added then deleted", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-resource-watch-diag-"))
  const workspaceRoot = path.join(temporaryRoot, "workspace")
  fs.cpSync(fixtureRoot, workspaceRoot, { recursive: true })
  const serverPath = path.join(temporaryRoot, "bundle", "server.cjs")
  fs.mkdirSync(path.dirname(serverPath), { recursive: true })
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
  })

  const documentPath = path.join(workspaceRoot, "Page.ets")
  const documentUri = pathToFileURL(documentPath).href
  const text = fs.readFileSync(documentPath, "utf8")
  const expectedRange = suffixRangeOf(text, "app.string.live_title", "live_title")
  const resourcePath = path.join(
    workspaceRoot,
    "resources",
    "en_US",
    "element",
    "string.json",
  )
  const resourceUri = pathToFileURL(resourcePath).href
  const server = new LspProcess({
    serverPath,
    env: { ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs") },
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
      rootUri: pathToFileURL(workspaceRoot).href,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: { publishDiagnostics: { versionSupport: true } },
      },
    },
  })
  const initialized = await server.response(1)
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  const initialDiagnostics = diagnosticsWithResourceState(server, documentUri, true)
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: { uri: documentUri, languageId: "arkts", version: 1, text },
    },
  })
  assert.deepEqual(resourceDiagnostics(await initialDiagnostics), [{
    code: missingResourceCode,
    severity: 1,
    source: "arkts",
    range: expectedRange,
  }])

  fs.mkdirSync(path.dirname(resourcePath), { recursive: true })
  fs.writeFileSync(resourcePath, resourceJson("live_title"), "utf8")
  const clearedDiagnostics = diagnosticsWithResourceState(server, documentUri, false)
  watchedFile(server, resourceUri, 1)
  const cleared = await clearedDiagnostics
  assert.equal(cleared.params.version, 1, "the source document must remain unchanged")
  assert.deepEqual(resourceDiagnostics(cleared), [])

  fs.unlinkSync(resourcePath)
  const restoredDiagnostics = diagnosticsWithResourceState(server, documentUri, true)
  watchedFile(server, resourceUri, 3)
  const restored = await restoredDiagnostics
  assert.equal(restored.params.version, 1, "the source document must remain unchanged")
  assert.deepEqual(resourceDiagnostics(restored), [{
    code: missingResourceCode,
    severity: 1,
    source: "arkts",
    range: expectedRange,
  }])
})

function diagnosticsWithResourceState(server, documentUri, missing) {
  return server.notification(
    "textDocument/publishDiagnostics",
    ({ params }) => params.uri === documentUri
      && params.version === 1
      && params.diagnostics.some(({ code }) => code === missingResourceCode) === missing,
  )
}

function resourceDiagnostics(notification) {
  return notification.params.diagnostics
    .filter(({ code }) => code === missingResourceCode)
    .map(({ code, severity, source, range }) => ({ code, severity, source, range }))
}

function watchedFile(server, uri, type) {
  server.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri, type }] },
  })
}

function suffixRangeOf(source, container, suffix) {
  const containerOffset = source.indexOf(container)
  assert.notEqual(containerOffset, -1, `missing ${container}`)
  assert.ok(container.endsWith(suffix), `${suffix} must be a suffix of ${container}`)
  const startOffset = containerOffset + container.length - suffix.length
  const prefix = source.slice(0, startOffset)
  assert.match(prefix, /😀/)
  assert.equal(prefix.length - Array.from(prefix).length, 1)
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

function resourceJson(name) {
  return `${JSON.stringify({ string: [{ name, value: name }] }, null, 2)}\n`
}
