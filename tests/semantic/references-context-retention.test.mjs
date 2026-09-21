import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("budget-aware references retain the warm interactive context", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-context-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const target = "export class RetainedThing {}\n"
  const query = [
    'import { RetainedThing } from "./Target"',
    "export const query = new RetainedThing()",
    "",
  ].join("\n")
  fs.writeFileSync(path.join(workspace, "Target.ets"), target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)

  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = positionAt(query, query.lastIndexOf("RetainedThing") + 1)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "batched",
      ARKTS_REFERENCES_BATCH_ROOTS: "2",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware",
      ARKTS_REFERENCES_TRACE: "1",
    },
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: queryUri, version: 1, text: query })

  const definition = () => session.request("textDocument/definition", {
    textDocument: { uri: queryUri }, position,
  }, { timeoutMs: 20_000 })
  const references = () => session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  const before = await definition()
  const global = await references()
  const after = await definition()
  assert.equal(before.error, undefined, JSON.stringify(before.error))
  assert.equal(global.error, undefined, JSON.stringify(global.error))
  assert.equal(after.error, undefined, JSON.stringify(after.error))
  assert.deepEqual(after.result, before.result)
  await session.close({ timeoutMs: 5_000 })

  const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  const retention = events.filter(({ event }) => event === "references.context.retention")
  assert.deepEqual(retention.map(event => ({
    profile: event.profile,
    residentBefore: event.residentBefore,
    residentAfter: event.residentAfter,
    removed: event.removed,
  })), [{
    profile: "budget-aware",
    residentBefore: 1,
    residentAfter: 1,
    removed: false,
  }])
})

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
}
