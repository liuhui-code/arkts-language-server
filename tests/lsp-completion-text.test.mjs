import assert from "node:assert/strict"
import { buildSync } from "esbuild"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { projectRoot } from "./support/lsp-process.mjs"
import { LspSession } from "./support/lsp-session.mjs"

for (const snippetSupport of [false, true]) {
  test(`preserves plain completion text with snippetSupport=${snippetSupport}`, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-completion-text-"))
    const server = path.join(directory, "server.cjs")
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
    buildSync({ entryPoints: [path.join(projectRoot, "tests/fixtures/lsp/completion-text-server.ts")],
      bundle: true, platform: "node", target: "node20", format: "cjs", outfile: server })
    const session = new LspSession({ command: process.execPath, args: [server, "--stdio"],
      cwd: directory, rootUri: pathToFileURL(directory).href,
      capabilities: { textDocument: { completion: { completionItem: { snippetSupport } } } } })
    t.after(() => session.close())
    await session.initialize()
    const uri = pathToFileURL(path.join(directory, "Main.ets")).href
    session.openDocument({ uri, version: 1, text: "foo" })
    const response = await session.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 0, character: 3 },
    })
    assert.equal(response.error, undefined, JSON.stringify(response))
    const items = response.result.items
    assert.equal(items.length, 4)
    for (const [label, expected] of [
      ["foo$1", "foo$1"], ["literal", "${1:literal} ${2} $0"], ["fallback$2", "fallback$2"],
    ]) {
      const item = items.find(item => item.label === label)
      assert.equal(item.insertText, expected, label)
      assert.equal(item.insertTextFormat, undefined, label)
      if (label !== "fallback$2") assert.equal(item.textEdit.newText, expected, label)
      else assert.equal(item.textEdit, undefined)
    }
    const snippet = items.find(item => item.label === "snippet")
    const expected = snippetSupport ? "call(${1:argument}, ${2})$0" : "call(argument, )"
    assert.equal(snippet.insertText, expected)
    assert.equal(snippet.textEdit.newText, expected)
    assert.equal(snippet.insertTextFormat, snippetSupport ? 2 : undefined)
  })
}
