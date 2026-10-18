import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"
import { selectedL03Policy } from "./resident-interactive-lsp.mjs"

export async function startReadinessFixture(t, env = {}) {
  const fixture = createReadinessFixture(t, env)
  return initializeReadinessFixture(fixture)
}

export async function initializeReadinessFixture(fixture) {
  const { session, sdk, events, rootUri } = fixture
  await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 10_000 })
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  const terminal = await session.transport.progress(create.params.token,
    message => message.params.value.kind === "end", 10_000)
  assert.equal(terminal.params.value.kind, "end")
  const candidate = events().find(e => e.event === "index.catalog.terminal")
  assert.equal(candidate?.phase, "ready")
  assert.equal(candidate.indexedFiles, 2)
  const prepared = await session.transport.notification("arkts/semanticPreparation",
    message => message.params.rootUri === rootUri && message.params.phase === "complete", 20_000)
  fixture.initialPreparation = prepared.params.report
  return fixture
}

/** Same production fixture, before its public initialize transcript. */
export function createReadinessFixture(t, env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-semantic-ready-"))
  const workspace = path.join(directory, "workspace")
  const sdk = path.join(directory, "sdk")
  const sources = {
    "Main.ets": 'import { neverQueried } from "./Unopened"\nexport const result = neverQueried()\n',
    "Unopened.ets": "export function neverQueried(): number { return 1 }\n",
  }
  fs.mkdirSync(workspace)
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  fs.writeFileSync(path.join(sdk, "ets", "oh-uni-package.json"), JSON.stringify({ path: "ets", apiVersion: "24", version: "test" }))
  for (const [name, content] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), content)
  const rootUri = pathToFileURL(workspace).href
  const logFile = path.join(directory, "logs", "server.log")
  const sessionOptions = {
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri, capabilities: { window: { workDoneProgress: true },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: { ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
      ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: path.dirname(logFile),
      ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
      ARKTS_BENCHMARK_CONTROL: "1", ARKTS_L02_SAME_CONTENT_PROMOTION: "1",
      ARKTS_REFERENCES_STRATEGY: "indexed-batched", ARKTS_REFERENCES_SDK_AMBIENT_PROFILE: "full",
      ARKTS_REFERENCES_TRACE: "1", ARKTS_MEMORY_BUDGET_MB: "1024", ...selectedL03Policy, ...env },
  }
  const session = new LspSession(sessionOptions)
  const sessions = [session]
  t.after(async () => {
    for (const live of [...sessions].reverse()) await live.close().catch(() => {})
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const events = () => fs.readFileSync(logFile, "utf8").trim().split("\n").map(JSON.parse)
  return { directory, workspace, sdk, rootUri, session, events, sources,
    startSession: () => { const live = new LspSession(sessionOptions); sessions.push(live); return live },
    uri: name => pathToFileURL(path.join(workspace, name)).href }
}
