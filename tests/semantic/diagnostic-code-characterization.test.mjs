import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { buildSync } from "esbuild"
import ts from "typescript"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"

test("publishes the TypeScript spelling diagnostic code at the exact UTF-16 marker range", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const quickFix = materialized.cases["quickfix.greeting"]
  const source = fs.readFileSync(fileURLToPath(quickFix.uri), "utf8")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_LSP_LOG_DIR: path.join(materialized.root, "logs"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: {
      textDocument: { publishDiagnostics: { versionSupport: true } },
    },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  const publication = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === quickFix.uri && message.params.version === 1,
  )
  session.openDocument({
    uri: quickFix.uri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const notification = await publication
  const matching = notification.params.diagnostics.filter((diagnostic) => (
    sameRange(diagnostic.range, quickFix.range)
  ))

  assert.equal(matching.length, 1, JSON.stringify(notification.params.diagnostics))
  assert.deepEqual(
    {
      range: matching[0].range,
      severity: matching[0].severity,
      source: matching[0].source,
      code: matching[0].code,
    },
    {
      range: quickFix.range,
      severity: 1,
      source: "arkts",
      code: 2552,
    },
  )
})

test("deduplicates only diagnostics with the same code and complete mapped range", (t) => {
  const { mapTypescriptDiagnostics } = buildDiagnosticMapper(t)
  const filePath = path.join(projectRoot, "fixtures", "Mapper.ets")
  const virtualDocument = {
    generatedSpanToSourceRange(start, length) {
      return {
        startLine: 4,
        startColumn: start + 1,
        endLine: 4,
        endColumn: start + length + 1,
      }
    },
  }
  const sameMessage = "same diagnostic text"

  const diagnostics = mapTypescriptDiagnostics(filePath, virtualDocument, [
    diagnostic({ code: 1001, length: 1, messageText: sameMessage }),
    diagnostic({ code: 1002, length: 1, messageText: sameMessage }),
    diagnostic({ code: 1001, length: 2, messageText: sameMessage }),
    diagnostic({ code: 1001, length: 1, messageText: sameMessage }),
  ])

  assert.deepEqual(diagnostics.map(({ code, range }) => ({ code, range })), [
    {
      code: 1001,
      range: { startLine: 4, startColumn: 1, endLine: 4, endColumn: 2 },
    },
    {
      code: 1002,
      range: { startLine: 4, startColumn: 1, endLine: 4, endColumn: 2 },
    },
    {
      code: 1001,
      range: { startLine: 4, startColumn: 1, endLine: 4, endColumn: 3 },
    },
  ])
})

function sameRange(left, right) {
  return left?.start?.line === right.start.line
    && left.start.character === right.start.character
    && left?.end?.line === right.end.line
    && left.end.character === right.end.character
}

function diagnostic({ code, length, messageText }) {
  return {
    category: ts.DiagnosticCategory.Error,
    code,
    start: 0,
    length,
    messageText,
  }
}

function buildDiagnosticMapper(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-diagnostic-mapper-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "diagnostic-mapper.cjs")
  buildSync({
    entryPoints: [path.join(
      projectRoot,
      "src",
      "core",
      "types",
      "typescript-language-helpers.ts",
    )],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
