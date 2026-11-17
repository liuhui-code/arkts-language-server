import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "./support/lsp-session.mjs"
import { writeUnavailableSource } from "./support/partial-source-fixture.mjs"

test("fails incoming calls closed when workspace membership is partial", async t => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "arkts-call-hierarchy-partial-"))
  const targetPath = path.join(workspace, "PartialTarget.ets")
  const text = "export function partialTarget(): string { return 'target' }\n"
  await fs.writeFile(targetPath, text)
  await writeUnavailableSource(workspace)
  const uri = pathToFileURL(targetPath).href
  const session = new LspSession({ rootUri: pathToFileURL(workspace).href })
  t.after(async () => {
    try { await session.close() }
    finally { await fs.rm(workspace, { recursive: true, force: true }) }
  })
  await session.initialize()
  session.openDocument({ uri, version: 1, text })
  const prepared = await session.request("textDocument/prepareCallHierarchy", {
    textDocument: { uri }, position: { line: 0, character: text.indexOf("partialTarget") + 1 } })
  assert.equal(prepared.error, undefined, JSON.stringify(prepared))
  assert.equal(prepared.result.length, 1)
  for (let repeat = 0; repeat < 2; repeat++) {
    const incoming = await session.request("callHierarchy/incomingCalls", { item: prepared.result[0] })
    assert.equal(incoming.result, undefined)
    assert.deepEqual(incoming.error, {
      code: -32803, message: "Call hierarchy result is incomplete: project-membership-incomplete.",
    })
  }
})
