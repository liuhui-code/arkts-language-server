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
