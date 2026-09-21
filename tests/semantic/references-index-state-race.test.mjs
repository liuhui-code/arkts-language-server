import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

for (const anchorMode of ["direct", "definition"]) test(
  `references ${anchorMode} anchor falls back when the index starts warming`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-index-race-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  const auditPath = path.join(root, "index-audit.ndjson")
  fs.mkdirSync(workspace)
  const query = 'import { Thing } from "./Target"\nexport const query = new Thing()\n'
  fs.writeFileSync(path.join(workspace, "Target.ets"), "export class Thing {}\n")
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(workspace, "Use.ets"),
    'import { Thing } from "./Target"\nexport const use = new Thing()\n')
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = { line: 1, character: query.split("\n")[1].indexOf("Thing") + 1 }
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "tests", "fixtures", "index",
        "references-warming-after-candidates.mjs"),
      ARKTS_INDEX_TEST_AUDIT: auditPath,
      ARKTS_INDEX_TEST_ANCHOR: anchorMode,
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
    },
    capabilities: { window: { workDoneProgress: true } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const create = await session.transport.serverRequest(
    "window/workDoneProgress/create", () => true, 10_000,
  )
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token,
    message => message.params.value.kind === "end", 10_000)
  session.openDocument({ uri: queryUri, version: 1, text: query })

  const response = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position,
    context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  assert.equal(response.error, undefined, JSON.stringify(response.error))
  const locations = response.result.map(location => location.uri)
  assert.ok(locations.includes(pathToFileURL(path.join(workspace, "Use.ets")).href),
    "complete references must include the file omitted from stale candidates")
  await session.close({ timeoutMs: 5_000 })

  const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(events.filter(event => event.event === "references.index.accepted").length, 0)
  assert.ok(events.some(event => event.event === "references.index.fallback"))
  const requests = fs.readFileSync(auditPath, "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.ok(requests.some(request => request.method === "references/candidates"))
  assert.ok(requests.some(request => request.method === "status"))
})
