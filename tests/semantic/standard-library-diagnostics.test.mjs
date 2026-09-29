import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

test("the bundled server loads standard library declarations for ArkTS diagnostics", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-standard-library-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = [
    "const keys = Object.keys({ name: 'ArkTS' })",
    "const values = Array.from([1, 2])",
    "const ready: Promise<number> = Promise.resolve(1)",
    "const included = 'ArkTS'.includes('Ark')",
    "declare function Text(content: string): void",
    "Text('ArkTS')",
    "",
  ].join("\n")
  const file = path.join(root, "Libs.ets")
  fs.writeFileSync(file, source)
  const uri = pathToFileURL(file).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist", "server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(root).href,
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
    },
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })
  const publication = session.transport.notification(
    "textDocument/publishDiagnostics",
    message => message.params.uri === uri && message.params.version === 1,
    10_000,
  )
  session.openDocument({ uri, version: 1, text: source })
  const diagnostics = (await publication).params.diagnostics
  assert.deepEqual(diagnostics, [], JSON.stringify(diagnostics))
  await session.close({ timeoutMs: 5_000 })
})
