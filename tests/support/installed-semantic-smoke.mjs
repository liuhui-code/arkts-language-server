import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"

import { applyTextEdits, applyWorkspaceEdit } from "./lsp-edits.mjs"
import { LspSession } from "./lsp-session.mjs"
import { materializeConformanceWorkspace } from "./materialize-conformance-workspace.mjs"

export async function assertInstalledSemanticSmoke({
  installedCommand,
  temporaryRoot,
  cwd,
  env = {},
  timeoutMs = 15_000,
}) {
  const materialized = await materializeConformanceWorkspace({ temporaryRoot })
  const reference = materialized.cases["profile.reference"]
  const definition = materialized.cases["profile.definition"]
  const completion = materialized.cases["completion.unicode"]
  const greeterDefinition = materialized.cases["greeter.definition"]
  const quickFix = materialized.cases["quickfix.greeting"]
  const consumerSource = fs.readFileSync(fileURLToPath(reference.uri), "utf8")
  const definitionSource = fs.readFileSync(fileURLToPath(definition.uri), "utf8")
  const homeSource = fs.readFileSync(fileURLToPath(completion.uri), "utf8")
  const greeterSource = fs.readFileSync(fileURLToPath(greeterDefinition.uri), "utf8")
  const quickFixSource = fs.readFileSync(fileURLToPath(quickFix.uri), "utf8")
  assert.equal(textInRange(consumerSource, reference.range), "Profile")
  const referenceLine = consumerSource.split("\n")[reference.range.start.line]
  const referencePrefix = referenceLine.slice(0, reference.range.start.character)
  assert.match(referencePrefix, /😀/)
  assert.equal(
    referencePrefix.length - Array.from(referencePrefix).length,
    1,
    "the hover reference marker must use UTF-16 code units after its emoji prefix",
  )
  assert.equal(textInRange(homeSource, completion.range), "Gree")
  const completionLine = homeSource.split("\n")[completion.range.start.line]
  const completionPrefix = completionLine.slice(0, completion.range.start.character)
  assert.match(completionPrefix, /😀/)
  assert.equal(
    completionPrefix.length - Array.from(completionPrefix).length,
    1,
    "the completion marker must use UTF-16 code units after its emoji prefix",
  )
  assert.equal(textInRange(quickFixSource, quickFix.range), "greting")
  const externalCwd = cwd ?? path.join(temporaryRoot, "semantic-external-cwd")
  fs.mkdirSync(externalCwd, { recursive: true })
  const session = new LspSession({
    command: installedCommand,
    args: ["--stdio"],
    cwd: externalCwd,
    env: {
      ...env,
      HOME: env.HOME ?? path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_INDEX_SIDECAR_PATH: "",
      ARKTS_INDEX_CACHE_DIR: path.join(materialized.root, "index-cache"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: {
      general: { positionEncodings: ["utf-16"] },
      workspace: { workspaceEdit: { documentChanges: true } },
      textDocument: {
        publishDiagnostics: { versionSupport: true },
        codeAction: {
          codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix"] } },
          dataSupport: true,
          resolveSupport: { properties: ["edit"] },
        },
      },
      window: { workDoneProgress: true },
    },
  })

  try {
    const initialized = await session.initialize({ timeoutMs })
    assert.deepEqual(initialized.result.capabilities.textDocumentSync, {
      openClose: true,
      change: 2,
    })
    assert.equal(initialized.result.capabilities.completionProvider.resolveProvider, true)
    assert.equal(initialized.result.capabilities.hoverProvider, true)
    assert.deepEqual(initialized.result.capabilities.codeActionProvider, {
      codeActionKinds: ["quickfix"],
      resolveProvider: true,
    })
    const create = await session.transport.serverRequest(
      "window/workDoneProgress/create",
      () => true,
      timeoutMs,
    )
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
    const catalogReady = await session.transport.progress(
      create.params.token,
      (message) => message.params.value.kind === "report"
        && message.params.value.percentage === 100,
      timeoutMs,
    )
    assert.match(catalogReady.params.value.message, /^Indexed \d+\/\d+ files; skipped \d+ entries$/)
    await session.transport.progress(
      create.params.token,
      (message) => message.params.value.kind === "end",
      timeoutMs,
    )

    const consumerDiagnostics = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === reference.uri && message.params.version === 1,
      timeoutMs,
    )
    session.openDocument({
      uri: reference.uri,
      languageId: "arkts",
      version: 1,
      text: consumerSource,
    })
    const published = await consumerDiagnostics
    assert.equal(published.params.version, 1)
    assert.deepEqual(published.params.diagnostics, [])

    const definitionResponse = await session.request("textDocument/definition", {
      textDocument: { uri: reference.uri },
      position: midpoint(reference.range),
    }, { timeoutMs })
    assert.equal(definitionResponse.error, undefined, JSON.stringify(definitionResponse.error))
    const locations = definitionResponse.result === null
      ? []
      : Array.isArray(definitionResponse.result)
        ? definitionResponse.result
        : [definitionResponse.result]
    assert.deepEqual(locations, [{ uri: definition.uri, range: definition.range }])
    assert.notDeepEqual(locations[0].range.start, locations[0].range.end)
    assert.equal(textInRange(definitionSource, locations[0].range), "Profile")

    const hoverResponse = await session.request("textDocument/hover", {
      textDocument: { uri: reference.uri },
      position: midpoint(reference.range),
    }, { timeoutMs })
    assert.equal(hoverResponse.error, undefined, JSON.stringify(hoverResponse.error))
    assert.equal(hoverResponse.result.contents.kind, "markdown")
    assert.equal(
      hoverSignature(hoverResponse.result.contents.value),
      "(alias) interface Profile\nimport Profile",
    )
    assert.match(
      hoverResponse.result.contents.value,
      /Represents a user profile shared across ArkTS modules\./,
    )
    assert.match(hoverResponse.result.contents.value, /@since\s+1\.0\.0/)
    assert.deepEqual(hoverResponse.result.range, reference.range)

    const diskGreeterResponse = await session.request(
      "workspace/symbol",
      { query: "Greeter" },
      { timeoutMs },
    )
    assert.equal(
      diskGreeterResponse.error,
      undefined,
      JSON.stringify(diskGreeterResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(diskGreeterResponse.result, greeterDefinition.uri, "Greeter"),
      [{ name: "Greeter", uri: greeterDefinition.uri, range: greeterDefinition.range }],
      "the lifecycle tracer requires a catalog-backed disk symbol",
    )

    const overlayName = "InstalledOverlayGreeter"
    const overlaySource = applyTextEdits(greeterSource, [{
      range: greeterDefinition.range,
      newText: overlayName,
    }])
    const overlayRange = {
      start: greeterDefinition.range.start,
      end: {
        line: greeterDefinition.range.start.line,
        character: greeterDefinition.range.start.character + overlayName.length,
      },
    }
    assert.equal(textInRange(overlaySource, overlayRange), overlayName)
    session.openDocument({
      uri: greeterDefinition.uri,
      languageId: "arkts",
      version: 1,
      text: greeterSource,
    })
    session.changeDocument({
      uri: greeterDefinition.uri,
      version: 2,
      contentChanges: [{
        range: greeterDefinition.range,
        text: overlayName,
      }],
    })

    const changedSymbolResponse = await session.request(
      "workspace/symbol",
      { query: overlayName },
      { timeoutMs },
    )
    assert.equal(
      changedSymbolResponse.error,
      undefined,
      JSON.stringify(changedSymbolResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(changedSymbolResponse.result, greeterDefinition.uri, overlayName),
      [{ name: overlayName, uri: greeterDefinition.uri, range: overlayRange }],
    )
    const staleDiskSymbolResponse = await session.request(
      "workspace/symbol",
      { query: "Greeter" },
      { timeoutMs },
    )
    assert.equal(
      staleDiskSymbolResponse.error,
      undefined,
      JSON.stringify(staleDiskSymbolResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(staleDiskSymbolResponse.result, greeterDefinition.uri, "Greeter"),
      [],
      "an open incrementally changed overlay must hide the stale indexed disk symbol",
    )

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: greeterDefinition.uri } },
    })
    const closedOverlayResponse = await session.request(
      "workspace/symbol",
      { query: overlayName },
      { timeoutMs },
    )
    assert.equal(
      closedOverlayResponse.error,
      undefined,
      JSON.stringify(closedOverlayResponse.error),
    )
    assert.deepEqual(
      exactWorkspaceSymbols(closedOverlayResponse.result, greeterDefinition.uri, overlayName),
      [],
      "didClose must remove the in-memory overlay",
    )
    const restoredDiskSymbolResponse = await session.request(
      "workspace/symbol",
      { query: "Greeter" },
      { timeoutMs },
    )
    assert.equal(
      restoredDiskSymbolResponse.error,
      undefined,
      JSON.stringify(restoredDiskSymbolResponse.error),
    )
    const restoredDiskSymbols = exactWorkspaceSymbols(
      restoredDiskSymbolResponse.result,
      greeterDefinition.uri,
      "Greeter",
    )
    assert.deepEqual(restoredDiskSymbols, [{
      name: "Greeter",
      uri: greeterDefinition.uri,
      range: greeterDefinition.range,
    }])
    assert.equal(textInRange(greeterSource, restoredDiskSymbols[0].range), "Greeter")

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: reference.uri } },
    })
    session.openDocument({
      uri: completion.uri,
      languageId: "arkts",
      version: 1,
      text: homeSource,
    })
    const completionResponse = await session.request("textDocument/completion", {
      textDocument: { uri: completion.uri },
      position: completion.position,
    }, { timeoutMs })
    assert.equal(completionResponse.error, undefined, JSON.stringify(completionResponse.error))
    const items = Array.isArray(completionResponse.result)
      ? completionResponse.result
      : completionResponse.result?.items ?? []
    const greeters = items.filter((item) => item.label === "Greeter")
    assert.equal(greeters.length, 1, `Expected one Greeter in ${JSON.stringify(items)}`)
    assert.equal(greeters[0].kind, CompletionItemKind.Class)
    assert.deepEqual(greeters[0].textEdit, {
      range: completion.range,
      newText: "Greeter",
    })

    const [greeter] = greeters
    assert.deepEqual(Object.keys(greeter.data ?? {}), ["arktsCompletionId"])
    assert.match(
      greeter.data.arktsCompletionId,
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
    )

    const resolvedResponse = await session.request(
      "completionItem/resolve",
      greeter,
      { timeoutMs },
    )
    assert.equal(resolvedResponse.error, undefined, JSON.stringify(resolvedResponse.error))
    const resolved = resolvedResponse.result
    assert.deepEqual(resolved.data, greeter.data)
    assert.match(resolved.detail, /class Greeter/)
    assert.equal(
      resolved.documentation,
      "Builds a deterministic greeting for the supplied name.",
    )
    assert.deepEqual(resolved.textEdit, greeter.textEdit)
    assert.deepEqual(resolved.additionalTextEdits, [{
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
      newText: 'import { Greeter } from "../services/Greeter.ets";\n\n',
    }])

    const updatedHome = applyTextEdits(homeSource, [
      resolved.textEdit,
      ...resolved.additionalTextEdits,
    ])
    assert.match(updatedHome, /^import \{ Greeter \} from "\.\.\/services\/Greeter\.ets";\n\n/)
    assert.match(updatedHome, /const face = '😀'; const value = Greeter/)

    const diagnosticsV2 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === completion.uri && message.params.version === 2,
      timeoutMs,
    )
    session.changeDocument({
      uri: completion.uri,
      version: 2,
      text: updatedHome,
    })
    const updatedDiagnostics = await diagnosticsV2
    assert.deepEqual(updatedDiagnostics.params.diagnostics, [])

    const usageOffset = updatedHome.lastIndexOf("Greeter")
    assert.notEqual(usageOffset, -1)
    const greeterDefinitionResponse = await session.request("textDocument/definition", {
      textDocument: { uri: completion.uri },
      position: positionAt(updatedHome, usageOffset + 1),
    }, { timeoutMs })
    assert.equal(
      greeterDefinitionResponse.error,
      undefined,
      JSON.stringify(greeterDefinitionResponse.error),
    )
    const greeterLocations = Array.isArray(greeterDefinitionResponse.result)
      ? greeterDefinitionResponse.result
      : [greeterDefinitionResponse.result]
    assert.deepEqual(greeterLocations, [{
      uri: greeterDefinition.uri,
      range: greeterDefinition.range,
    }])
    assert.equal(textInRange(greeterSource, greeterLocations[0].range), "Greeter")

    session.transport.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri: completion.uri } },
    })
    const diagnosticsV1 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === quickFix.uri
        && message.params.version === 1
        && message.params.diagnostics.some((diagnostic) => (
          diagnostic.code === 2552 && sameRange(diagnostic.range, quickFix.range)
        )),
      timeoutMs,
    )
    session.openDocument({
      uri: quickFix.uri,
      languageId: "arkts",
      version: 1,
      text: quickFixSource,
    })
    const publishedQuickFix = await diagnosticsV1
    const diagnostics = publishedQuickFix.params.diagnostics.filter((diagnostic) => (
      diagnostic.code === 2552 && sameRange(diagnostic.range, quickFix.range)
    ))
    assert.deepEqual(diagnostics.map(({ range, severity, source, code }) => ({
      range,
      severity,
      source,
      code,
    })), [{
      range: quickFix.range,
      severity: 1,
      source: "arkts",
      code: 2552,
    }])

    const listedResponse = await session.request("textDocument/codeAction", {
      textDocument: { uri: quickFix.uri },
      range: quickFix.range,
      context: { diagnostics, only: ["quickfix"] },
    }, { timeoutMs })
    assert.equal(listedResponse.error, undefined, JSON.stringify(listedResponse.error))
    assert.equal(listedResponse.result.length, 1, JSON.stringify(listedResponse.result))
    const [action] = listedResponse.result
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

    const resolvedActionResponse = await session.request(
      "codeAction/resolve",
      action,
      { timeoutMs },
    )
    assert.equal(
      resolvedActionResponse.error,
      undefined,
      JSON.stringify(resolvedActionResponse.error),
    )
    const resolvedAction = resolvedActionResponse.result
    assert.deepEqual(resolvedAction.data, action.data)
    assert.deepEqual(resolvedAction.edit, {
      documentChanges: [{
        textDocument: { uri: quickFix.uri, version: 1 },
        edits: [{ range: quickFix.range, newText: "greeting" }],
      }],
    })
    assert.equal("changes" in resolvedAction.edit, false)
    assert.equal("command" in resolvedAction, false)

    const updatedQuickFixDocuments = applyWorkspaceEdit(
      new Map([[quickFix.uri, quickFixSource]]),
      resolvedAction.edit,
      { documentVersions: new Map([[quickFix.uri, 1]]) },
    )
    const updatedQuickFix = updatedQuickFixDocuments.get(quickFix.uri)
    assert.equal(updatedQuickFix, quickFixSource.replace("greting", "greeting"))
    const quickFixDiagnosticsV2 = session.transport.notification(
      "textDocument/publishDiagnostics",
      (message) => message.params.uri === quickFix.uri && message.params.version === 2,
      timeoutMs,
    )
    session.changeDocument({ uri: quickFix.uri, version: 2, text: updatedQuickFix })
    const clearedQuickFixDiagnostics = await quickFixDiagnosticsV2
    assert.deepEqual(clearedQuickFixDiagnostics.params.diagnostics, [])
  } finally {
    try {
      await session.close({ timeoutMs })
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  }
}

function midpoint(range) {
  assert.equal(range.start.line, range.end.line, "fixture range must be single-line")
  return {
    line: range.start.line,
    character: range.start.character + Math.floor(
      (range.end.character - range.start.character) / 2,
    ),
  }
}

function textInRange(source, range) {
  assert.equal(range.start.line, range.end.line, "fixture range must be single-line")
  return source
    .split("\n")[range.start.line]
    .slice(range.start.character, range.end.character)
}

function positionAt(source, offset) {
  const before = source.slice(0, offset)
  const line = before.split("\n").length - 1
  const lineStart = before.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}

function sameRange(left, right) {
  return left?.start?.line === right.start.line
    && left.start.character === right.start.character
    && left?.end?.line === right.end.line
    && left.end.character === right.end.character
}

function exactWorkspaceSymbols(symbols, uri, name) {
  return symbols
    .filter((symbol) => symbol.name === name && symbol.location?.uri === uri)
    .map((symbol) => ({
      name: symbol.name,
      uri: symbol.location.uri,
      range: symbol.location.range,
    }))
}

function hoverSignature(markdown) {
  const match = /^```arkts\n([\s\S]*?)\n```/.exec(markdown)
  assert.ok(match, "hover must start with an ArkTS signature fence")
  return match[1]
}
