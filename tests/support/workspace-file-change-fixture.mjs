// Shared public LSP fixture and probes for workspace watch regressions.
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { LspProcess, projectRoot } from "./lsp-process.mjs"

export function watchedFiles(server, changes) {
  server.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: { changes },
  })
}

export async function completionLabels(server, id, uri, position) {
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

export async function referenceUris(server, id, uri, position) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/references",
    params: {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  return (response.result ?? []).map((location) => location.uri).sort()
}

export async function hoverText(server, id, uri, position) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/hover",
    params: { textDocument: { uri }, position },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  return response.result?.contents?.value ?? ""
}

export async function nestedDefinitionScenario(t, { targetEts = false, targetTs = false } = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-watched-cross-root-"))
  const outerRoot = path.join(temporaryRoot, "outer")
  const nestedRoot = path.join(outerRoot, "nested")
  fs.mkdirSync(nestedRoot, { recursive: true })
  const serverPath = path.join(temporaryRoot, "server.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "server.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: serverPath,
  })
  const mainPath = path.join(outerRoot, "Main.ets")
  const targetTsPath = path.join(nestedRoot, "Target.ts")
  const targetEtsPath = path.join(nestedRoot, "Target.ets")
  const mainLines = [
    "import { target } from \"./nested/Target\"",
    "export const selected = target()",
  ]
  const mainText = mainLines.join("\n")
  fs.writeFileSync(mainPath, mainText, "utf8")
  if (targetTs) {
    fs.writeFileSync(
      targetTsPath,
      "export function target(): string { return 'ts' }\n",
      "utf8",
    )
  }
  if (targetEts) {
    fs.writeFileSync(
      targetEtsPath,
      "export function target(): string { return 'ets' }\n",
      "utf8",
    )
  }
  const mainUri = pathToFileURL(mainPath).href
  const targetTsUri = pathToFileURL(targetTsPath).href
  const targetEtsUri = pathToFileURL(targetEtsPath).href
  const rootUri = pathToFileURL(outerRoot).href
  const workspaceFolders = [outerRoot, nestedRoot].map((root, index) => ({
    name: index === 0 ? "outer" : "nested",
    uri: pathToFileURL(root).href,
  }))
  const servers = []
  t.after(async () => {
    try {
      for (const server of servers.reverse()) await server.close()
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
  return {
    nestedRoot,
    mainUri,
    targetTsUri,
    targetEtsUri,
    targetEtsPath,
    definitionPosition: {
      line: 1,
      character: mainLines[1].indexOf("target") + 2,
    },
    async openServer() {
      const server = new LspProcess({
        serverPath,
        env: {
          HOME: path.join(temporaryRoot, "missing-home"),
          DEVECO_SDK_HOME: path.join(temporaryRoot, "missing-deveco"),
          ARKLINE_HARMONY_SDK_PATH: path.join(temporaryRoot, "missing-sdk"),
          ARKTS_LSP_LOG_DIR: path.join(temporaryRoot, `logs-${servers.length}`),
        },
      })
      servers.push(server)
      server.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          processId: process.pid,
          rootUri,
          workspaceFolders,
          capabilities: { general: { positionEncodings: ["utf-16"] } },
        },
      })
      const initialized = await server.response(1)
      assert.equal(initialized.result?.capabilities?.definitionProvider, true)
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
      return server
    },
  }
}

export async function definitionTargetUri(server, id, uri, position) {
  server.send({
    jsonrpc: "2.0",
    id,
    method: "textDocument/definition",
    params: { textDocument: { uri }, position },
  })
  const response = await server.response(id)
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const locations = response.result === null
    ? []
    : Array.isArray(response.result)
      ? response.result
      : [response.result]
  assert.equal(locations.length, 1, JSON.stringify(response.result))
  return locations[0].uri ?? locations[0].targetUri
}
