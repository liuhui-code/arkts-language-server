import assert from "node:assert/strict"
import { buildSync } from "esbuild"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

for (const code of ["content-modified", "unexpected-failure"]) {
  test(`obsolete workspace diagnosis reports only unexpected errors: ${code}`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-diagnostic-error-"))
    const serverPath = path.join(root, "server.cjs")
    buildSync({ entryPoints: [path.join(projectRoot, "tests/fixtures/lsp/diagnostic-invalidation-server.ts")],
      bundle: true, platform: "node", target: "node20", format: "cjs", outfile: serverPath })
    const server = new LspProcess({ serverPath, env: { ARKTS_TEST_DIAGNOSTIC_ERROR: code } })
    t.after(async () => { await server.close(); fs.rmSync(root, { recursive: true, force: true }) })
    const notify = (method, params) => server.send({ jsonrpc: "2.0", method, params })
    server.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      rootUri: pathToFileURL(root).href, capabilities: {}, processId: process.pid,
    } })
    assert.equal((await server.response(1)).error, undefined)
    notify("initialized", {})
    const a = pathToFileURL(path.join(root, "A.ets")).href
    const b = pathToFileURL(path.join(root, "B.ets")).href
    notify("textDocument/didOpen", { textDocument: { uri: a, languageId: "arkts", version: 1, text: "" } })
    await server.notification("window/logMessage", ({ params }) => params.message === "fixture diagnosis entered")
    notify("textDocument/didOpen", { textDocument: { uri: b, languageId: "arkts", version: 1, text: "" } })
    notify("textDocument/didChange", { textDocument: { uri: b, version: 2 }, contentChanges: [{ text: "changed" }] })
    await server.notification("textDocument/publishDiagnostics", ({ params }) => params.uri === a)
    const failures = server.messages.filter(message => message.method === "window/logMessage"
      && message.params.type === 1 && message.params.message.includes("ArkTS diagnostics failed"))
    assert.equal(failures.length, code === "content-modified" ? 0 : 1)
  })
}
