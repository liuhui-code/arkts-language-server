import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "./support/lsp-session.mjs"
import { projectRoot } from "./support/lsp-process.mjs"

test("initializes an injected real server target and closes through shutdown then exit", async (t) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-session-"))
  t.after(() => fs.rmSync(logDirectory, { recursive: true, force: true }))

  const session = new LspSession({
    command: process.execPath,
    args: ["dist/server.cjs", "--stdio"],
    cwd: projectRoot,
    env: { ARKTS_LSP_LOG_DIR: logDirectory },
    rootUri: pathToFileURL(path.join(projectRoot, "fixtures", "basic")).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(() => session.close())

  const initialized = await session.initialize()

  assert.equal(initialized.result.serverInfo.name, "arkts-language-server")
  assert.equal(initialized.result.capabilities.positionEncoding, "utf-16")

  const closed = await session.close({ timeoutMs: 2_000 })

  assert.equal(closed.shutdown.result, null)
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.equal(fs.existsSync(path.join(logDirectory, "server.log")), true)
})
