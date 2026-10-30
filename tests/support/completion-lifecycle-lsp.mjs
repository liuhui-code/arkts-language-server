import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { LspSession } from "./lsp-session.mjs"
import { projectRoot } from "./lsp-process.mjs"

export async function startCompletionLifecycle(t, { preload } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-completion-lifetime-"))
  const workspace = path.join(directory, "workspace")
  fs.mkdirSync(workspace)
  const sources = {
    "Alpha.ets": 'export class Alpha {\n  /** documented member */\n  title = "alpha"\n  run() { return this.title }\n}\n',
    "Unrelated.ets": "export const unrelated = 1\n",
  }
  for (const [name, text] of Object.entries(sources)) fs.writeFileSync(path.join(workspace, name), text)
  const sdk = path.join(projectRoot, "fixtures/conformance/v1/sdk/openharmony")
  const env = Object.fromEntries(Object.keys(process.env)
    .filter(key => /^(ARKTS_|ARKLINE_|OP00_|DEGRADED_|UI_CAUSE_|PHOTOS_)/u.test(key))
    .map(key => [key, undefined]))
  Object.assign(env, {
    NODE_OPTIONS: preload ? `--require=${JSON.stringify(preload.replaceAll("\\", "/"))}` : "", ARKLINE_HARMONY_SDK_PATH: sdk,
    ARKTS_LSP_LOG_DIR: path.join(directory, "logs"),
    ARKTS_INDEX_CACHE_DIR: path.join(directory, "index"),
    ARKTS_INDEX_SIDECAR_PATH: path.join(projectRoot, "target/release/arkts-index-sidecar"
      + (process.platform === "win32" ? ".exe" : "")),
  })
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: workspace, rootUri: pathToFileURL(workspace).href, env,
    capabilities: JSON.parse(fs.readFileSync(path.join(projectRoot, "tests/fixtures/zed-1.25.3-capabilities.json"), "utf8")),
  })
  const wire = [], operations = []
  const record = session.transport.recordTranscript.bind(session.transport)
  session.transport.recordTranscript = (direction, message, bytes) => {
    wire.push({ at: Date.now(), mono: performance.now(), direction, message })
    const result = record(direction, message, bytes)
    if (direction === "receive" && message.method && message.id !== undefined) {
      assert.ok(["client/registerCapability", "window/workDoneProgress/create", "workspace/configuration"].includes(message.method))
      session.transport.send({ jsonrpc: "2.0", id: message.id,
        result: message.method === "workspace/configuration" ? message.params.items.map(() => null) : null })
    }
    return result
  }
  t.after(async () => {
    const closed = await session.close({ timeoutMs: 10_000 })
    if (process.env.COMPLETION_LIFECYCLE_EVIDENCE) {
      const output = path.join(process.env.COMPLETION_LIFECYCLE_EVIDENCE, path.basename(directory))
      fs.mkdirSync(output, { recursive: true })
      fs.writeFileSync(path.join(output, "wire.ndjson"), wire.map(row => JSON.stringify(row)).join("\n") + "\n")
      fs.writeFileSync(path.join(output, "operations.json"), JSON.stringify({ test: t.name, operations, closed }, null, 2))
      fs.writeFileSync(path.join(output, "stderr.txt"), session.transport.stderr)
      fs.cpSync(path.join(directory, "logs"), path.join(output, "logs"), { recursive: true })
    }
    fs.rmSync(directory, { recursive: true, force: true })
  })
  await session.initialize({ initializationOptions: { sdk: { path: sdk } }, timeoutMs: 20_000 })
  await session.transport.notification("arkts/semanticPreparation",
    message => ["complete", "failed"].includes(message.params.phase), 30_000)
  const uri = name => pathToFileURL(path.join(workspace, name)).href
  const closeDocument = name => {
    session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: uri(name) } } })
    session.documentVersions.delete(uri(name))
  }
  const request = async (method, params) => {
    const row = { id: session.nextRequestId, method, params, start: performance.now() }
    operations.push(row)
    try { return row.response = await session.request(method, params, { timeoutMs: 20_000 }) }
    finally { row.elapsedMs = performance.now() - row.start }
  }
  const list = async () => {
    const response = await request("textDocument/completion", {
      textDocument: { uri: uri("Alpha.ets") }, position: { line: 3, character: 22 },
    })
    assert.equal(response.error, undefined, JSON.stringify(response))
    const item = response.result.items.find(entry => entry.label === "title")
    assert.ok(item, JSON.stringify(response))
    return item
  }
  session.openDocument({ uri: uri("Alpha.ets"), version: 0, text: sources["Alpha.ets"] })
  return { session, sources, uri, closeDocument, request, list, wire }
}
