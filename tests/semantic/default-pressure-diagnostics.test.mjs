import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { diagnostic, waitForEvent } from "../support/semantic-recycle-lsp.mjs"

test("persistent pressure uses default transient diagnosis without benchmark opt-in",
  { timeout: 60_000 }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-default-pressure-"))
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    const workspace = path.join(directory, "workspace")
    const sdk = path.join(directory, "sdk")
    const logs = path.join(directory, "logs")
    fs.mkdirSync(workspace)
    fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
    fs.mkdirSync(path.join(sdk, "toolchains"))
    fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
    fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
      JSON.stringify({ apiVersion: "24", version: "test" }))
    const source = "export class AlphaThing {}\nexport const alpha = new AlphaThing()\n"
    const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
    fs.writeFileSync(path.join(workspace, "Query.ets"), source)
    const cleared = Object.fromEntries(Object.keys(process.env)
      .filter(key => key.startsWith("ARKTS_")).map(key => [key, undefined]))
    const session = new LspSession({ command: process.execPath,
      args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"], cwd: projectRoot,
      rootUri: pathToFileURL(workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: { ...cleared, ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
        ARKTS_REFERENCES_TRACE: "1",
        // A functional L3 intervention, not a change to the normal 1024 MiB budget.
        ARKTS_MEMORY_BUDGET_MB: "1", ARKTS_BENCHMARK_CONTROL: "0" },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000, initializationOptions: { sdk: { path: sdk } } })
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    await waitForEvent(logs, event => event.event === "semantic.context.evict"
      || event.event === "diagnostics.transient.complete")
    const events = () => fs.readFileSync(path.join(logs, "server.log"), "utf8")
      .split("\n").filter(Boolean).map(JSON.parse)
    const before = events().filter(event => event.event === "semantic.context.create").length
    const changed = source + "export const broken = notDefinedName\n"
    session.changeDocument({ uri, version: 2, text: changed })
    const latest = (await diagnostic(session, uri, 2)).params
    assert.deepEqual(latest.diagnostics.map(item => item.code), [2304])
    assert.deepEqual(latest.diagnostics[0].range, {
      start: { line: 2, character: 22 }, end: { line: 2, character: 36 },
    })
    await waitForEvent(logs, event => event.event === "diagnostics.transient.complete"
      && event.documentVersion === 2)
    assert.equal(events().filter(event => event.event === "semantic.context.create").length, before)
    const control = await session.request("arkts/benchmark/applyMemoryPressure", { level: "level3" })
    assert.equal(control.error?.code, -32601)
    assert.ok(!events().some(event => event.event === "semantic.worker.pressure-recycle.complete"))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
    assert.doesNotMatch(session.transport.stderr, /semantic worker fatal/)
  })
