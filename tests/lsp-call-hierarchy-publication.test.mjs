import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { buildSync } from "esbuild"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const documentUri = pathToFileURL(path.join(projectRoot, "fixtures/basic/CallSource.ets")).href
const text = "// CALL_HIERARCHY_PUBLICATION"

for (const mutation of ["unchanged", "cancel", "edit", "reopen"]) {
  test(`prepareCallHierarchy final source-validation publication fence: ${mutation}`, async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-hierarchy-publication-"))
    t.after(() => fs.rm(directory, { recursive: true, force: true }))
    const serverPath = path.join(directory, "server.cjs")
    buildSync({
      entryPoints: [path.join(projectRoot, "tests/fixtures/lsp/call-hierarchy-publication-server.ts")],
      bundle: true, platform: "node", target: "node20", format: "cjs", outfile: serverPath,
      logLevel: "silent",
    })
    const server = new LspProcess({ serverPath, env: { ARKTS_TEST_PUBLICATION_BARRIER: directory,
      NODE_OPTIONS: `--require=${path.join(projectRoot, "tests/fixtures/publication-marker-write-window.cjs")}` } })
    t.after(() => server.close())
    server.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      processId: process.pid, rootUri: pathToFileURL(projectRoot).href, capabilities: {},
    } })
    await server.response(1)
    notify(server, "initialized", {})
    open(server)
    server.send({ jsonrpc: "2.0", id: 10, method: "textDocument/prepareCallHierarchy", params: {
      textDocument: { uri: documentUri }, position: { line: 0, character: 0 },
    } })
    await waitForBarrier(directory)
    assert.equal(await fs.readFile(path.join(directory, "entered"), "utf8"), "true",
      "the real source authority must have accepted the source before the final await settles")
    assert.equal(await fs.readFile(path.join(directory, "write-window-completed"), "utf8"), "true",
      "the real marker create-before-write interval must be exercised")
    if (mutation === "cancel") notify(server, "$/cancelRequest", { id: 10 })
    if (mutation === "edit") notify(server, "textDocument/didChange", {
      textDocument: { uri: documentUri, version: 2 }, contentChanges: [{ text: "// UPDATED" }],
    })
    if (mutation === "reopen") {
      notify(server, "textDocument/didClose", { textDocument: { uri: documentUri } })
      open(server)
    }
    // A subsequent framed request acknowledges processing the preceding input;
    // no guessed delay stands in for delivery of cancellation/lifecycle events.
    server.send({ jsonrpc: "2.0", id: 11, method: "test/publicationInputProcessed", params: {} })
    assert.equal((await server.response(11)).error.code, -32601)
    await fs.writeFile(path.join(directory, "release"), "release")
    const response = await server.response(10)
    if (mutation === "unchanged") {
      assert.equal(response.error, undefined)
      assert.equal(response.result[0].name, "scriptedCallHierarchy")
    } else {
      assert.equal(response.result, undefined, "revoked results must not cross the publication fence")
      assert.equal(response.error.code, mutation === "cancel" ? -32800 : -32801)
    }
    server.send({ jsonrpc: "2.0", id: 12, method: "shutdown", params: null })
    assert.equal((await server.response(12)).result, null)
    assert.equal(server.transcriptEntries.filter(({ entry }) => entry.direction === "receive" && entry.id === 10).length, 1)
  })
}

function notify(server, method, params) { server.send({ jsonrpc: "2.0", method, params }) }
function open(server) {
  notify(server, "textDocument/didOpen", {
    textDocument: { uri: documentUri, languageId: "arkts", version: 1, text },
  })
}
async function waitForBarrier(directory) {
  const deadline = Date.now() + 10_000
  while (true) {
    try { await fs.access(path.join(directory, "entered")); return } catch {
      if (Date.now() >= deadline) throw new Error("Final source-validation barrier not entered")
      await delay(5)
    }
  }
}
