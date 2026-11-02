import assert from "node:assert/strict"
import { buildSync } from "esbuild"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { projectRoot } from "./support/lsp-process.mjs"
import { LspSession } from "./support/lsp-session.mjs"

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-symbol-freshness-"))
  const server = path.join(directory, "server.cjs")
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  buildSync({ entryPoints: [path.join(projectRoot, "tests/fixtures/lsp/workspace-symbol-freshness-server.ts")],
    bundle: true, platform: "node", target: "node20", format: "cjs", outfile: server })
  const session = new LspSession({ command: process.execPath, args: [server, "--stdio"],
    cwd: directory, rootUri: pathToFileURL(directory).href })
  t.after(() => session.close())
  await session.initialize()
  const wait = async name => {
    const deadline = Date.now() + 5000
    while (!fs.existsSync(path.join(directory, name))) {
      assert.ok(Date.now() < deadline, `missing fixture witness ${name}`)
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  const release = name => fs.writeFileSync(path.join(directory, `${name}.release`), "yes")
  const uri = name => pathToFileURL(path.join(directory, name)).href
  await wait("index-open")
  return { session, wait, release, uri }
}

for (const mutation of ["reopen", "change", "close", "unchanged", "cancel", "cancel-change"]) {
  test(`workspace symbols fence a pending overlay: ${mutation}`, async t => {
    const { session, wait, release, uri } = await fixture(t)
    const target = uri("Main.ets")
    session.openDocument({ uri: target, version: 1, text: "class StaleSymbol {} // WAIT_OVERLAY" })
    const id = session.nextRequestId
    const pending = session.request("workspace/symbol", { query: "Symbol" })
    await wait("overlay.entered")
    if (mutation === "reopen" || mutation === "close") {
      session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: target } } })
      await wait("close-Main.ets")
    }
    if (mutation === "reopen") {
      session.openDocument({ uri: target, version: 1, text: "class FreshSymbol {}" })
      // A subsequent request is a protocol-order barrier, independent of filesystem polling.
      const fresh = await session.request("workspace/symbol", { query: "FreshSymbol" })
      assert.deepEqual(fresh.result?.map(item => item.name), ["FreshSymbol"])
    }
    if (mutation === "change" || mutation === "cancel-change") {
      session.changeDocument({ uri: target, version: 2, text: "class FreshSymbol {}" })
      await wait("sync-Main.ets-2")
    }
    if (mutation.startsWith("cancel")) session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    if (!mutation.startsWith("cancel")) release("overlay")
    const response = await pending
    if (mutation === "unchanged") assert.deepEqual(response.result.map(item => item.name), ["StaleSymbol"])
    else assert.equal(response.error?.code, mutation.startsWith("cancel") ? -32800 : -32801, JSON.stringify(response))
    release("overlay")
  })
}

test("workspace symbols recheck an already resolved overlay after another overlay awaits", async t => {
  const { session, wait, release, uri } = await fixture(t)
  session.openDocument({ uri: uri("A.ets"), version: 1, text: "class StaleSymbol {}" })
  session.openDocument({ uri: uri("B.ets"), version: 1, text: "class OtherSymbol {} // WAIT_OVERLAY" })
  const pending = session.request("workspace/symbol", { query: "Symbol" })
  await wait("resolved-StaleSymbol"); await wait("overlay.entered")
  session.changeDocument({ uri: uri("A.ets"), version: 2, text: "class FreshSymbol {}" })
  await wait("sync-A.ets-2"); release("overlay")
  const response = await pending
  assert.equal(response.error?.code, -32801, JSON.stringify(response))
})

test("workspace symbols do not publish persisted rows hidden by a newly opened overlay", async t => {
  const { session, wait, release, uri } = await fixture(t)
  const pending = session.request("workspace/symbol", { query: "WAIT_INDEX" })
  await wait("index.entered")
  session.openDocument({ uri: uri("New.ets"), version: 1, text: "class NewOverlay {}" })
  await wait("sync-New.ets-1"); release("index")
  const response = await pending
  assert.equal(response.error?.code, -32801, JSON.stringify(response))
})

test("workspace symbol failures are not mislabeled as content changes", async t => {
  const { session } = await fixture(t)
  const response = await session.request("workspace/symbol", { query: "FAIL_SERVICE" })
  assert.equal(response.error?.code, -32603, JSON.stringify(response))
  assert.match(response.error.message, /scripted service failure/)
})
