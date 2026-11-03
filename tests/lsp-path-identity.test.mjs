import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { LspSession } from "./support/lsp-session.mjs"
import { projectRoot } from "./support/lsp-process.mjs"

const runtime = process.env.ARKTS_PATH_TEST_RUNTIME ?? path.join(projectRoot, "dist")
const sidecar = path.join(projectRoot, "target", "release",
  process.platform === "win32" ? "arkts-index-sidecar.exe" : "arkts-index-sidecar")

test("real LSP keeps edited members and definitions across physical case aliases", { timeout: 30_000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-path-"))
  const root = path.join(directory, "MixedCase")
  fs.mkdirSync(root)
  const candidateAlias = path.join(directory, "mixedcase")
  const alias = fs.existsSync(candidateAlias) ? candidateAlias : root
  t.diagnostic(alias === root ? "case-sensitive filesystem: use distinct canonical spelling"
    : "case-insensitive filesystem: exercise verified directory alias")
  const file = path.join(root, "KeptCase.ts")
  const text = "export class Box {\n  keptCase: number = 1\n  use() { return this.keptCase }\n}\n"
  fs.writeFileSync(file, text)
  let uri = pathToFileURL(path.join(alias, "KeptCase.ts")).href
  if (process.platform === "win32") uri = uri.replace(/^file:\/\/\/([A-Z]):/, (_, drive) => `file:///${drive.toLowerCase()}:`)
  const session = new LspSession({
    args: [path.join(runtime, "server.cjs"), "--stdio"], rootUri: pathToFileURL(root).href,
    env: { ARKTS_LSP_LOG_DIR: path.join(directory, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(directory, "index"),
      ARKTS_INDEX_SIDECAR_PATH: sidecar },
  })
  t.after(async () => {
    try { await session.close() }
    finally { await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  })
  await session.initialize()
  session.openDocument({ uri, version: 1, text })
  const completion = async () => {
    const response = await session.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 2, character: 22 },
    }, { timeoutMs: 15_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return Array.isArray(response.result) ? response.result : response.result.items
  }
  assert.ok((await completion()).some(item => item.label === "keptCase"))
  const definition = await session.request("textDocument/definition", {
    textDocument: { uri }, position: { line: 2, character: 25 },
  })
  assert.equal(definition.error, undefined)
  assert.equal(definition.result.length, 1)
  const actual = fs.statSync(fileURLToPath(definition.result[0].uri))
  const expected = fs.statSync(file)
  assert.deepEqual([actual.dev, actual.ino], [expected.dev, expected.ino])
  assert.equal(path.basename(fileURLToPath(definition.result[0].uri)), "KeptCase.ts")
  assert.equal(definition.result[0].range.start.line, 1)
  session.changeDocument({ uri, version: 2, text: text.replaceAll("keptCase", "newCase") })
  const updated = await completion()
  assert.ok(updated.some(item => item.label === "newCase"))
  assert.equal(updated.some(item => item.label === "keptCase"), false)
})

test("real native index opens and returns mixed-case filenames through LSP", { timeout: 30_000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-native-path-"))
  const file = path.join(directory, "KeptCase.ts")
  fs.writeFileSync(file, "export class PathIdentityService {}\n")
  const session = new LspSession({
    args: [path.join(runtime, "server.cjs"), "--stdio"], rootUri: pathToFileURL(directory).href,
    env: { ARKTS_LSP_LOG_DIR: path.join(directory, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(directory, "index"),
      ARKTS_INDEX_SIDECAR_PATH: sidecar },
  })
  t.after(async () => {
    try { await session.close() }
    finally { await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  })
  await session.initialize()
  let symbols = []
  const deadline = performance.now() + 15_000
  while (performance.now() < deadline) {
    const response = await session.request("workspace/symbol", { query: "PathIdentityService" })
    assert.equal(response.error, undefined)
    symbols = response.result
    if (symbols.length > 0) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(symbols.length, 1, session.transport.stderr)
  assert.equal(path.basename(fileURLToPath(symbols[0].location.uri)), "KeptCase.ts")
})

test("real LSP resolves relative imports across lexical and native realpath spellings", { timeout: 30_000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-realpath-spelling-"))
  const physical = path.join(directory, "PhysicalWorkspace"), lexical = path.join(directory, "LexicalWorkspace")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(physical)
  fs.symlinkSync(physical, lexical, process.platform === "win32" ? "junction" : "dir")
  fs.mkdirSync(path.join(sdk, "ets/component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets/component/common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets/oh-uni-package.json"), JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  const main = 'import { neverQueried } from "./Unopened"\nexport const result = neverQueried()\n'
  fs.writeFileSync(path.join(physical, "Main.ets"), main)
  fs.writeFileSync(path.join(physical, "Unopened.ets"), "export function neverQueried(): number { return 1 }\n")
  const uri = name => pathToFileURL(path.join(lexical, name)).href
  const session = new LspSession({
    args: [path.join(runtime, "server.cjs"), "--stdio"], rootUri: pathToFileURL(lexical).href,
    env: { ARKTS_LSP_LOG_DIR: path.join(directory, "logs"), ARKTS_INDEX_CACHE_DIR: path.join(directory, "index"),
      ARKTS_INDEX_SIDECAR_PATH: sidecar, ARKTS_MEMORY_BUDGET_MB: undefined,
      ARKTS_TEST_REALPATH_LEXICAL_ROOT: lexical,
      NODE_OPTIONS: "--require=" + JSON.stringify(path.join(projectRoot, "tests/fixtures/lexical-realpath-alias.cjs")) },
  })
  t.after(async () => {
    try { await session.close() }
    finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  })
  await session.initialize({ initializationOptions: { sdk: { path: sdk } } })
  const prepared = await session.transport.notification("arkts/semanticPreparation", row => row.params.phase === "complete", 15_000)
  const definition = file => session.request("textDocument/definition", {
    textDocument: { uri: uri(file) }, position: { line: 1, character: 23 },
  })
  const baseline = await definition("Main.ets")
  assert.equal(prepared.params.report.semanticState, "ready", JSON.stringify({ report: prepared.params.report, baseline }))
  const expected = [{ uri: uri("Unopened.ets"), range: {
    start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
  } }]
  assert.deepEqual(baseline.result, expected, JSON.stringify(baseline))
  const callable = "export function pendingCall(): number { return neverQueried() }\n"
  session.openDocument({ uri: uri("Unsaved.ets"), version: 1, text: main + callable })
  const unsaved = await definition("Unsaved.ets")
  assert.deepEqual(unsaved.result, expected, JSON.stringify(unsaved))
  assert.equal(fs.existsSync(path.join(physical, "Unsaved.ets")), false, "the open overlay has no disk leaf")
  const hierarchy = await session.request("textDocument/prepareCallHierarchy", {
    textDocument: { uri: uri("Unsaved.ets") }, position: { line: 2, character: 18 },
  })
  assert.equal(hierarchy.error, undefined, JSON.stringify(hierarchy))
  assert.deepEqual(hierarchy.result.map(({ name, uri, range, selectionRange }) => ({ name, uri, range, selectionRange })),
    [{ name: "pendingCall", uri: uri("Unsaved.ets"), range: {
      start: { line: 2, character: 0 }, end: { line: 2, character: callable.trimEnd().length },
    }, selectionRange: { start: { line: 2, character: 16 }, end: { line: 2, character: 27 } } }])
  assert.deepEqual((await session.close({ timeoutMs: 5000 })).exit, { code: 0, signal: null })
})
