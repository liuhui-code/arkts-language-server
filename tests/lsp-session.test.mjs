import assert from "node:assert/strict"
import { once } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { applyTextEdits } from "./support/lsp-edits.mjs"
import { LspSession } from "./support/lsp-session.mjs"
import { projectRoot, withTimeout } from "./support/lsp-process.mjs"

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

test("sends an applied document edit through didChange before the next request", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-session-change-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const documentUri = pathToFileURL(path.join(workspaceRoot, "EditedProfile.ets")).href
  const session = new LspSession({
    command: process.execPath,
    args: ["dist/server.cjs", "--stdio"],
    cwd: projectRoot,
    env: { ARKTS_LSP_LOG_DIR: path.join(workspaceRoot, "logs") },
    rootUri: pathToFileURL(workspaceRoot).href,
    capabilities: { general: { positionEncodings: ["utf-16"] } },
  })
  t.after(() => session.close())

  const original = [
    "struct EditedProfile {",
    "  build(): void {",
    "    this.",
    "  }",
    "}",
  ].join("\n")
  const updated = applyTextEdits(original, [{
    range: {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 0 },
    },
    newText: "  editedTitle: string = \"Ready\"\n  persistEdit(): void {}\n",
  }])

  await session.initialize()
  session.openDocument({ uri: documentUri, version: 1, text: original })
  session.changeDocument({ uri: documentUri, version: 2, text: updated })
  const response = await session.request("textDocument/completion", {
    textDocument: { uri: documentUri },
    position: { line: 4, character: 9 },
  })
  const items = Array.isArray(response.result) ? response.result : response.result?.items ?? []
  const labels = items.map(({ label }) => label)

  assert.equal(response.error, undefined)
  assert.ok(labels.includes("editedTitle"), `Expected editedTitle in ${JSON.stringify(labels)}`)
  assert.ok(labels.includes("persistEdit"), `Expected persistEdit in ${JSON.stringify(labels)}`)
})

test("rejects a didChange version that does not advance the opened document", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-session-version-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const documentUri = pathToFileURL(path.join(workspaceRoot, "Versioned.ets")).href
  const session = new LspSession({
    command: process.execPath,
    args: ["dist/server.cjs", "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspaceRoot).href,
  })
  t.after(() => session.close())

  await session.initialize()
  session.openDocument({ uri: documentUri, version: 7, text: "struct Versioned {}" })

  assert.throws(
    () => session.changeDocument({ uri: documentUri, version: 7, text: "struct Versioned {}" }),
    /didChange version 7 must be greater than 7/i,
  )
})

test("close immediately reports a session already terminated by SIGTERM", async (t) => {
  const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-session-signal-"))
  t.after(() => fs.rmSync(logDirectory, { recursive: true, force: true }))
  const session = new LspSession({
    command: process.execPath,
    args: ["dist/server.cjs", "--stdio"],
    cwd: projectRoot,
    env: { ARKTS_LSP_LOG_DIR: logDirectory },
    rootUri: pathToFileURL(path.join(projectRoot, "fixtures", "basic")).href,
  })
  t.after(() => session.transport.close())

  await session.initialize()
  const exited = once(session.transport.child, "exit")
  assert.equal(session.transport.child.kill("SIGTERM"), true)
  assert.deepEqual(await exited, [null, "SIGTERM"])

  const first = await withTimeout(
    session.close({ timeoutMs: 500 }),
    100,
    "session.close() waited after the child had already exited by signal",
  )
  const second = await session.close()

  assert.deepEqual(first, { shutdown: null, exit: { code: null, signal: "SIGTERM" } })
  assert.strictEqual(second, first)
})
