import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspProcess } from "./support/lsp-process.mjs"

const good = 'export const value: string = "valid"\n'
const bad = 'export const value: number = 42\n'
const consumer = 'import { value } from "./B"\nconst result: string = value\n'

async function fixture(t, dependency = good) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-dependent-diagnostics-"))
  fs.writeFileSync(path.join(root, "A.ets"), consumer)
  fs.writeFileSync(path.join(root, "B.ets"), dependency)
  const a = pathToFileURL(path.join(root, "A.ets")).href
  const b = pathToFileURL(path.join(root, "B.ets")).href
  const otherRoot = path.join(root, "other")
  fs.mkdirSync(otherRoot)
  const c = pathToFileURL(path.join(otherRoot, "C.ets")).href
  const server = new LspProcess()
  t.after(async () => { await server.close(); fs.rmSync(root, { recursive: true, force: true }) })
  const notify = (method, params) => server.send({ jsonrpc: "2.0", method, params })
  const open = (uri, text) => notify("textDocument/didOpen", {
    textDocument: { uri, languageId: "arkts", version: 1, text },
  })
  const published = (uri, mismatch) => server.notification("textDocument/publishDiagnostics",
    ({ params }) => params.uri === uri && params.version === 1
      && params.diagnostics.some(d => d.code === 2322) === mismatch, 10_000)
  server.send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
    workspaceFolders: [root, otherRoot].map(directory => ({
      uri: pathToFileURL(directory).href, name: path.basename(directory),
    })), capabilities: {}, processId: process.pid,
  } })
  assert.equal((await server.response(1)).error, undefined)
  notify("initialized", {})
  return { root, a, b, c, server, notify, open, published }
}

test("settled consumer diagnostics refresh when only an imported overlay changes", async t => {
  const f = await fixture(t)
  f.open(f.b, good)
  f.open(f.a, consumer)
  assert.deepEqual((await f.published(f.a, false)).params.diagnostics, [])
  t.diagnostic("A initial diagnostics settled clean; mutating only B overlay")
  f.notify("textDocument/didChange", {
    textDocument: { uri: f.b, version: 2 }, contentChanges: [{ text: bad }],
  })
  assert.ok((await f.published(f.a, true)).params.diagnostics.some(d => d.code === 2322))
})

test("settled consumer diagnostics refresh when an imported overlay closes back to disk", async t => {
  const f = await fixture(t)
  f.open(f.b, bad)
  f.open(f.a, consumer)
  await f.published(f.a, true)
  t.diagnostic("A initial diagnostics settled with TS2322; closing only B")
  f.notify("textDocument/didClose", { textDocument: { uri: f.b } })
  assert.deepEqual((await f.published(f.a, false)).params.diagnostics, [])
})

test("settled consumer diagnostics refresh after an ordinary watched dependency change", async t => {
  const f = await fixture(t)
  f.open(f.a, consumer)
  assert.deepEqual((await f.published(f.a, false)).params.diagnostics, [])
  t.diagnostic("A initial diagnostics settled clean; mutating only B on disk")
  fs.writeFileSync(path.join(f.root, "B.ets"), bad)
  f.notify("workspace/didChangeWatchedFiles", { changes: [{ uri: f.b, type: 2 }] })
  assert.ok((await f.published(f.a, true)).params.diagnostics.some(d => d.code === 2322))
})


test("a dependency edit burst coalesces once and does not refresh another workspace", async t => {
  const f = await fixture(t)
  f.open(f.b, good)
  f.open(f.a, consumer)
  f.open(f.c, "const independent: string = 'unchanged'\n")
  await f.published(f.a, false)
  await f.published(f.c, false)
  for (let version = 2; version <= 21; version += 1) {
    f.notify("textDocument/didChange", {
      textDocument: { uri: f.b, version }, contentChanges: [{ text: version % 2 ? bad : good }],
    })
  }
  await f.published(f.a, true)
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.deepEqual(f.server.messages.filter(message => message.method === "textDocument/publishDiagnostics"
    && (message.params.uri === f.a || message.params.uri === f.c)), [])
})


test("opening an imported overlay refreshes already-settled consumer diagnostics once", async t => {
  const f = await fixture(t)
  f.open(f.a, consumer)
  await f.published(f.a, false)
  f.open(f.b, bad)
  await f.published(f.a, true)
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.deepEqual(f.server.messages.filter(message => message.method === "textDocument/publishDiagnostics"
    && message.params.uri === f.a), [])
})

test("continuous edits in another workspace do not starve a settled dependent refresh", async t => {
  const f = await fixture(t)
  f.open(f.b, good)
  f.open(f.a, consumer)
  f.open(f.c, "const independent: string = 'initial'\n")
  await f.published(f.a, false)
  await f.published(f.c, false)
  f.notify("textDocument/didChange", {
    textDocument: { uri: f.b, version: 2 }, contentChanges: [{ text: bad }],
  })
  let version = 1
  const edits = setInterval(() => f.notify("textDocument/didChange", {
    textDocument: { uri: f.c, version: ++version },
    contentChanges: [{ text: `const independent: string = 'edit ${version}'\n` }],
  }), 20)
  try {
    await f.server.notification("textDocument/publishDiagnostics", ({ params }) =>
      params.uri === f.a && params.version === 1 && params.diagnostics.some(d => d.code === 2322), 1_500)
  } finally {
    clearInterval(edits)
  }
})
