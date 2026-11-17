import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { createReadinessFixture, initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const sdkReady of [false, true]) test(
  `references cache requires a complete Program proof across overlay edits: ${sdkReady ? "qualified SDK" : "missing SDK"}`, async (t) => {
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
  const sdk = path.join(root, "sdk")
  if (sdkReady) {
    fs.mkdirSync(path.join(sdk, "ets/component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets/component/common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets/oh-uni-package.json"),
      JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  }
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    env: {
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKLINE_HARMONY_SDK_PATH: sdk,
      DEVECO_SDK_HOME: sdk,
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
  const readiness = () => session.request("arkts/semanticReadiness",
    { rootUri: pathToFileURL(workspace).href, prepare: true })
  assert.equal((await readiness()).result?.semanticState, sdkReady ? "ready" : "partial")
  const first = await request()
  const second = await request()
  assert.equal(first.error, undefined, JSON.stringify(first.error))
  assert.equal(second.error, undefined, JSON.stringify(second.error))
  assert.deepEqual(sortedLocations(second.result), sortedLocations(first.result))
  session.changeDocument({ uri: queryUri, version: 2, text: `${query}// unsaved comment\n` })
  const afterEdit = await request()
  assert.equal(afterEdit.error, undefined, JSON.stringify(afterEdit.error))
  assert.deepEqual(sortedLocations(afterEdit.result), sortedLocations(first.result))
  const beforeRebuild = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(beforeRebuild.filter(row => row.event === "references.cache.store").length, sdkReady ? 1 : 0,
    "a complete batched answer must not create a cache proof from a stale or incomplete resident Program")
  if (sdkReady) {
    assert.equal((await readiness()).result?.semanticState, "ready")
    for (let index = 0; index < 2; index++) {
      const qualified = await request()
      assert.equal(qualified.error, undefined, JSON.stringify(qualified.error))
      assert.deepEqual(sortedLocations(qualified.result), sortedLocations(first.result))
    }
  }
  await session.close({ timeoutMs: 5_000 })

  const events = fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")
    .split("\n").filter(Boolean).map(JSON.parse)
  assert.equal(events.filter(({ event }) => event === "references.cache.miss").length, 3)
  assert.equal(events.filter(({ event }) => event === "references.cache.store").length, sdkReady ? 2 : 0)
  assert.equal(events.filter(({ event }) => event === "references.cache.hit").length, sdkReady ? 2 : 0)
  assert.equal(
    events.filter(({ event }) => event === "references.candidate-selection.complete").length,
    3,
  )
  assert.equal(events.filter(({ event }) => event === "references.batch.complete").length, 3)
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


for (const sdkReady of [false, true]) test(
  `legacy optional cache separates incomplete and qualified source proof (sdkReady=${sdkReady})`, async t => {
    const f = createReadinessFixture(t, { ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0", ARKTS_MEMORY_BUDGET_MB: undefined })
    if (!sdkReady) fs.rmSync(path.join(f.sdk, "ets/oh-uni-package.json"))
    await initializeReadinessFixture(f)
    const uri = f.uri("Main.ets")
    f.session.openDocument({ uri, version: 1, text: f.sources["Main.ets"] })
    const proof = await f.session.request("arkts/semanticReadiness", { rootUri: f.rootUri, prepare: true })
    assert.equal(proof.error, undefined, JSON.stringify(proof))
    assert.equal(proof.result.semanticState, sdkReady ? "ready" : "partial")
    const results = []
    for (let n = 0; n < 2; n++) {
      const result = await f.session.request("textDocument/references", { textDocument: { uri },
        position: { line: 1, character: 23 }, context: { includeDeclaration: true } })
      assert.equal(result.error, undefined, JSON.stringify(result))
      assert.equal(result.result.length, 3)
      assert.ok(result.result.some(row => row.uri === f.uri("Unopened.ets")))
      results.push(result.result)
    }
    assert.deepEqual(results[0], results[1])
    assert.deepEqual((await f.session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
    const events = f.events()
    assert.equal(events.filter(row => row.event === "references.cache.store").length, sdkReady ? 1 : 0)
    assert.equal(events.filter(row => row.event === "references.cache.hit").length, sdkReady ? 1 : 0)
  })
