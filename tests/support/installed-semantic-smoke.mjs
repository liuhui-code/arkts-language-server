import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"

import { applyTextEdits } from "./lsp-edits.mjs"
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
  const consumerSource = fs.readFileSync(fileURLToPath(reference.uri), "utf8")
  const definitionSource = fs.readFileSync(fileURLToPath(definition.uri), "utf8")
  const homeSource = fs.readFileSync(fileURLToPath(completion.uri), "utf8")
  const greeterSource = fs.readFileSync(fileURLToPath(greeterDefinition.uri), "utf8")
  assert.equal(textInRange(consumerSource, reference.range), "Profile")
  assert.equal(textInRange(homeSource, completion.range), "Gree")
  const completionLine = homeSource.split("\n")[completion.range.start.line]
  const completionPrefix = completionLine.slice(0, completion.range.start.character)
  assert.match(completionPrefix, /😀/)
  assert.equal(
    completionPrefix.length - Array.from(completionPrefix).length,
    1,
    "the completion marker must use UTF-16 code units after its emoji prefix",
  )
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
      textDocument: { publishDiagnostics: { versionSupport: true } },
      window: { workDoneProgress: true },
    },
  })

  try {
    const initialized = await session.initialize({ timeoutMs })
    assert.equal(initialized.result.capabilities.completionProvider.resolveProvider, true)
    const create = await session.transport.serverRequest(
      "window/workDoneProgress/create",
      () => true,
      timeoutMs,
    )
    session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })

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
