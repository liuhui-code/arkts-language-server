import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createSdkPartialScopeFixture } from "../support/sdk-partial-scope-lsp.mjs"
import { initializeReadinessFixture } from "../support/semantic-readiness-lsp.mjs"
import { positionAt } from "../support/resident-interactive-lsp.mjs"
const locations = (text, uri, re) => [...text.matchAll(re)].map(m => ({ uri, range: {
  start: positionAt(text, m.index), end: positionAt(text, m.index + m[0].length) } }))

test('real cancellation during source Program construction permits same-version retry in the same Worker',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve('tests/fixtures/source-reference-cancellation.cjs'))}`,
  })
  const main = 'export function run() { let local = 1; return local + local }\n'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), main)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(main, main.lastIndexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: main })
  fs.writeFileSync(path.join(f.directory, 'source-cancel-arm'), 'armed')
  const id = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: '2.0', id, method: 'textDocument/definition', params })
  const entered = path.join(f.directory, 'source-cancel-entered'), deadline = Date.now() + 5000
  while (!fs.existsSync(entered)) {
    assert.ok(Date.now() < deadline, 'actual source Host must enter before cancellation')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(JSON.parse(fs.readFileSync(entered, 'utf8')).threadId > 0)
  f.session.transport.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
  const cancelled = await f.session.transport.response(id, 5000)
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
  const response = await f.session.request('textDocument/definition', params)
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(response.result, [locations(main, uri, /local/g)[0]])
  assert.ok(fs.existsSync(path.join(f.directory, 'source-cancel-observed')), 'B completes only after A Host cancellation drains')
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory, 'source-cancel-observed'), 'utf8')).masked, false,
    'the official factory completes its finite synchronization before checking cancellation')
  assert.equal(f.events().filter(e => e.event === 'semantic.worker.started').length, 1)
  assert.equal(f.events().filter(e => e.event === 'navigation.source-owner.complete').length, 1)
  const terminal = f.session.transport.transcriptEntries.filter(({ entry }) =>
    entry.direction === 'receive' && entry.id === id && entry.method === null)
  assert.equal(terminal.length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test('same-byte target replacement between source observations rejects A and permits current B',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve('tests/fixtures/source-navigation-final-replacement.cjs'))}`,
  })
  const main = 'export function run() { let local = 1; return local + local }\n'
  const file = path.join(sourceRoot, 'Main.ets'), timestamp = Math.floor(Date.now() / 1000)
  fs.writeFileSync(file, main)
  fs.utimesSync(file, timestamp, timestamp)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(main, main.lastIndexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: main })
  const plan = path.join(f.directory, 'source-final-replacement')
  fs.writeFileSync(plan, 'replace before final source capture')
  const response = await f.session.request('textDocument/definition', params)
  const replacement = JSON.parse(fs.readFileSync(plan + '.fired', 'utf8'))
  assert.notEqual(replacement.before.ino, replacement.after.ino)
  assert.equal(replacement.before.size, replacement.after.size)
  assert.equal(replacement.before.mtimeMs, replacement.after.mtimeMs)
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(response.result, [], "navigation's existing stale terminal publishes no old target")
  assert.equal(f.events().filter(e => e.event === 'request.completed'
    && e.method === 'textDocument/definition' && e.outcome === 'stale').length, 1,
    "an invalidated result must be classified stale, never a successful empty lookup")
  const recovered = await f.session.request('textDocument/definition', params)
  assert.equal(recovered.error, undefined, JSON.stringify(recovered))
  assert.deepEqual(recovered.result, [locations(main, uri, /local/g)[0]])
  assert.equal(f.events().filter(e => e.event === 'semantic.worker.started').length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})



test("local navigation respects unsaved overlays, silent disk edits, close and reopen", { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t)
  const original = "export function run(){let local=1; return local}\n"
  const disk = "// external edit\n" + original
  const file = path.join(sourceRoot, "Main.ets"), uri = f.uri(`${folder}/Main.ets`)
  fs.writeFileSync(file, original)
  await initializeReadinessFixture(f, 100)
  const query = async text => {
    const response = await f.session.request("textDocument/definition", { textDocument: { uri },
      position: positionAt(text, text.lastIndexOf("local") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [locations(text, uri, /local/g)[0]])
  }
  f.session.openDocument({ uri, version: 1, text: original })
  await query(original)
  fs.writeFileSync(file, disk) // no watch: the open overlay must remain authoritative.
  await query(original)
  f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
  await query(disk)
  f.session.openDocument({ uri, version: 1, text: disk })
  await query(disk)
  f.session.changeDocument({ uri, version: 2, text: original })
  fs.writeFileSync(file, original)
  f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didSave", params: { textDocument: { uri }, text: original } })
  await query(original)
  assert.equal(f.events().filter(e => e.event === "navigation.source-owner.complete").length, 5)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test("an unavailable source navigation snapshot allows a same-version source retry", { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/source-reference-unavailable.cjs"))}`,
  })
  const text = "export function run(){let local=1; return local}\n"
  fs.writeFileSync(path.join(sourceRoot, "Main.ets"), text)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  f.session.openDocument({ uri, version: 1, text })
  for (let i = 0; i < 2; i++) {
    const response = await f.session.request("textDocument/definition", { textDocument: { uri },
      position: positionAt(text, text.lastIndexOf("local") + 1) })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, [locations(text, uri, /local/g)[0]])
  }
  assert.ok(fs.existsSync(path.join(f.directory, "source-unavailable-observed")))
  assert.equal(f.events().filter(e => e.event === "navigation.source-owner.complete").length, 1)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

for (const method of ["definition", "references"]) test(`physical overlay retarget during ${method} authority has a stale terminal and recovers`,
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/source-authority-retarget.cjs"))}`,
  })
  await initializeReadinessFixture(f, 100)
  const text = "export function run(){let local=1; return local+local}\n"
  const before = path.join(sourceRoot, "Before"), after = path.join(sourceRoot, "After"), link = path.join(sourceRoot, "Alias")
  for (const directory of [before, after]) { fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, "Main.ets"), text) }
  fs.symlinkSync(before, link, process.platform === "win32" ? "junction" : "dir")
  const uri = f.uri(`${folder}/Alias/Main.ets`)
  f.session.openDocument({ uri, version: 1, text })
  const params = { textDocument: { uri }, position: positionAt(text,
    (method === "references" ? text.indexOf("local") : text.lastIndexOf("local")) + 1),
    ...(method === "references" ? { context: { includeDeclaration: true } } : {}) }
  const warm = await f.session.request(`textDocument/${method}`, params)
  assert.equal(warm.error, undefined, JSON.stringify(warm))
  assert.deepEqual(warm.result, method === "references" ? locations(text, uri, /local/g) : [locations(text, uri, /local/g)[0]])
  const plan = path.join(f.directory, "source-authority-retarget")
  fs.writeFileSync(plan, JSON.stringify({ file: path.join(link, "Main.ets"), link, after }))
  const stale = await f.session.request(`textDocument/${method}`, params)
  const fired = JSON.parse(fs.readFileSync(plan + ".fired", "utf8"))
  assert.notEqual(fired.before, fired.after)
  assert.equal(fired.threadId > 0, method === "definition", "exercise Worker navigation and parent reference admission separately")
  if (method === "definition") { assert.equal(stale.error, undefined, JSON.stringify(stale)); assert.deepEqual(stale.result, []) }
  else assert.equal(stale.error?.code, -32801, JSON.stringify(stale))
  assert.equal(f.events().filter(e => e.event === "request.completed" && e.method === `textDocument/${method}` && e.outcome === "stale").length, 1)
  const current = await f.session.request(`textDocument/${method}`, params)
  assert.equal(current.error, undefined, JSON.stringify(current)); assert.deepEqual(current.result, warm.result)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})
