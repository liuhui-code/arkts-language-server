import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("references recover indexed batching after a newer catalog generation commits", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-resync-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const targetPath = path.join(workspace, "Target.ets")
  const target = "export class Thing {}\n"
  const query = [
    'import { Thing } from "./Target"',
    "export const query = new Thing()",
    "",
  ].join("\n")
  const use = [
    'import { Thing } from "./Target"',
    "export const use = new Thing()",
    "",
  ].join("\n")
  fs.writeFileSync(targetPath, target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(workspace, "Use.ets"), use)

  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = positionAt(query, query.lastIndexOf("Thing") + 1)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(
        projectRoot,
        "tests",
        "fixtures",
        "index",
        "scripted-catalog-sidecar.mjs",
      ),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_SCENARIO: "reference-direct-import-anchor",
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create",
    () => true,
    10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(
    create.params.token,
    message => message.params.value.kind === "end",
    10_000,
  )
  session.openDocument({ uri: queryUri, version: 1, text: query })

  const references = (includeDeclaration) => session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration },
  }, { timeoutMs: 20_000 })
  const indexed = await references(true)
  assert.equal(indexed.error, undefined, JSON.stringify(indexed.error))

  fs.writeFileSync(targetPath, `${target}// catalog refresh\n`)
  session.transport.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(targetPath).href, type: 2 }] },
  })
  const fallback = await references(false)
  assert.equal(fallback.error, undefined, JSON.stringify(fallback.error))
  assert.ok(fallback.result.length > 0)
  await waitUntil(() => audit(auditPath)
    .filter(request => request.method === "catalog/start").length === 2)
  await new Promise(resolve => setTimeout(resolve, 1_100))

  const recovered = await references(true)
  assert.equal(recovered.error, undefined, JSON.stringify(recovered.error))
  assert.deepEqual(sortedLocations(recovered.result), sortedLocations(indexed.result))
  await session.close({ timeoutMs: 5_000 })

  const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(events.filter(({ event }) => event === "references.index.accepted").length, 2)
  assert.ok(events.some(({ event, reason }) => (
    event === "references.index.fallback" && reason === "workspace-changed"
  )))
  assert.ok(events.some(({ event }) => event === "references.index.recovered"))
  assert.equal(audit(auditPath)
    .filter(request => request.method === "references/candidates").length, 2)
})

function audit(auditPath) {
  return fs.readFileSync(auditPath, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

async function waitUntil(predicate, timeoutMs = 5_000) {
  const deadline = performance.now() + timeoutMs
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("timed out waiting for index refresh")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

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
