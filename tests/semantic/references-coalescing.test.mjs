import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("identical references share verification while each client owns cancellation", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-coalescing-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const target = "export class SharedThing {}\n"
  const query = [
    'import { SharedThing } from "./Target"',
    "export const query = new SharedThing()",
    "",
  ].join("\n")
  fs.writeFileSync(path.join(workspace, "Target.ets"), target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)

  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const position = positionAt(query, query.lastIndexOf("SharedThing") + 1)
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
      ARKTS_TEST_REFERENCE_VERIFIER_DELAY_MS: "600",
    },
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: queryUri, version: 1, text: query })

  sendReferences(session, 10, queryUri, position, true)
  await waitForEventCount(logDirectory, "references.batch.start", 1)
  sendReferences(session, 11, queryUri, position, true)
  const [first, second] = await Promise.all([
    session.transport.response(10, 20_000),
    session.transport.response(11, 20_000),
  ])
  assert.equal(first.error, undefined, JSON.stringify(first.error))
  assert.equal(second.error, undefined, JSON.stringify(second.error))
  assert.deepEqual(sortedLocations(second.result), sortedLocations(first.result))

  sendReferences(session, 12, queryUri, position, false)
  await waitForEventCount(logDirectory, "references.batch.start", 2)
  sendReferences(session, 13, queryUri, position, false)
  await waitForEventCount(logDirectory, "references.coalesced", 2)
  session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 12 } })
  const [cancelled, survivor] = await Promise.all([
    session.transport.response(12, 20_000),
    session.transport.response(13, 20_000),
  ])
  assert.equal(cancelled.error?.code, -32800)
  assert.equal(survivor.error, undefined, JSON.stringify(survivor.error))
  assert.ok(survivor.result.length > 0)

  session.changeDocument({ uri: queryUri, version: 2, text: `${query}// version 2\n` })
  sendReferences(session, 14, queryUri, position, true)
  await waitForEventCount(logDirectory, "references.batch.start", 3)
  sendReferences(session, 15, queryUri, position, true)
  await waitForEventCount(logDirectory, "references.coalesced", 3)
  session.changeDocument({ uri: queryUri, version: 3, text: `${query}// version 3\n` })
  const [staleFirst, staleSecond] = await Promise.all([
    session.transport.response(14, 20_000),
    session.transport.response(15, 20_000),
  ])
  assert.equal(staleFirst.error?.code, -32801)
  assert.equal(staleSecond.error?.code, -32801)

  sendReferences(session, 16, queryUri, position, true)
  const fresh = await session.transport.response(16, 20_000)
  assert.equal(fresh.error, undefined, JSON.stringify(fresh.error))
  assert.deepEqual(sortedLocations(fresh.result), sortedLocations(first.result))
  await session.close({ timeoutMs: 5_000 })

  const events = readEvents(logDirectory)
  assert.equal(events.filter(({ event }) => event === "references.batch.complete").length, 3)
  assert.equal(events.filter(({ event }) => event === "references.coalesced").length, 3)
})

function sendReferences(session, id, uri, position, includeDeclaration) {
  session.transport.send({
    jsonrpc: "2.0", id, method: "textDocument/references",
    params: { textDocument: { uri }, position, context: { includeDeclaration } },
  })
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  const line = prefix.split("\n").length - 1
  return { line, character: prefix.length - prefix.lastIndexOf("\n") - 1 }
}

function sortedLocations(locations) {
  return [...locations].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function readEvents(logDirectory) {
  const logPath = path.join(logDirectory, "server.log")
  if (!fs.existsSync(logPath)) return []
  return fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}

async function waitForEventCount(logDirectory, event, count, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (readEvents(logDirectory).filter(entry => entry.event === event).length >= count) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out waiting for ${count} ${event} events`)
}
