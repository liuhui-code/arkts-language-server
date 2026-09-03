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
import { applyWorkspaceEdit } from "../support/lsp-edits.mjs"
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

test("lists one unresolved spelling quick fix for the current diagnostic", async (t) => {
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
      workspace: { workspaceEdit: { documentChanges: true } },
      textDocument: {
        publishDiagnostics: { versionSupport: true },
        codeAction: {
          codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix"] } },
          dataSupport: true,
          resolveSupport: { properties: ["edit"] },
        },
      },
    },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  const initialized = await session.initialize()
  assert.equal(initialized.result.capabilities.codeActionProvider, undefined)
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
  const published = await publication
  const diagnostics = published.params.diagnostics.filter((diagnostic) => (
    diagnostic.code === 2552 && sameRange(diagnostic.range, quickFix.range)
  ))
  assert.equal(diagnostics.length, 1, JSON.stringify(published.params.diagnostics))

  const response = await session.request("textDocument/codeAction", {
    textDocument: { uri: quickFix.uri },
    range: quickFix.range,
    context: { diagnostics, only: ["quickfix"] },
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  assert.equal(response.result.length, 1, JSON.stringify(response.result))
  const [action] = response.result
  assert.deepEqual({
    title: action.title,
    kind: action.kind,
    diagnostics: action.diagnostics,
  }, {
    title: "Change spelling to 'greeting'",
    kind: "quickfix",
    diagnostics,
  })
  assert.deepEqual(Object.keys(action.data ?? {}), ["arktsCodeActionId"])
  assert.match(
    action.data.arktsCodeActionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  assert.equal("edit" in action, false)
  assert.equal("command" in action, false)
})

test("resolves and applies the current spelling fix as one versioned document edit", async (t) => {
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
      workspace: { workspaceEdit: { documentChanges: true } },
      textDocument: {
        publishDiagnostics: { versionSupport: true },
        codeAction: {
          codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix"] } },
          dataSupport: true,
          resolveSupport: { properties: ["edit"] },
        },
      },
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
  const versionOnePublication = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === quickFix.uri && message.params.version === 1,
  )
  session.openDocument({
    uri: quickFix.uri,
    languageId: "arkts",
    version: 1,
    text: source,
  })
  const published = await versionOnePublication
  const diagnostics = published.params.diagnostics.filter((diagnostic) => (
    diagnostic.code === 2552 && sameRange(diagnostic.range, quickFix.range)
  ))
  assert.equal(diagnostics.length, 1, JSON.stringify(published.params.diagnostics))
  const listed = await session.request("textDocument/codeAction", {
    textDocument: { uri: quickFix.uri },
    range: quickFix.range,
    context: { diagnostics, only: ["quickfix"] },
  })
  assert.equal(listed.error, undefined, JSON.stringify(listed.error))
  assert.equal(listed.result.length, 1, JSON.stringify(listed.result))

  const resolved = await session.request("codeAction/resolve", {
    ...listed.result[0],
    title: "FORGED CLIENT TITLE",
    kind: "source.fixAll",
    diagnostics: [{
      range: {
        start: { line: 99, character: 99 },
        end: { line: 99, character: 100 },
      },
      severity: 2,
      code: 9999,
      source: "forged-client",
      message: "FORGED CLIENT DIAGNOSTIC",
    }],
    edit: { changes: { [quickFix.uri]: [{ range: quickFix.range, newText: "PWNED" }] } },
    command: { title: "FORGED CLIENT COMMAND", command: "forged.command" },
  })

  assert.equal(resolved.error, undefined, JSON.stringify(resolved.error))
  assert.deepEqual({
    title: resolved.result.title,
    kind: resolved.result.kind,
    diagnostics: resolved.result.diagnostics,
  }, {
    title: listed.result[0].title,
    kind: "quickfix",
    diagnostics,
  })
  assert.deepEqual(resolved.result.edit, {
    documentChanges: [{
      textDocument: { uri: quickFix.uri, version: 1 },
      edits: [{ range: quickFix.range, newText: "greeting" }],
    }],
  })
  assert.equal("changes" in resolved.result.edit, false)
  assert.equal("command" in resolved.result, false)
  assert.deepEqual(resolved.result.data, listed.result[0].data)

  const updatedDocuments = applyWorkspaceEdit(
    new Map([[quickFix.uri, source]]),
    resolved.result.edit,
    { documentVersions: new Map([[quickFix.uri, 1]]) },
  )
  const updated = updatedDocuments.get(quickFix.uri)
  assert.equal(updated, source.replace("greting", "greeting"))
  const versionTwoPublication = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === quickFix.uri && message.params.version === 2,
  )
  session.changeDocument({ uri: quickFix.uri, version: 2, text: updated })
  const current = await versionTwoPublication
  assert.deepEqual(current.params.diagnostics, [])
})

test("rejects unknown and forged code-action resolve data as InvalidParams", async (t) => {
  const materialized = await materializeConformanceWorkspace()
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
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  await session.initialize()
  for (const data of [
    { arktsCodeActionId: "00000000-0000-4000-8000-000000000000" },
    { arktsCodeActionId: "not-a-uuid", injected: true },
  ]) {
    const response = await session.request("codeAction/resolve", {
      title: "client-controlled",
      data,
    })
    assert.equal(response.result, undefined)
    assert.equal(response.error.code, -32602)
    assert.equal(response.error.message, "Code action is unknown")
  }
})

test("reports issued code actions as ContentModified after change or close", async (t) => {
  for (const lifecycle of ["change", "close"]) {
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
    const published = await publication
    const diagnostics = published.params.diagnostics.filter((diagnostic) => (
      diagnostic.code === 2552 && sameRange(diagnostic.range, quickFix.range)
    ))
    const listed = await session.request("textDocument/codeAction", {
      textDocument: { uri: quickFix.uri },
      range: quickFix.range,
      context: { diagnostics, only: ["quickfix"] },
    })
    assert.equal(listed.result.length, 1, `${lifecycle}: ${JSON.stringify(listed)}`)
    const issued = listed.result[0]

    if (lifecycle === "change") {
      const versionTwoPublication = session.transport.notification(
        "textDocument/publishDiagnostics",
        (message) => message.params.uri === quickFix.uri && message.params.version === 2,
      )
      session.changeDocument({
        uri: quickFix.uri,
        version: 2,
        text: source.replace("greting", "greeting"),
      })
      await versionTwoPublication
    } else {
      const clearedPublication = session.transport.notification(
        "textDocument/publishDiagnostics",
        (message) => message.params.uri === quickFix.uri
          && message.params.version === undefined
          && message.params.diagnostics.length === 0,
      )
      session.transport.send({
        jsonrpc: "2.0",
        method: "textDocument/didClose",
        params: { textDocument: { uri: quickFix.uri } },
      })
      await clearedPublication
    }

    const stale = await session.request("codeAction/resolve", issued)
    assert.equal(stale.result, undefined)
    assert.equal(stale.error.code, -32801, lifecycle)
    assert.equal(stale.error.message, "Code action is stale", lifecycle)
  }
})

test("rapid change and close never publish diagnostics for an obsolete version", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const quickFix = materialized.cases["quickfix.greeting"]
  const versionOne = fs.readFileSync(fileURLToPath(quickFix.uri), "utf8")
  const versionTwo = versionOne.replace("greting", "greeting")
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
  const versionOnePublication = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === quickFix.uri && message.params.version === 1,
    10_000,
  ).then(
    (message) => ({ message }),
    (error) => ({ error }),
  )
  const currentPublication = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === quickFix.uri && message.params.version === 2,
  )
  session.openDocument({
    uri: quickFix.uri,
    languageId: "arkts",
    version: 1,
    text: versionOne,
  })
  session.changeDocument({ uri: quickFix.uri, version: 2, text: versionTwo })

  const current = await currentPublication
  assert.deepEqual(current.params.diagnostics, [])

  const versionThreePublication = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === quickFix.uri && message.params.version === 3,
    10_000,
  ).then(
    (message) => ({ message }),
    (error) => ({ error }),
  )
  const clearedPublication = session.transport.notification(
    "textDocument/publishDiagnostics",
    (message) => message.params.uri === quickFix.uri
      && message.params.version === undefined
      && message.params.diagnostics.length === 0,
  )
  session.changeDocument({ uri: quickFix.uri, version: 3, text: versionOne })
  session.transport.send({
    jsonrpc: "2.0",
    method: "textDocument/didClose",
    params: { textDocument: { uri: quickFix.uri } },
  })
  const cleared = await clearedPublication
  assert.deepEqual(cleared.params, { uri: quickFix.uri, diagnostics: [] })

  await session.close()
  for (const obsolete of await Promise.all([versionOnePublication, versionThreePublication])) {
    assert.equal("message" in obsolete, false, JSON.stringify(obsolete.message))
    assert.match(obsolete.error.message, /process exited before LSP notification/)
  }
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
