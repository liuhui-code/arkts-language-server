import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { createTestResourceScope } from "../support/test-resource-scope.mjs"

for (const trace of [undefined, "0", "1"]) {
test(`a complete references cache hit returns while automatic diagnostics continue (queue trace ${trace ?? "default"})`, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-reference-diagnostic-hit-"))
  const track = createTestResourceScope(t, () => fs.rmSync(root, { recursive: true, force: true }))
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
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(path.join(sdk, "ets/component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets/component/common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets/oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "diagnostic-cache-test" }))
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdk,
      DEVECO_SDK_HOME: sdk,
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_BATCH_ROOTS: "2",
      ARKTS_SEMANTIC_QUEUE_TRACE: trace,
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "1200",
    },
  })
  track(() => session.close())
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
  const ready = await session.request("arkts/semanticReadiness", {
    rootUri: pathToFileURL(workspace).href, prepare: true,
  })
  assert.equal(ready.error, undefined, JSON.stringify(ready))
  assert.equal(ready.result.semanticState, "ready", "a hit test must actually own a qualified complete Program")
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
  t.diagnostic(JSON.stringify({ cacheResponseMs: elapsedMs, targetMs: 500, withinTarget: elapsedMs <= 500,
    diagnosticSettledAtResponse: settledAtResponse, timingIsHardGate: false }))
  assert.equal(published.params.version, 1)
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  const events = fs.readFileSync(path.join(root, "logs", "server.log"), "utf8").trim().split("\n").map(JSON.parse)
  assert.equal(events.filter(entry => entry.event === "references.cache.store").length, 1)
  assert.equal(events.filter(entry => entry.event === "references.cache.hit").length, 1)
  const waits = events.filter(entry => entry.event === "references.diagnostics.wait.started")
  const settledWaits = events.filter(entry => entry.event === "references.diagnostics.wait.settled")
  if (trace !== "1") {
    assert.deepEqual([waits, settledWaits], [[], []], "default and explicit0 must not observe diagnostic waiting")
    return
  }
  assert.equal(waits.length, 2, "both complete search and Worker-backed cache proof own a suspension barrier")
  assert.equal(settledWaits.length, 2)
  for (let index = 0; index < waits.length; index++) {
    const wait = waits[index], done = settledWaits[index]
    assert.equal(wait.uri, queryUri)
    assert.equal(wait.documentVersion, 1)
    assert.equal(done.diagnosticWaitId, wait.diagnosticWaitId)
    assert.equal(done.uri, queryUri)
    assert.equal(done.outcome, "settled")
    assert.ok(Number.isFinite(wait.monotonicMs) && wait.monotonicMs >= 0)
    assert.ok(done.monotonicMs >= wait.monotonicMs)
    assert.equal(done.diagnosticQuiescenceWaitMs, done.monotonicMs - wait.monotonicMs)
  }
  t.diagnostic(JSON.stringify({ qualification: "PRIVATE_DELAY_DIAGNOSTIC_WAIT_BOUNDARY_NOT_NORMAL_COMPILER_COST",
    waits, settledWaits, firstResult: first.result, cachedResult: second.result, latestDiagnostics: published.params }))
})
}
