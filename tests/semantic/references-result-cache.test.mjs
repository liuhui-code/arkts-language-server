import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("repeated complete references reuse the result and an overlay edit invalidates it", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-cache-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const target = "export class CachedThing {}\n"
  const query = [
    'import { CachedThing } from "./Target"',
    "export const query = new CachedThing()",
    "",
  ].join("\n")
  const use = [
    'import { CachedThing } from "./Target"',
    "export const use = new CachedThing()",
    "",
  ].join("\n")
  fs.writeFileSync(path.join(workspace, "Target.ets"), target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(workspace, "Use.ets"), use)

  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = positionAt(query, query.lastIndexOf("CachedThing") + 1)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_BATCH_ROOTS: "2",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: queryUri, version: 1, text: query })

  const request = () => session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  const first = await request()
  const second = await request()
  assert.equal(first.error, undefined, JSON.stringify(first.error))
  assert.equal(second.error, undefined, JSON.stringify(second.error))
  assert.deepEqual(sortedLocations(second.result), sortedLocations(first.result))
  session.changeDocument({ uri: queryUri, version: 2, text: `${query}// unsaved comment\n` })
  const afterEdit = await request()
  assert.equal(afterEdit.error, undefined, JSON.stringify(afterEdit.error))
  assert.deepEqual(sortedLocations(afterEdit.result), sortedLocations(first.result))
  await session.close({ timeoutMs: 5_000 })

  const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(events.filter(({ event }) => event === "references.cache.miss").length, 2)
  assert.equal(events.filter(({ event }) => event === "references.cache.store").length, 2)
  assert.equal(events.filter(({ event }) => event === "references.cache.hit").length, 1)
  assert.equal(
    events.filter(({ event }) => event === "references.candidate-selection.complete").length,
    2,
  )
  assert.equal(events.filter(({ event }) => event === "references.batch.complete").length, 2)
})

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
}

function sortedLocations(locations) {
  return [...locations].sort((left, right) => (
    left.uri.localeCompare(right.uri)
      || left.range.start.line - right.range.start.line
      || left.range.start.character - right.range.start.character
      || left.range.end.line - right.range.end.line
      || left.range.end.character - right.range.end.character
  ))
}
