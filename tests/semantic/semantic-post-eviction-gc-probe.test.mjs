import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("opt-in post-L3 probe measures GC in the semantic Worker without changing exact LSP results",
  { timeout: 60_000 }, async t => {
    const { session, logDirectory } = await replayL3(t, { exposeGc: true, probeFlag: true })
    const probe = await waitForEvent(logDirectory,
      event => event.event === "semantic.post-eviction.gc-probe" && event.status === "complete")
    assert.equal(probe.trigger, "explicit-control")
    assert.equal(probe.evictedContextCount, 1)
    assert.equal(probe.residentContextCount, 0)
    assert.equal(probe.leaseCount, 0)
    assert.equal(probe.gcCount, 2)
    assert.ok(probe.gcElapsedMs >= 0)
    assert.ok(probe.pid > 0 && probe.threadId > 0)
    assert.ok(probe.epochMs > 0 && probe.monotonicNs > 0)
    for (const prefix of ["before", "after"]) {
      for (const key of ["rssBytes", "heapUsedBytes", "heapTotalBytes", "externalBytes", "arrayBuffersBytes"]) {
        const field = `${prefix}${key[0].toUpperCase()}${key.slice(1)}`
        assert.ok(probe[field] >= 0, `missing ${field}`)
      }
    }
    assert.equal("uri" in probe, false, "trace must not expose source paths")
    const repeated = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.deepEqual(repeated.result, { applied: "level3" }, JSON.stringify(repeated.error))
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(loggedEvents(logDirectory).filter(event => event.event === "semantic.post-eviction.gc-probe")
      .length, 1, "repeated L3 without a newly evicted context must not force another GC")
    await session.close({ timeoutMs: 5_000 })
  })

test("post-L3 GC probe stays disabled without its opt-in flag", { timeout: 60_000 }, async t => {
  const { session, logDirectory } = await replayL3(t, { exposeGc: true, probeFlag: false })
  await new Promise(resolve => setTimeout(resolve, 100))
  await session.close({ timeoutMs: 5_000 })
  assert.equal(loggedEvents(logDirectory).some(event => event.event === "semantic.post-eviction.gc-probe"),
    false, "an ordinary L3 eviction must not schedule the GC probe")
})

test("probe flag alone cannot force GC outside benchmark control", { timeout: 60_000 }, async t => {
  const { session, logDirectory } = await replayL3(t, {
    exposeGc: true, probeFlag: true, benchmarkControl: false, pressure: "automatic",
  })
  await new Promise(resolve => setTimeout(resolve, 100))
  await session.close({ timeoutMs: 5_000 })
  assert.equal(loggedEvents(logDirectory).some(event => event.event === "semantic.post-eviction.gc-probe"),
    false, "the benchmark gate must remain closed")
})

test("automatic L3 sampling also probes only after a real context eviction",
  { timeout: 60_000 }, async t => {
    const { session, logDirectory } = await replayL3(t, {
      exposeGc: true, probeFlag: true, pressure: "automatic",
    })
    const probe = await waitForEvent(logDirectory,
      event => event.event === "semantic.post-eviction.gc-probe" && event.status === "complete")
    assert.equal(probe.trigger, "automatic-sample")
    assert.equal(probe.residentContextCount, 0)
    assert.equal(probe.leaseCount, 0)
    await session.close({ timeoutMs: 5_000 })
  })

test("post-L3 GC probe reports inconclusive when Worker GC is unavailable",
  { timeout: 60_000 }, async t => {
    const { session, logDirectory } = await replayL3(t, { exposeGc: false, probeFlag: true })
    const probe = await waitForEvent(logDirectory, event => event.event === "semantic.post-eviction.gc-probe")
    assert.equal(probe.status, "inconclusive")
    assert.equal(probe.reason, "gc-unavailable")
    assert.equal("gcCount" in probe, false)
    await session.close({ timeoutMs: 5_000 })
  })

async function replayL3(t, { exposeGc, probeFlag, benchmarkControl = true, pressure = "explicit" }) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-l3-gc-probe-"))
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
    const source = "export class ProbeThing {}\nexport const use = new ProbeThing()\n"
    const sourcePath = path.join(workspace, "Query.ets")
    const uri = pathToFileURL(sourcePath).href
    fs.writeFileSync(sourcePath, source)
    const session = new LspSession({
      command: process.execPath,
      args: [...(exposeGc ? ["--expose-gc"] : []), path.join(projectRoot, "dist/server.cjs"), "--stdio"],
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
        ARKTS_MEMORY_BUDGET_MB: pressure === "automatic" ? "1" : "1024",
        ARKTS_BENCHMARK_CONTROL: benchmarkControl ? "1" : "0",
        NODE_OPTIONS: "",
        ARKTS_L01_POST_EVICTION_GC_PROBE: probeFlag ? "1" : "0",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    session.openDocument({ uri, version: 1, text: source })
    const diagnostic = await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri && message.params.version === 1, 20_000)
    assert.deepEqual(diagnostic.params.diagnostics, [], "automatic diagnostics remain enabled")

    const references = await session.request("textDocument/references", {
      textDocument: { uri }, position: { line: 0, character: 14 },
      context: { includeDeclaration: true },
    }, { timeoutMs: 20_000 })
    assert.equal(references.error, undefined, JSON.stringify(references.error))
    const expected = [0, 1].map(line => {
      const character = source.split("\n")[line].indexOf("ProbeThing")
      return { uri, range: { start: { line, character },
        end: { line, character: character + "ProbeThing".length } } }
    })
    assert.deepEqual(references.result.map(JSON.stringify).sort(), expected.map(JSON.stringify).sort())

    if (pressure === "explicit") {
      const control = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
      assert.deepEqual(control.result, { applied: "level3" }, JSON.stringify(control.error))
    }
    await waitForEvent(logDirectory, event => event.event === "semantic.context.evict"
      && event.reason === "memory-level3")
    return { session, logDirectory }
}

function loggedEvents(logDirectory) {
  const logFile = path.join(logDirectory, "server.log")
  return fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map(JSON.parse) : []
}

async function waitForEvent(logDirectory, predicate) {
  const deadline = Date.now() + 10_000
  let observed = []
  while (Date.now() < deadline) {
    const events = loggedEvents(logDirectory)
    observed = events.filter(event => event.event?.startsWith("semantic."))
    const match = events.find(predicate)
    if (match) return match
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.fail(`timed out waiting for post-eviction probe: ${JSON.stringify(observed)}`)
}
