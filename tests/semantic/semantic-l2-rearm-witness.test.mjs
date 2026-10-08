import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("L2 is rearmed only after a compiler query rebuilds a Program", { timeout: 60_000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l2-witness-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  const logDirectory = path.join(directory, "logs")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ apiVersion: "24", version: "test" }))
  const source = "export class RegistryThing {}\nexport const value = new RegistryThing()\n"
  const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
  fs.writeFileSync(path.join(workspace, "Query.ets"), source)
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdk,
      DEVECO_SDK_HOME: sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_MEMORY_BUDGET_MB: "1024",
      ARKTS_BENCHMARK_CONTROL: "1",
      ARKTS_L01_REARM_TRIM: "1",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
  session.openDocument({ uri, version: 1, text: source })
  await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === 1, 20_000)

  const initialDefinition = await session.request("textDocument/definition", {
    textDocument: { uri }, position: { line: 1, character: 26 },
  }, { timeoutMs: 20_000 })
  assert.equal(initialDefinition.error, undefined, JSON.stringify(initialDefinition.error))
  assert.equal(initialDefinition.result.length, 1)

  const pressure = async () => {
    const response = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
    assert.deepEqual(response.result, { applied: "level2" }, JSON.stringify(response.error))
  }
  await pressure()
  await waitForTrimCount(logDirectory, 1)

  const reuseBeforeInvalid = readEvents(logDirectory).filter(entry => entry.event === "semantic.context.reuse").length
  const invalidRename = async () => {
    const response = await session.request("textDocument/rename", {
      textDocument: { uri }, position: { line: 0, character: 14 }, newName: "not valid",
    }, { timeoutMs: 20_000 })
    assert.deepEqual(response.error, { code: -32602, message: "Rename requires a valid identifier." })
  }
  await invalidRename()
  const reuseAfterInvalid = readEvents(logDirectory).filter(entry => entry.event === "semantic.context.reuse").length
  assert.ok(reuseAfterInvalid > reuseBeforeInvalid,
    "the invalid rename must reach the resident semantic context")
  await pressure()
  await invalidRename() // A second worker request fences the asynchronous pressure control.
  assert.equal(trimCount(logDirectory), 1,
    "an invalid rename must not rearm L2 when it did not rebuild a Program")

  const definition = await session.request("textDocument/definition", {
    textDocument: { uri }, position: { line: 1, character: 26 },
  }, { timeoutMs: 20_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  assert.equal(definition.result.length, 1)
  await pressure()
  await waitForTrimCount(logDirectory, 2)
  assert.equal(trimCount(logDirectory), 2,
    "an actual post-trim compiler rebuild must rearm L2 exactly once")
})

async function waitForTrimCount(logDirectory, expected) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (trimCount(logDirectory) >= expected) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail(`expected ${expected} L2 trims, saw ${trimCount(logDirectory)}`)
}

function trimCount(logDirectory) {
  return readEvents(logDirectory).filter(entry => entry.event === "semantic.context.trim"
    && entry.reason === "memory-level2").length
}

function readEvents(logDirectory) {
  const logFile = path.join(logDirectory, "server.log")
  if (!fs.existsSync(logFile)) return []
  return fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map(JSON.parse)
}
