import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("legacy references preserve an already loaded unimported global for later local queries", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-global-warm-reference-"))
  const workspace = path.join(root, "workspace")
  const sdk = path.join(root, "sdk")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")

  const target = "const face = '😀'\nclass TargetType {}\n"
  const query = "const query = new TargetType()\n"
  const extra = "const extra = new TargetType()\n"
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
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_SEMANTIC_SESSION_REUSE: "experimental",
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE: "workspace",
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(root, { recursive: true, force: true })
  })
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
  session.openDocument({ uri: queryUri, version: 1, text: query })
  await diagnostics(1)

  // Completion intentionally admits all workspace roots. The declaration is
  // global and unimported, so a later local dependency closure cannot find it.
  const completion = await request("textDocument/completion", {
    textDocument: { uri: queryUri }, position: positionAt(query, query.indexOf("TargetType")),
  })
  const items = Array.isArray(completion) ? completion : completion.items
  assert.ok(items.some(item => item.label === "TargetType"))

  const warmQuery = "// warmed global 😀\n" + query
  session.changeDocument({ uri: queryUri, version: 2, text: warmQuery })
  assert.deepEqual((await diagnostics(2)).params.diagnostics, [])
  const position = positionAt(warmQuery, warmQuery.lastIndexOf("TargetType") + 1)
  const expectedDefinition = [{ uri: targetUri, range: rangeOf(target, "TargetType") }]
  const before = await definition(warmQuery)
  assert.deepEqual(before, expectedDefinition)

  const references = await request("textDocument/references", {
    textDocument: { uri: queryUri }, position,
    context: { includeDeclaration: true },
  })
  assert.deepEqual(references.map(JSON.stringify).sort(), [
    { uri: targetUri, range: rangeOf(target, "TargetType") },
    { uri: queryUri, range: rangeOf(warmQuery, "TargetType") },
    { uri: extraUri, range: rangeOf(extra, "TargetType") },
  ].map(JSON.stringify).sort())

  const after = await definition(warmQuery)
  const editedQuery = "// after references 😀\n" + warmQuery
  session.changeDocument({ uri: queryUri, version: 3, text: editedQuery })
  const afterDiagnostics = await diagnostics(3)
  assert.deepEqual({ definition: after, diagnostics: afterDiagnostics.params.diagnostics.map(value => ({
    code: value.code, range: value.range,
  })) }, { definition: before, diagnostics: [] },
  "references must preserve the loaded global for later definition and diagnostics")
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })

  async function definition(source) {
    return request("textDocument/definition", {
      textDocument: { uri: queryUri },
      position: positionAt(source, source.lastIndexOf("TargetType") + 1),
    })
  }

  async function request(method, params) {
    const response = await session.request(method, params, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return response.result ?? []
  }

  function diagnostics(version) {
    return session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === queryUri && message.params.version === version, 20_000)
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
