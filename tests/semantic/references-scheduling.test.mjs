import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("interactive definition bypasses references and an edit cancels the old snapshot", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-scheduling-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const query = [
    'import { ScheduledThing } from "./Target"',
    "export const query = new ScheduledThing()",
    "",
  ].join("\n")
  fs.writeFileSync(path.join(workspace, "Target.ets"), "export class ScheduledThing {}\n")
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(workspace, "Use.ets"), [
    'import { ScheduledThing } from "./Target"',
    "export const use = new ScheduledThing()",
    "",
  ].join("\n"))

  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = positionAt(query, query.lastIndexOf("ScheduledThing") + 1)
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
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "1500",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: queryUri, version: 1, text: query })

  const references = session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  let referencesSettled = false
  void references.then(
    () => { referencesSettled = true },
    () => { referencesSettled = true },
  )
  await waitForEvent(logDirectory, "references.batch.start")

  const definition = await session.request("textDocument/definition", {
    textDocument: { uri: queryUri }, position,
  }, { timeoutMs: 10_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  assert.equal(referencesSettled, false, "definition waited for the global references request")
  const hover = await session.request("textDocument/hover", {
    textDocument: { uri: queryUri }, position,
  }, { timeoutMs: 10_000 })
  assert.equal(hover.error, undefined, JSON.stringify(hover.error))
  assert.equal(referencesSettled, false, "hover waited for the global references request")

  session.changeDocument({ uri: queryUri, version: 2, text: `${query}// changed\n` })
  const staleReferences = await references
  assert.deepEqual(staleReferences.error, {
    code: -32801,
    message: "References request is stale",
  })
  const currentDefinition = await session.request("textDocument/definition", {
    textDocument: { uri: queryUri }, position,
  }, { timeoutMs: 10_000 })
  assert.equal(currentDefinition.error, undefined, JSON.stringify(currentDefinition.error))
  assert.deepEqual(currentDefinition.result, definition.result)
  await session.close({ timeoutMs: 5_000 })

  const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  const interactive = events.filter(({ event }) => event === "references.interactive.start")
  assert.deepEqual(interactive.map(({ method }) => method), ["define", "hover"])
  assert.ok(interactive.every(({ queueWaitMs }) => queueWaitMs >= 0 && queueWaitMs < 250))
})

async function waitForEvent(logDirectory, event, timeoutMs = 10_000) {
  const logPath = path.join(logDirectory, "server.log")
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    const events = fs.existsSync(logPath)
      ? fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).map(JSON.parse)
      : []
    if (events.some(entry => entry.event === event)) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${event}`)
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
}
