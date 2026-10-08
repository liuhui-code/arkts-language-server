import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("default L2 trim is not rearmed by a rebuilt query", { timeout: 60_000 }, async t => {
  await exerciseRegistryTrim(t, false)
})

test("experimental L2 rearm releases each rebuilt Program", { timeout: 60_000 }, async t => {
  await exerciseRegistryTrim(t, true)
})

async function exerciseRegistryTrim(t, rearm) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-registry-trim-"))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  const logDirectory = path.join(directory, "logs")
  const probeFile = path.join(directory, "registry-probe.jsonl")
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ apiVersion: "24", version: "test" }))
  const source = "export class RegistryThing {}\nexport const value = new RegistryThing()\n"
  const sourcePath = path.join(workspace, "Query.ets")
  const uri = pathToFileURL(sourcePath).href
  fs.writeFileSync(sourcePath, source)
  const expected = [0, 1].map(line => ({ uri, range: {
    start: { line, character: line === 0 ? 13 : 25 },
    end: { line, character: line === 0 ? 26 : 38 },
  } }))
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdk,
      DEVECO_SDK_HOME: sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_REFERENCES_TRACE: "1",
      ARKTS_MEMORY_BUDGET_MB: "1024",
      ARKTS_BENCHMARK_CONTROL: "1",
      ...(rearm ? { ARKTS_L01_REARM_TRIM: "1" } : {}),
      ARKTS_L01_REGISTRY_PROBE_FILE: probeFile,
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
  session.openDocument({ uri, version: 1, text: source })
  const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === 1, 20_000)
  assert.deepEqual(diagnostic.params.diagnostics, [], "normal automatic diagnostics remain enabled")

  const references = async () => {
    const response = await session.request("textDocument/references", {
      textDocument: { uri }, position: { line: 0, character: 14 },
      context: { includeDeclaration: true },
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    assert.deepEqual(response.result.map(location => JSON.stringify(location)).sort(),
      expected.map(location => JSON.stringify(location)).sort())
  }
  await references()

  const level2 = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
  assert.deepEqual(level2.result, { applied: "level2" }, JSON.stringify(level2.error))
  await waitForEvent(logDirectory, event => event.event === "semantic.context.trim"
    && event.reason === "memory-level2")

  // The first post-trim query must rebuild the compiler state and remain exact.
  await references()
  // A different semantic capability must observe the same exact symbol.
  const definition = await session.request("textDocument/definition", {
    textDocument: { uri }, position: { line: 1, character: 26 },
  }, { timeoutMs: 20_000 })
  assert.equal(definition.error, undefined,
    `${JSON.stringify(definition.error)}\n${session.transport.stderr}\n${fs.readFileSync(path.join(logDirectory, "server.log"), "utf8")}`)
  assert.deepEqual(definition.result, [expected[0]])

  const rebuiltLevel2 = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
  assert.deepEqual(rebuiltLevel2.result, { applied: "level2" }, JSON.stringify(rebuiltLevel2.error))
  const duplicateLevel2 = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level2" })
  assert.deepEqual(duplicateLevel2.result, { applied: "level2" }, JSON.stringify(duplicateLevel2.error))
  await references()

  const level3 = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
  assert.deepEqual(level3.result, { applied: "level3" }, JSON.stringify(level3.error))
  await waitForEvent(logDirectory, event => event.event === "semantic.context.evict"
    && event.reason === "memory-level3")
  await session.close({ timeoutMs: 5_000 })

  const probes = fs.readFileSync(probeFile, "utf8").trim().split("\n").map(JSON.parse)
  const trims = probes.filter(probe => probe.phase === "before-trim" && probe.sampledSourceFiles > 0)
  assert.equal(trims.length, rearm ? 2 : 1,
    "only the explicit experiment re-arms L2 after a rebuilt query")
  for (const trim of trims) {
    const afterTrim = probes.find(probe => probe.phase === "after-trim"
      && probe.sampleId === trim.sampleId && probe.serviceId === trim.serviceId)
    assert.ok(afterTrim, "L2 must report registry ownership after cleanup")
    assert.equal(afterTrim.totalRefCount, 0,
      `L2 retained ${afterTrim.totalRefCount} sampled SourceFile references after trim`)
  }
  const disposal = probes.filter(probe => probe.phase === "after-dispose"
    && probe.sampledSourceFiles > 0).at(-1)
  assert.ok(disposal, "L3 must dispose the rebuilt LS")
  assert.equal(disposal.totalRefCount, 0,
    `registry retained ${disposal.totalRefCount} sampled SourceFile references after final disposal`)
}

async function waitForEvent(logDirectory, predicate) {
  const logFile = path.join(logDirectory, "server.log")
  const deadline = Date.now() + 5_000
  let observed = []
  while (Date.now() < deadline) {
    if (fs.existsSync(logFile)) {
      const events = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map(JSON.parse)
      observed = events.filter(event => event.event?.startsWith("semantic.context."))
      if (events.some(predicate)) return
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail(`timed out waiting for semantic lifecycle event: ${JSON.stringify(observed)}`)
}
