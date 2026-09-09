import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { applyTextEdits } from "../support/lsp-edits.mjs"
import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "document-formatting")
const sdkRoot = path.join(
  projectRoot,
  "fixtures",
  "semantic",
  "arkui-sdk-depth",
  "sdk",
  "openharmony",
)
const sdkPath = path.join(sdkRoot, "ets", "component", "arkui.d.ts")

test("formats an ArkUI document without changing diagnostics or symbol identity", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-formatting-"))
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
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "semantic", "semantic-worker-runtime.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: path.join(path.dirname(serverPath), "semantic-worker.cjs"),
  })

  const documentPath = path.join(workspaceRoot, "FormattingPage.ets")
  const documentUri = pathToFileURL(documentPath).href
  const fixtureText = fs.readFileSync(documentPath, "utf8")
  const original = fixtureText.replace(/\r?\n$/u, "")
  assert.notEqual(original, fixtureText, "fixture must exercise insertFinalNewline")
  const session = new LspSession({
    command: process.execPath,
    args: [serverPath, "--stdio"],
    cwd: workspaceRoot,
    rootUri: pathToFileURL(workspaceRoot).href,
    env: {
      ...process.env,
      ARKLINE_HARMONY_SDK_PATH: sdkRoot,
      ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs"),
    },
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      textDocument: {
        formatting: { dynamicRegistration: false },
        publishDiagnostics: { versionSupport: true },
      },
    },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })

  const initialized = await session.initialize()
  assert.equal(initialized.result.capabilities.documentFormattingProvider, true)
  const diagnosticsV1 = diagnosticsFor(session, documentUri, 1)
  session.openDocument({ uri: documentUri, version: 1, text: original })
  assert.deepEqual((await diagnosticsAtStage(diagnosticsV1, "initial open")).params.diagnostics, [])

  const formatting = await session.request("textDocument/formatting", {
    textDocument: { uri: documentUri },
    options: {
      tabSize: 2,
      insertSpaces: true,
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
    },
  })
  assert.equal(formatting.error, undefined, JSON.stringify(formatting.error))
  assert.ok(Array.isArray(formatting.result))
  assert.ok(formatting.result.length > 0)
  const formatted = applyTextEdits(original, formatting.result)
  assert.equal(formatted, [
    "@Entry",
    "@Component",
    "struct FormattingPage {",
    "  @State",
    '  title: string = "😀"',
    "",
    "  build() {",
    "    Column() {",
    "      Text(this.title)",
    '    }.width("100%")',
    "  }",
    "}",
    "",
  ].join("\n"))

  const diagnosticsV2 = diagnosticsFor(session, documentUri, 2)
  session.changeDocument({ uri: documentUri, version: 2, text: formatted })
  assert.deepEqual((await diagnosticsAtStage(diagnosticsV2, "formatted change")).params.diagnostics, [])

  const widthRange = rangeInAnchor(formatted, '}.width("100%")', "width")
  const definition = await session.request("textDocument/definition", {
    textDocument: { uri: documentUri },
    position: midpoint(widthRange),
  })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  assert.deepEqual(normalizeLocations(definition.result), [{
    uri: pathToFileURL(sdkPath).href,
    range: rangeInAnchor(fs.readFileSync(sdkPath, "utf8"), "width(value: ArkUILength)", "width"),
  }])

  const withExtraFinalNewlines = `${formatted}\n\n`
  session.changeDocument({ uri: documentUri, version: 3, text: withExtraFinalNewlines })
  const trimFinalNewlines = await session.request("textDocument/formatting", {
    textDocument: { uri: documentUri },
    options: { tabSize: 2, insertSpaces: true, trimFinalNewlines: true },
  })
  assert.equal(trimFinalNewlines.error, undefined, JSON.stringify(trimFinalNewlines.error))
  assert.equal(applyTextEdits(withExtraFinalNewlines, trimFinalNewlines.result), formatted)

  session.changeDocument({ uri: documentUri, version: 4, text: formatted })
  const second = await session.request("textDocument/formatting", {
    textDocument: { uri: documentUri },
    options: { tabSize: 2, insertSpaces: true, trimFinalNewlines: true },
  })
  assert.equal(second.error, undefined, JSON.stringify(second.error))
  assert.deepEqual(second.result, [])
})

function diagnosticsFor(session, uri, version) {
  return session.transport.notification(
    "textDocument/publishDiagnostics",
    ({ params }) => params.uri === uri && params.version === version,
  )
}

async function diagnosticsAtStage(promise, stage) {
  try { return await promise }
  catch (error) {
    throw new Error(`Diagnostics failed at ${stage}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

function normalizeLocations(result) {
  if (result === null || result === undefined) return []
  return Array.isArray(result) ? result : [result]
}

function midpoint(range) {
  return {
    line: range.start.line,
    character: Math.floor((range.start.character + range.end.character) / 2),
  }
}

function rangeInAnchor(source, anchor, token) {
  const anchorOffset = source.indexOf(anchor)
  assert.notEqual(anchorOffset, -1, `missing anchor: ${anchor}`)
  const tokenOffset = anchor.indexOf(token)
  assert.notEqual(tokenOffset, -1, `${token} is absent from ${anchor}`)
  const start = anchorOffset + tokenOffset
  return { start: positionAt(source, start), end: positionAt(source, start + token.length) }
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: offset - (prefix.lastIndexOf("\n") + 1) }
}
