import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

test("watched create delete and rename are visible to the immediately following semantic request", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-lsp-"))
  const workspaceRoot = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspaceRoot)
  const serverPath = path.join(temporaryRoot, "server.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
  })
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const oldPath = path.join(workspaceRoot, "OldType.ets")
  const createdPath = path.join(workspaceRoot, "CreatedType.ets")
  const renamedPath = path.join(workspaceRoot, "RenamedType.ets")
  const mainLines = [
    "struct Home {",
    "  build() {",
    "    const created = Crea",
    "    const oldValue = Old",
    "    const renamed = Rena",
    "  }",
    "}",
  ]
  const mainText = mainLines.join("\n")
  fs.writeFileSync(mainPath, mainText, "utf8")
  fs.writeFileSync(oldPath, "export class OldType {}\n", "utf8")
  const mainUri = pathToFileURL(mainPath).href
  const rootUri = pathToFileURL(workspaceRoot).href
  const server = new LspProcess({
    serverPath,
    env: {
      HOME: path.join(temporaryRoot, "missing-home"),
      DEVECO_SDK_HOME: path.join(temporaryRoot, "missing-deveco"),
      ARKLINE_HARMONY_SDK_PATH: path.join(temporaryRoot, "missing-sdk"),
      ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, "logs"),
    },
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
      rootUri,
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
        uri: mainUri,
        languageId: "arkts",
        version: 1,
        text: mainText,
      },
    },
  })

  const beforeCreate = await completionLabels(server, 2, mainUri, {
    line: 2,
    character: mainLines[2].length,
  })
  assert.equal(beforeCreate.includes("CreatedType"), false)
  const beforeRename = await completionLabels(server, 3, mainUri, {
    line: 3,
    character: mainLines[3].length,
  })
  assert.ok(beforeRename.includes("OldType"), JSON.stringify(beforeRename))

  fs.writeFileSync(createdPath, "export class CreatedType {}\n", "utf8")
  watchedFiles(server, [{ uri: pathToFileURL(createdPath).href, type: 1 }])
  const afterCreate = await completionLabels(server, 4, mainUri, {
    line: 2,
    character: mainLines[2].length,
  })
  assert.ok(afterCreate.includes("CreatedType"), JSON.stringify(afterCreate))

  fs.unlinkSync(createdPath)
  watchedFiles(server, [{ uri: pathToFileURL(createdPath).href, type: 3 }])
  const afterDelete = await completionLabels(server, 5, mainUri, {
    line: 2,
    character: mainLines[2].length,
  })
  assert.equal(afterDelete.includes("CreatedType"), false, JSON.stringify(afterDelete))

  fs.renameSync(oldPath, renamedPath)
  fs.writeFileSync(renamedPath, "export class RenamedType {}\n", "utf8")
  watchedFiles(server, [
    { uri: pathToFileURL(oldPath).href, type: 3 },
    { uri: pathToFileURL(renamedPath).href, type: 1 },
  ])
  const afterRename = await completionLabels(server, 6, mainUri, {
    line: 4,
    character: mainLines[4].length,
  })
  assert.ok(afterRename.includes("RenamedType"), JSON.stringify(afterRename))
  const oldAfterRename = await completionLabels(server, 7, mainUri, {
    line: 3,
    character: mainLines[3].length,
  })
  assert.equal(oldAfterRename.includes("OldType"), false, JSON.stringify(oldAfterRename))
  assert.equal(
    server.diagnosticSnapshot().transcript.entries.some((entry) => (
      entry.direction === "receive" && entry.method === "client/registerCapability"
    )),
    false,
    "clients without watched-files dynamic registration support must not be registered",
  )
})

test("dynamically registers bounded source and ArkUI resource watchers when supported", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-register-"))
  const workspaceRoot = path.join(temporaryRoot, "workspace")
  fs.mkdirSync(workspaceRoot)
  const serverPath = path.join(temporaryRoot, "server.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
  })
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const mainText = [
    "struct Profile {",
    "  title: string = \"\"",
    "  build() {",
    "    this.",
    "  }",
    "}",
  ].join("\n")
  fs.writeFileSync(mainPath, mainText, "utf8")
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
  const rootUri = pathToFileURL(workspaceRoot).href
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri,
      capabilities: {
        workspace: {
          didChangeWatchedFiles: { dynamicRegistration: true },
        },
        window: { workDoneProgress: true },
      },
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })

  const registration = await server.serverRequest("client/registerCapability")
  assert.equal(registration.params.registrations.length, 1)
  assert.equal(
    registration.params.registrations[0].method,
    "workspace/didChangeWatchedFiles",
  )
  assert.deepEqual(registration.params.registrations[0].registerOptions, {
    watchers: [
      { globPattern: "**/*.ets" },
      { globPattern: "**/*.ts" },
      { globPattern: "**/resources/*/element/string.json" },
    ],
  })

  const progressCreate = await server.serverRequest("window/workDoneProgress/create")
  server.send({ jsonrpc: "2.0", id: progressCreate.id, result: null })
  const mainUri = pathToFileURL(mainPath).href
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri: mainUri,
        languageId: "arkts",
        version: 1,
        text: mainText,
      },
    },
  })
  const labels = await completionLabels(server, 2, mainUri, { line: 3, character: 9 })
  assert.ok(labels.includes("title"), JSON.stringify(labels))

  server.send({ jsonrpc: "2.0", id: registration.id, result: null })
})

function watchedFiles(server, changes) {
  server.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: { changes },
  })
}

async function completionLabels(server, id, uri, position) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/completion",
    params: { textDocument: { uri }, position },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  return items.map((item) => item.label)
}
