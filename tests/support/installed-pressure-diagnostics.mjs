import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { LspSession } from "./lsp-session.mjs"
import { diagnostic, waitForEvent } from "./semantic-recycle-lsp.mjs"
import { completeLogEvents } from "./complete-log-events.mjs"

/** Run the actual installed bundles; the 1 MiB budget is a functional L3 intervention. */
export async function assertInstalledPressureDiagnostics({ node = process.execPath, server, sidecar, directory, env = {} }) {
  const workspace = path.join(directory, "workspace"), sdk = path.join(directory, "sdk")
  const logs = path.join(directory, "logs")
  fs.mkdirSync(workspace, { recursive: true })
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"),
    JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  const source = "export class AlphaThing {}\nexport const alpha = new AlphaThing()\n"
  const uri = pathToFileURL(path.join(workspace, "Query.ets")).href
  fs.writeFileSync(path.join(workspace, "Query.ets"), source)
  const cleared = Object.fromEntries(Object.keys(process.env)
    .filter(key => key.startsWith("ARKTS_")).map(key => [key, undefined]))
  const session = new LspSession({ command: node, args: [server, "--stdio"], cwd: directory,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: { ...cleared, ...env, NODE_OPTIONS: undefined, ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
      ARKTS_INDEX_SIDECAR_PATH: sidecar, ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"),
      ARKTS_LSP_LOG_DIR: logs, ARKTS_REFERENCES_TRACE: "1",
      ARKTS_MEMORY_BUDGET_MB: "1", ARKTS_BENCHMARK_CONTROL: "0" },
  })
  const events = () => completeLogEvents(path.join(logs, "server.log"))
  const definition = async () => assert.deepEqual((await session.request("textDocument/definition", {
    textDocument: { uri }, position: { line: 1, character: 27 },
  }, { timeoutMs: 15_000 })).result, [{ uri, range: {
    start: { line: 0, character: 13 }, end: { line: 0, character: 23 },
  } }])
  try {
    await session.initialize({ timeoutMs: 15_000, initializationOptions: { sdk: { path: sdk } } })
    const prepared = await session.transport.notification("arkts/semanticPreparation",
      message => ["complete", "failed"].includes(message.params.phase), 15_000)
    assert.equal(prepared.params.report?.semanticState, "ready", JSON.stringify(prepared))
    session.openDocument({ uri, version: 1, text: source })
    assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
    await definition()
    session.changeDocument({ uri, version: 2, text: source + "export const broken = notDefinedName\n" })
    const latest = (await diagnostic(session, uri, 2)).params
    assert.deepEqual(latest.diagnostics.map(item => item.code), [2304])
    assert.deepEqual(latest.diagnostics[0].range, {
      start: { line: 2, character: 22 }, end: { line: 2, character: 36 },
    })
    await waitForEvent(logs, event => event.event === "diagnostics.transient.complete"
      && event.documentVersion === 2)
    await definition()
    assert.equal(events().filter(event => event.event === "semantic.worker.started").length, 1)
    assert.ok(!events().some(event => /semantic\.worker\.(?:recovery|pressure-recycle)/.test(event.event)))
    assert.ok(!session.transport.messages.some(message => message.method === "window/logMessage"
      && /ArkTS diagnostics failed/.test(message.params.message)))
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  } finally {
    await session.close().catch(() => {})
  }
}
