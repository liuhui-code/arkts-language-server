import assert from "node:assert/strict"
import { buildSync } from "esbuild"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildScriptedSemanticServer } from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"
import { LspSession } from "./support/lsp-session.mjs"

const scriptedServerPath = buildScriptedSemanticServer()

test("returns a bounded incomplete completion list whose edge items remain resolvable", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/BoundedCompletion.ets`).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(projectRoot).href,
      capabilities: {},
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "// COMPLETION_RESULT_513",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 34,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })

  const completion = await server.response(34)
  assert.equal(completion.error, undefined, JSON.stringify(completion.error))
  const items = completion.result.items
  assert.equal(items.length > 0, true)

  server.send({
    jsonrpc: "2.0",
    id: 35,
    method: "completionItem/resolve",
    params: items[0],
  })
  const first = await server.response(35)
  assert.equal(first.error, undefined, JSON.stringify(first.error))
  assert.equal(first.result.label, "bulk-000")

  server.send({
    jsonrpc: "2.0",
    id: 36,
    method: "completionItem/resolve",
    params: items.at(-1),
  })
  const last = await server.response(36)
  assert.equal(last.error, undefined, JSON.stringify(last.error))
  assert.equal(last.result.label, "bulk-255")

  assert.equal(Array.isArray(completion.result), false)
  assert.equal(completion.result.isIncomplete, true)
  assert.equal(items.length, 256)
  assert.deepEqual(
    [items[0].label, items.at(-1).label],
    ["bulk-000", "bulk-255"],
  )
})

for (const { count, incomplete } of [
  { count: 256, incomplete: false },
  { count: 257, incomplete: true },
]) {
  test(`treats ${count} completion items as ${incomplete ? "incomplete" : "complete"}`, async (t) => {
    const server = new LspProcess({ serverPath: scriptedServerPath })
    t.after(() => server.close())
    const uri = pathToFileURL(`${projectRoot}/fixtures/CompletionBoundary${count}.ets`).href

    server.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        processId: process.pid,
        rootUri: pathToFileURL(projectRoot).href,
        capabilities: {},
      },
    })
    await server.response(1)
    server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
    server.send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri,
          languageId: "arkts",
          version: 1,
          text: `// COMPLETION_RESULT_${count}`,
        },
      },
    })
    server.send({
      jsonrpc: "2.0",
      id: 37,
      method: "textDocument/completion",
      params: {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      },
    })

    const completion = await server.response(37)
    assert.equal(completion.error, undefined, JSON.stringify(completion.error))
    assert.equal(Array.isArray(completion.result), false)
    assert.equal(completion.result.isIncomplete, incomplete)
    const items = completion.result.items
    assert.equal(items.length, 256)

    server.send({
      jsonrpc: "2.0",
      id: 38,
      method: "completionItem/resolve",
      params: items[0],
    })
    const first = await server.response(38)
    assert.equal(first.error, undefined, JSON.stringify(first.error))
    assert.equal(first.result.label, "bulk-000")

    server.send({
      jsonrpc: "2.0",
      id: 39,
      method: "completionItem/resolve",
      params: items.at(-1),
    })
    const last = await server.response(39)
    assert.equal(last.error, undefined, JSON.stringify(last.error))
    assert.equal(last.result.label, "bulk-255")
  })
}

test("propagates an incomplete semantic completion list below the adapter limit", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/IncompleteCompletion.ets`).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(projectRoot).href,
      capabilities: {},
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "// COMPLETION_INCOMPLETE_SMALL",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 40,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  })

  const completion = await server.response(40)
  assert.equal(completion.error, undefined, JSON.stringify(completion.error))
  assert.equal(Array.isArray(completion.result), false)
  assert.equal(completion.result.isIncomplete, true)
  assert.equal(completion.result.items.length, 1)
  assert.equal(completion.result.items[0].label, "incomplete-small")
})

test("rejects forged completion data and safely returns an issued item after editing", async (t) => {
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  const uri = pathToFileURL(`${projectRoot}/fixtures/ResolveData.ets`).href

  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(projectRoot).href,
      capabilities: {},
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: {
      textDocument: {
        uri,
        languageId: "arkts",
        version: 1,
        text: "struct ResolveData {}",
      },
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 34,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 7 },
    },
  })
  const completion = await server.response(34)
  const item = completion.result.items[0]

  server.send({
    jsonrpc: "2.0",
    id: 35,
    method: "completionItem/resolve",
    params: { ...item, label: "FORGED-CLIENT-LABEL", detail: "FORGED-CLIENT-DETAIL" },
  })
  const serverBound = await server.response(35)
  assert.equal(serverBound.result.label, item.label)
  assert.equal(serverBound.result.detail, "Resolved scripted semantic completion")
  assert.deepEqual(serverBound.result.data, item.data)

  server.send({
    jsonrpc: "2.0",
    id: 36,
    method: "completionItem/resolve",
    params: {
      ...item,
      data: { arktsCompletionId: `${item.data.arktsCompletionId}-forged` },
    },
  })
  const forged = await server.response(36)
  assert.equal(forged.error.code, -32602)

  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version: 2 },
      contentChanges: [{ text: "struct ResolveDataV2 {}" }],
    },
  })
  server.send({
    jsonrpc: "2.0",
    id: 37,
    method: "completionItem/resolve",
    params: item,
  })
  const stale = await server.response(37)
  assert.equal(stale.error, undefined, JSON.stringify(stale))
  assert.deepEqual(stale.result, item)
})

test("an evicted completion still resolves safely without retaining unbounded compiler contexts", async t => {
  const session = new LspSession({ command: process.execPath, args: [scriptedServerPath, "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(projectRoot).href })
  t.after(() => session.close())
  await session.initialize()
  const uri = pathToFileURL(`${projectRoot}/fixtures/EvictedResolve.ets`).href
  session.openDocument({ uri, version: 1, text: "// COMPLETION_RESULT_256" })
  let original
  for (let i = 0; i < 3; i++) {
    const listed = await session.request("textDocument/completion", {
      textDocument: { uri }, position: { line: 0, character: 0 },
    })
    assert.equal(listed.result.items.length, 256)
    original ??= listed.result.items[0]
  }
  const late = await session.request("completionItem/resolve", original)
  assert.equal(late.error, undefined, JSON.stringify(late))
  const { detail: _unavailableDetail, ...immutable } = original
  assert.deepEqual(late.result, immutable)
  const injected = await session.request("completionItem/resolve", { ...original,
    detail: "fake", documentation: "fake", command: { title: "fake", command: "fake" },
    additionalTextEdits: [{ newText: "unsafe", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }] })
  assert.deepEqual(injected.result, immutable)
  for (const forged of [
    { ...original, label: "forged" },
    { ...original, insertText: "forged" },
    { ...original, data: { arktsCompletionId: original.data.arktsCompletionId.slice(0, -1)
      + (original.data.arktsCompletionId.endsWith("0") ? "1" : "0") } },
  ]) {
    const rejected = await session.request("completionItem/resolve", forged)
    assert.equal(rejected.error?.code, -32602, JSON.stringify(rejected))
  }
})

test("resolve decorates the original list edits and preserves genuine backend failures", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-completion-contract-"))
  const server = path.join(directory, "server.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "tests/fixtures/lsp/completion-contract-server.ts")],
    bundle: true, platform: "node", target: "node20", format: "cjs", outfile: server })
  const session = new LspSession({ command: process.execPath, args: [server, "--stdio"],
    cwd: directory, rootUri: pathToFileURL(directory).href,
    capabilities: { textDocument: { completion: { completionItem: { insertReplaceSupport: true } } } } })
  t.after(async () => { await session.close(); fs.rmSync(directory, { recursive: true, force: true }) })
  await session.initialize()
  const uri = pathToFileURL(path.join(directory, "Main.ets")).href
  const list = () => session.request("textDocument/completion", {
    textDocument: { uri }, position: { line: 0, character: 2 },
  })
  session.openDocument({ uri, version: 1, text: "mem" })
  const item = (await list()).result.items[0]
  const resolved = await session.request("completionItem/resolve", item)
  assert.equal(resolved.error, undefined, JSON.stringify(resolved))
  for (const key of ["label", "kind", "insertText", "filterText", "sortText", "textEdit", "data"]) {
    assert.deepEqual(resolved.result[key], item[key], key)
  }
  assert.equal(resolved.result.detail, "resolved detail")
  assert.equal(resolved.result.documentation, "resolved documentation")
  assert.equal(resolved.result.additionalTextEdits[0].newText, "// import\n")
  for (const [version, text, code] of [[2, "BACKEND_FAILURE", -32603], [3, "CROSS_FILE_EDIT", -32602]]) {
    session.changeDocument({ uri, version, text })
    const current = (await list()).result.items[0]
    const failed = await session.request("completionItem/resolve", current)
    assert.equal(failed.error?.code, code, JSON.stringify(failed))
    assert.equal(failed.result, undefined)
  }
  const stale = await session.request("completionItem/resolve", resolved.result)
  assert.deepEqual(stale.result, item, "re-resolving an old enriched item must drop its import edit")
  // Evict the first context using a bounded number of list entries, then verify
  // key order is irrelevant while a forged nested edit fails authentication.
  for (let index = 0; index < 512; index++) await list()
  const reordered = { ...item, textEdit: {
    newText: item.textEdit.newText,
    replace: { end: item.textEdit.replace.end, start: item.textEdit.replace.start },
    insert: { end: item.textEdit.insert.end, start: item.textEdit.insert.start },
  } }
  const evicted = await session.request("completionItem/resolve", reordered)
  const { detail: _oldDetail, ...immutable } = item
  assert.deepEqual(evicted.result, immutable)
  const oldEnriched = await session.request("completionItem/resolve", resolved.result)
  assert.deepEqual(oldEnriched.result, immutable)
  const tampered = await session.request("completionItem/resolve", { ...reordered,
    textEdit: { ...reordered.textEdit, newText: "forged()" } })
  assert.equal(tampered.error?.code, -32602, JSON.stringify(tampered))
})
