import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"

/** Independent fresh, normal diagnosis after the workflow; no candidate answer is prequeried. */
export async function freshWorkflowDiagnostics(fixture, version, text) {
  const cache = fs.mkdtempSync(path.join(path.dirname(fixture.workspace), "diagnostic-control-"))
  const uri = pathToFileURL(path.join(fixture.workspace, "entry/src/main/ets/Main.ets")).href
  const session = new LspSession({ command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"], cwd: projectRoot,
    rootUri: pathToFileURL(fixture.workspace).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: { ARKTS_INDEX_CACHE_DIR: cache,
      ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"),
      ARKTS_LSP_LOG_DIR: path.join(cache, "logs") },
  })
  try {
    await session.initialize({ initializationOptions: { sdk: { path: fixture.sdk } }, timeoutMs: 30_000 })
    session.openDocument({ uri, version, text })
    return await session.transport.notification("textDocument/publishDiagnostics",
      message => message.params?.uri === uri && message.params?.version === version, 10_000)
  } finally {
    const closed = await session.close({ timeoutMs: 10_000 })
    assert.deepEqual(closed.exit, { code: 0, signal: null })
  }
}
