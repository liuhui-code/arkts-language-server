import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { CompletionItemKind } from "vscode-languageserver/node.js"

import { LspSession } from "../support/lsp-session.mjs"
import { LspProcess, projectRoot } from "../support/lsp-process.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"

test("returns the exact unopened definition range after an emoji prefix", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const reference = materialized.cases["profile.reference"]
  const target = materialized.cases["profile.definition"]
  const consumer = fs.readFileSync(fileURLToPath(reference.uri), "utf8")
  const profile = fs.readFileSync(fileURLToPath(target.uri), "utf8")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  const referenceLine = consumer.split("\n")[reference.range.start.line]
  const prefix = referenceLine.slice(0, reference.range.start.character)
  assert.match(prefix, /😀/)
  assert.equal(
    prefix.length - Array.from(prefix).length,
    1,
    "the emoji before the reference must occupy two UTF-16 code units",
  )
  assert.equal(textInRange(consumer, reference.range), "Profile")

  await session.initialize()
  session.openDocument({
    uri: reference.uri,
    languageId: "arkts",
    version: 1,
    text: consumer,
  })
  const response = await session.request("textDocument/definition", {
    textDocument: { uri: reference.uri },
    position: midpoint(reference.range),
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const locations = response.result === null
    ? []
    : Array.isArray(response.result)
      ? response.result
      : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, target.uri)
  assert.deepEqual(locations[0].range, target.range)
  assert.notDeepEqual(locations[0].range.start, locations[0].range.end)
  assert.equal(textInRange(profile, locations[0].range), "Profile")
})

test("preserves an exact unopened class completion from the production list", async (t) => {
  const materialized = await materializeConformanceWorkspace()
  const completion = materialized.cases["completion.unicode"]
  const home = fs.readFileSync(fileURLToPath(completion.uri), "utf8")
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      HOME: path.join(materialized.root, "missing-home"),
      DEVECO_SDK_HOME: path.join(materialized.root, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(async () => {
    try {
      await session.close()
    } finally {
      await fs.promises.rm(materialized.root, { recursive: true, force: true })
    }
  })

  assert.equal(textInRange(home, completion.range), "Gree")
  const initialized = await session.initialize()
  assert.equal(initialized.result.capabilities.completionProvider.resolveProvider, undefined)
  session.openDocument({
    uri: completion.uri,
    languageId: "arkts",
    version: 1,
    text: home,
  })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: completion.uri },
    position: completion.position,
  })

  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const greeters = items.filter((item) => item.label === "Greeter")
  assert.equal(greeters.length, 1, `Expected one Greeter in ${JSON.stringify(items)}`)
  const [greeter] = greeters
  assert.equal(greeter.kind, CompletionItemKind.Class)
  assert.deepEqual(greeter.textEdit, {
    range: completion.range,
    newText: "Greeter",
  })
  assert.ok(greeter.data && typeof greeter.data === "object", "expected opaque completion data")
})

test("completes inherited fields and methods after this dot", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "inherited-this")
  const documentPath = path.join(fixtureRoot, "Derived.ets")
  const documentUri = pathToFileURL(documentPath).href

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
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 2,
    method: "textDocument/completion",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 4, character: 9 },
    },
  })

  const response = await server.response(2)
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const labels = items.map((item) => item.label)
  assert.ok(labels.includes("inheritedTitle"), `Expected inheritedTitle in ${JSON.stringify(labels)}`)
  assert.ok(labels.includes("inheritedRefresh"), `Expected inheritedRefresh in ${JSON.stringify(labels)}`)
})

test("maps a definition in a rewritten ArkTS struct back to source coordinates", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "struct-source-map")
  const documentPath = path.join(fixtureRoot, "Panel.ets")
  const documentUri = pathToFileURL(documentPath).href

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
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 3,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 6, character: 11 },
    },
  })

  const response = await server.response(3)
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, documentUri)
  assert.deepEqual(locations[0].range.start, { line: 3, character: 2 })
})

test("resolves a definition through an import alias and barrel export", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "alias-barrel")
  const documentPath = path.join(fixtureRoot, "Main.ets")
  const targetPath = path.join(fixtureRoot, "models", "Profile.ets")
  const documentUri = pathToFileURL(documentPath).href

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
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: documentUri,
        languageId: "arkts",
        version: 1,
        text: fs.readFileSync(documentPath, "utf8"),
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 4,
    method: "textDocument/definition",
    params: {
      textDocument: { uri: documentUri },
      position: { line: 3, character: 10 },
    },
  })

  const response = await server.response(4)
  const locations = Array.isArray(response.result) ? response.result : [response.result]
  assert.equal(locations.length, 1)
  assert.equal(locations[0].uri, pathToFileURL(targetPath).href)
  assert.deepEqual(locations[0].range.start, { line: 1, character: 2 })
})

function midpoint(range) {
  assert.equal(range.start.line, range.end.line, "the query marker must be single-line")
  return {
    line: range.start.line,
    character: range.start.character
      + Math.floor((range.end.character - range.start.character) / 2),
  }
}

function textInRange(source, range) {
  const lines = source.split("\n")
  assert.equal(range.start.line, range.end.line, "this semantic slice uses single-line ranges")
  return lines[range.start.line].slice(range.start.character, range.end.character)
}
