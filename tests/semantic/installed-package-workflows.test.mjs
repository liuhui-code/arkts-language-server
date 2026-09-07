import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { materializeConformanceWorkspace } from "../support/materialize-conformance-workspace.mjs"

test("installed declarations provide fields, methods and fresh member diagnostics", async (t) => {
  const fixture = await installedSession(t)
  const initial = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.deepEqual(initial.params.diagnostics, [])
  const response = await fixture.session.request("textDocument/completion", {
    textDocument: { uri: fixture.uri }, position: { line: 2, character: 5 },
  })
  assert.equal(response.error, undefined)
  const items = Array.isArray(response.result) ? response.result : response.result.items
  assert.equal(items.find((item) => item.label === "value")?.kind, 5)
  assert.equal(items.find((item) => item.label === "read")?.kind, 2)
  const edited = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 2)
  fixture.session.changeDocument({ uri: fixture.uri, version: 2, text: fixture.consumer.replace("read()", "missing()") })
  const diagnostics = (await edited).params.diagnostics
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2339))
  assert.ok(diagnostics.every((diagnostic) => diagnostic.code !== 2307))
})

test("an undeclared installed package does not silently become an available import", async (t) => {
  const fixture = await installedSession(t, async ({ entryManifest }) => {
    await fs.writeFile(entryManifest, "{ dependencies: {} }")
  })
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.ok(diagnostics.params.diagnostics.some((diagnostic) => diagnostic.code === 2307))
})

test("a missing declared types entry does not fall back to a valid runtime main", async (t) => {
  const fixture = await installedSession(t, async ({ installed }) => {
    await fs.rm(path.join(installed, "Index.d.ets"))
    await fs.writeFile(path.join(installed, "oh-package.json5"), "{ types: 'Index.d.ets', main: 'Runtime.ets' }")
    await fs.writeFile(path.join(installed, "Runtime.ets"), "export class Widget { value: number = 1; read(): number { return this.value } }\n")
  })
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.ok(diagnostics.params.diagnostics.some((diagnostic) => diagnostic.code === 2307))
})

test("the module's installed package takes precedence over another root installation", async (t) => {
  const fixture = await installedSession(t, async ({ workspaceRoot }) => {
    const outer = path.join(workspaceRoot, "oh_modules", "@example", "widgets")
    await fs.mkdir(outer, { recursive: true })
    await fs.writeFile(path.join(outer, "oh-package.json5"), "{ types: 'Wrong.d.ets' }")
    await fs.writeFile(path.join(outer, "Wrong.d.ets"), "export declare class Widget { read(): string }\n")
  })
  const response = await fixture.session.request("textDocument/definition", {
    textDocument: { uri: fixture.uri }, position: { line: 1, character: 19 },
  })
  assert.equal(response.error, undefined)
  assert.deepEqual(response.result, [{
    uri: pathToFileURL(path.join(fixture.installed, "Index.d.ets")).href,
    range: { start: { line: 1, character: 21 }, end: { line: 1, character: 27 } },
  }])
})

test("lockfile removal refreshes diagnostics after an installed dependency is removed without a source edit", async (t) => {
  const fixture = await installedSession(t)
  const initial = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.deepEqual(initial.params.diagnostics, [])
  const refreshed = fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1
      && message.params.diagnostics.some((diagnostic) => diagnostic.code === 2307))
  await fs.rm(fixture.installed, { recursive: true, force: true })
  await fs.rm(fixture.lockfile)
  fixture.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(fixture.lockfile).href, type: 3 }] } })
  await refreshed
})

test("an installed link cannot import a package outside the workspace boundary", async (t) => {
  const fixture = await installedSession(t, async ({ corpusRoot, installed }) => {
    const outside = path.join(corpusRoot, "outside-package")
    await fs.cp(installed, outside, { recursive: true })
    await fs.rm(installed, { recursive: true, force: true })
    await fs.symlink(outside, installed, "dir")
  })
  const diagnostics = await fixture.session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === fixture.uri && message.params.version === 1)
  assert.ok(diagnostics.params.diagnostics.some((diagnostic) => diagnostic.code === 2307))
})

async function installedSession(t, beforeStart) {
  const materialized = await materializeConformanceWorkspace()
  let session
  t.after(async () => {
    try { if (session) await session.close() }
    finally { await fs.rm(materialized.root, { recursive: true, force: true }) }
  })
  const installed = path.join(materialized.workspaceRoot, "entry", "oh_modules", "@example", "widgets")
  const source = path.join(materialized.workspaceRoot, "entry", "src", "main", "ets", "InstalledConsumer.ets")
  const declaration = "// 😀 SDK-style declaration\nexport declare class Widget { value: number; read(): number }\n"
  const consumer = "import { Widget } from '@example/widgets'\nconst item = new Widget()\nitem.read()\n"
  const entryManifest = path.join(materialized.workspaceRoot, "entry", "oh-package.json5")
  const lockfile = path.join(materialized.workspaceRoot, "oh-package-lock.json5")
  await fs.mkdir(installed, { recursive: true })
  await fs.writeFile(path.join(installed, "oh-package.json5"), "{ types: 'Index.d.ets' }")
  await fs.writeFile(path.join(installed, "Index.d.ets"), declaration)
  await fs.writeFile(entryManifest, "{ dependencies: { '@example/widgets': '^1.0.0' } }")
  await fs.writeFile(lockfile, "{}")
  await fs.writeFile(source, consumer)
  await beforeStart?.({ ...materialized, installed, entryManifest, lockfile })
  const uri = pathToFileURL(source).href
  session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(materialized.corpusRoot, "sdk", "openharmony"),
      ARKTS_LSP_LOG_DIR: path.join(materialized.root, "logs"),
      ARKTS_INDEX_CACHE_DIR: path.join(materialized.root, "cache"),
    },
    rootUri: pathToFileURL(materialized.workspaceRoot).href,
  })
  await session.initialize()
  session.openDocument({ uri, version: 1, text: consumer })
  return { ...materialized, installed, session, uri, consumer, declaration, lockfile }
}
