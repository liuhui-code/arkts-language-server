import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess, projectRoot } from "../support/lsp-process.mjs"

test("resolves a definition through an import alias and barrel export", async (t) => {
  const server = new LspProcess()
  t.after(() => server.close())
  const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "alias-barrel")
  const documentPath = path.join(fixtureRoot, "Main.ets")
  const targetPath = path.join(fixtureRoot, "models", "Profile.ets")
  const targetSource = fs.readFileSync(targetPath, "utf8")
  const targetName = "displayName"
  const targetNameOffset = targetSource.indexOf(targetName)
  assert.notEqual(targetNameOffset, -1)
  const targetRange = {
    start: positionAt(targetSource, targetNameOffset),
    end: positionAt(targetSource, targetNameOffset + targetName.length),
  }
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
  assert.deepEqual(locations[0].range, targetRange)
  assert.notDeepEqual(locations[0].range.start, locations[0].range.end)
  assert.equal(textInRange(targetSource, locations[0].range), targetName)
})

function positionAt(source, offset) {
  const before = source.slice(0, offset)
  const line = before.split("\n").length - 1
  const lineStart = before.lastIndexOf("\n") + 1
  return { line, character: offset - lineStart }
}

function textInRange(source, range) {
  const lines = source.split("\n")
  assert.equal(range.start.line, range.end.line, "this semantic slice uses single-line ranges")
  return lines[range.start.line].slice(range.start.character, range.end.character)
}
