import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("a full legacy references query restores the bounded local definition scope", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-global-scope-restoration-"))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  const logs = path.join(root, "logs")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")

  const target = "export class TargetType {}\n"
  const query = 'import { TargetType } from "./Target"\n'
    + 'const emoji = "😀"\nexport const query = new TargetType()\n'
  const extra = 'import { TargetType } from "./Target"\n'
    + "export const unrelated = new TargetType()\n"
  const targetUri = pathToFileURL(path.join(workspace, "Target.ets")).href
  const queryUri = pathToFileURL(path.join(workspace, "Query.ets")).href
  const extraUri = pathToFileURL(path.join(workspace, "Extra.ets")).href
  fs.writeFileSync(path.join(workspace, "Target.ets"), target)
  fs.writeFileSync(path.join(workspace, "Query.ets"), query)
  fs.writeFileSync(path.join(workspace, "Extra.ets"), extra)

  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { general: { positionEncodings: ["utf-16"] },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"), ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "budget-aware",
      ARKTS_INTERACTIVE_PROJECT_ROOT_PROFILE: "closure",
      ARKTS_SEMANTIC_SESSION_REUSE: "experimental",
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
  session.openDocument({ uri: queryUri, version: 1, text: query })
  const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === queryUri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostic.params.diagnostics, [])

  const position = positionAt(query, query.lastIndexOf("TargetType") + 1)
  const expectedDefinition = [{ uri: targetUri, range: rangeOf(target, "TargetType") }]
  const before = await definition()
  assert.deepEqual(before, expectedDefinition)
  const preReferenceStats = lastDefinitionStats()
  assert.equal(preReferenceStats.programProjectRootFiles, 2,
    "the first local definition should admit only Query and its imported Target")

  const references = await session.request("textDocument/references", {
    textDocument: { uri: queryUri }, position, context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  assert.equal(references.error, undefined, JSON.stringify(references.error))
  assert.deepEqual((references.result ?? []).map(JSON.stringify).sort(), [
    { uri: targetUri, range: rangeOf(target, "TargetType") },
    { uri: queryUri, range: rangeOf(query, "TargetType") },
    { uri: queryUri, range: rangeOfLast(query, "TargetType") },
    { uri: extraUri, range: rangeOf(extra, "TargetType") },
    { uri: extraUri, range: rangeOfLast(extra, "TargetType") },
  ].map(JSON.stringify).sort())

  const after = await definition()
  assert.deepEqual(after, expectedDefinition)
  const postReferenceStats = lastDefinitionStats()
  assert.equal(postReferenceStats.programProjectRootFiles, preReferenceStats.programProjectRootFiles,
    `local definition Program roots grew after full references: ${preReferenceStats.programProjectRootFiles} -> ${postReferenceStats.programProjectRootFiles}`)
  assert.ok(events().some(entry => entry.event === "semantic.context.evict"
    && entry.reason === "reference-global-scope" && entry.leaseCount === 0))
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })

  async function definition() {
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: queryUri }, position,
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return response.result ?? []
  }

  function lastDefinitionStats() {
    const stats = events().filter(entry => entry.event === "semantic.definition.complete").at(-1)
    assert.ok(Number.isSafeInteger(stats?.programSourceFiles) && stats.programSourceFiles > 0,
      "opt-in public trace must report the definition Program size")
    return { programSourceFiles: stats.programSourceFiles,
      programProjectFiles: stats.programProjectFiles,
      programProjectRootFiles: stats.programProjectRootFiles }
  }

  function events() {
    return fs.readFileSync(path.join(logs, "server.log"), "utf8")
      .split("\n").filter(Boolean).map(JSON.parse)
  }
})

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1,
    character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeOf(source, name) {
  const start = source.indexOf(name)
  return { start: positionAt(source, start), end: positionAt(source, start + name.length) }
}

function rangeOfLast(source, name) {
  const start = source.lastIndexOf(name)
  return { start: positionAt(source, start), end: positionAt(source, start + name.length) }
}
