import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("a complete references cache hit returns while automatic diagnostics continue", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-diagnostic-hit-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  fs.mkdirSync(workspace)
  fs.writeFileSync(path.join(workspace, "Target.ets"), "export class CachedThing {}\n")
  const text = [
    'import { CachedThing } from "./Target"',
    "export const value = new CachedThing()",
    "",
  ].join("\n")
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  fs.writeFileSync(path.join(workspace, "Query.ets"), text)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_BATCH_ROOTS: "2",
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "1200",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  session.openDocument({ uri: queryUri, version: 1, text })
  const position = { line: 1, character: text.split("\n")[1].indexOf("CachedThing") + 1 }
  const request = () => session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  const diagnosticLog = (phase, sequence) => session.transport.notification(
    "window/logMessage",
    message => message.params.message.includes(
      `diagnostics test delay ${phase} ${queryUri} ${sequence}`,
    ),
    10_000,
  )

  await diagnosticLog("entered", 1)
  const first = await request()
  assert.equal(first.error, undefined, JSON.stringify(first.error))
  assert.ok(first.result.length > 0)
  await diagnosticLog("entered", 2)
  let diagnosticSettled = false
  const settled = diagnosticLog("settled", 2).then(() => { diagnosticSettled = true })
  const publication = session.transport.notification(
    "textDocument/publishDiagnostics",
    message => message.params.uri === queryUri && message.params.version === 1,
    10_000,
  )
  const started = performance.now()
  const second = await request()
  const elapsedMs = performance.now() - started
  const settledAtResponse = diagnosticSettled
  await settled
  const published = await publication
  assert.equal(second.error, undefined, JSON.stringify(second.error))
  assert.deepEqual(second.result, first.result)
  assert.equal(settledAtResponse, false, "cached references waited for diagnostic quiescence")
  assert.ok(elapsedMs < 500, `cached references took ${elapsedMs.toFixed(1)} ms`)
  assert.equal(published.params.version, 1)
  await session.close({ timeoutMs: 5_000 })
})
