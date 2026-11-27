import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createSdkPartialScopeFixture } from '../support/sdk-partial-scope-lsp.mjs'
import { initializeReadinessFixture } from '../support/semantic-readiness-lsp.mjs'
import { positionAt } from '../support/resident-interactive-lsp.mjs'

test('source-bound declaration references edit and undo without guarding unrelated project members',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve('tests/fixtures/source-reference-guard-audit.cjs'))}`,
  })
  try {
  for (const name of ['Main.ets', 'Global.ets', 'Augment.ets', 'Box.ets']) fs.unlinkSync(path.join(sourceRoot, name))
  const original = '// 🧪 exact UTF-16\nexport function run() { let local = 1; return local + local }\n'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), original)
  await initializeReadinessFixture(f, 97)
  assert.equal(f.initialPreparation.semanticState, 'partial')
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(original, original.indexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: original })
  const query = async text => {
    const response = await f.session.request('textDocument/references', params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    const sorted = rows => rows.map(JSON.stringify).sort()
    assert.deepEqual(sorted(response.result), sorted([...text.matchAll(/local/g)].map(m => ({ uri, range: {
      start: positionAt(text, m.index), end: positionAt(text, m.index + 5) } }))))
  }
  const marker = path.join(f.directory, 'source-reference-audit-on')
  fs.writeFileSync(marker, 'audit only the following current requests')
  await query(original)
  const edited = original.replace('local + local', 'local + local + local')
  f.session.changeDocument({ uri, version: 2, text: edited })
  await query(edited)
  f.session.changeDocument({ uri, version: 3, text: original })
  await query(original)
  const observed = f.events().filter(e => e.event === 'references.source-owner.complete')
  assert.equal(observed.length, 3, 'each miss must use the explicitly source-bound domain')
  for (const event of observed) {
    assert.equal(event.programSourceFiles, 1)
    assert.equal(event.sdkSourceFiles, 0)
  }
  const work = fs.readFileSync(path.join(f.directory, 'partial-reference-work.ndjson'), 'utf8')
    .trim().split('\n').map(JSON.parse)
  assert.ok(work.some(e => e.event === 'program-created' && e.oldProgramProvided))
  assert.equal(f.events().filter(e => e.event === 'references.plan.complete').length, 0)
  fs.unlinkSync(marker)
  const guards = path.join(f.directory, 'source-reference-guards.ndjson')
  const rows = fs.existsSync(guards) ? fs.readFileSync(guards, 'utf8').trim().split('\n').map(JSON.parse) : []
  t.diagnostic(JSON.stringify({ unrelatedGuards: rows.length, paths: new Set(rows.map(x => x.file)).size }))
  assert.equal(rows.length, 0, 'independently qualified local declaration must not traverse unrelated sources')
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  } finally {
    const evidence = process.env.ARKTS_SOURCE_INPUT_TEST_EVIDENCE
    if (evidence) {
      fs.mkdirSync(evidence, { recursive: true })
      for (const file of ['logs/server.log', 'source-reference-guards.ndjson', 'partial-reference-work.ndjson']) {
        const source = path.join(f.directory, file)
        if (fs.existsSync(source)) fs.copyFileSync(source, path.join(evidence, path.basename(file)))
      }
    }
  }
})

test('cached source-bound declaration references certify the target without scanning unrelated members',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve('tests/fixtures/source-reference-guard-audit.cjs'))}`,
  })
  for (const name of ['Main.ets', 'Global.ets', 'Augment.ets', 'Box.ets']) fs.unlinkSync(path.join(sourceRoot, name))
  const text = 'export function run(){ let local=1; return local+local }\n'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), text)
  await initializeReadinessFixture(f, 97)
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(text, text.indexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text })
  const first = await f.session.request('textDocument/references', params)
  assert.equal(first.error, undefined, JSON.stringify(first))
  fs.writeFileSync(path.join(f.directory, 'source-reference-audit-on'), 'only current hot request')
  const repeat = await f.session.request('textDocument/references', params)
  fs.unlinkSync(path.join(f.directory, 'source-reference-audit-on'))
  assert.equal(repeat.error, undefined, JSON.stringify(repeat))
  assert.deepEqual(repeat.result, first.result)
  assert.equal(first.result.length, 3)
  assert.equal(f.events().filter(e => e.event === 'references.cache.hit').length, 1, 'measure actual cache hit')
  const file = path.join(f.directory, 'source-reference-guards.ndjson')
  const guards = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean) : []
  t.diagnostic(JSON.stringify({ unrelatedHotGuards: guards.length }))
  assert.equal(guards.length, 0, 'cache validation must consume the source-qualified input domain')
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test('source declaration references preserve bare-CR positions on miss and cache hit',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, { ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined })
  const text = 'export function run() {\r  let local = 1;\r  return local + local;\r}\r'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), text)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  f.session.openDocument({ uri, version: 1, text })
  const expected = [[1, 6], [2, 9], [2, 17]].map(([line, character]) => ({ uri,
    range: { start: { line, character }, end: { line, character: character + 5 } } }))
  for (let i = 0; i < 2; i++) {
    const response = await f.session.request('textDocument/references', { textDocument: { uri },
      position: { line: 1, character: 7 }, context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, expected)
  }
  assert.equal(f.events().filter(e => e.event === 'references.cache.hit').length, 1)
  assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test('source proof separates declaration policy and ignores unrelated unnotified source changes',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined,
    { ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined })
  const text = 'export function run() { let local = 1; return local + local }\n'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), text)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  f.session.openDocument({ uri, version: 1, text })
  const expected = [...text.matchAll(/local/g)].map(m => ({ uri, range: {
    start: positionAt(text, m.index), end: positionAt(text, m.index + 5) } }))
  const query = async includeDeclaration => {
    const response = await f.session.request('textDocument/references', { textDocument: { uri },
      position: positionAt(text, text.indexOf('local') + 1), context: { includeDeclaration } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, includeDeclaration ? expected : expected.slice(1))
  }
  await query(true)
  fs.writeFileSync(path.join(sourceRoot, 'Unused0.ts'), 'export const local = 3\n')
  await query(true)
  fs.writeFileSync(path.join(sourceRoot, 'NewUse.ts'), 'import { run } from "./Main"; export const local = run()\n')
  await query(true)
  assert.equal(f.events().filter(e => e.event === 'references.cache.hit').length, 2,
    'a function-local declaration does not acquire unrelated project exclusion obligations')
  await query(false)
  await query(false)
  assert.equal(f.events().filter(e => e.event === 'references.cache.hit').length, 3)
  assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, 2)
  f.session.transport.send({ jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri } } })
  await query(true)
  f.session.openDocument({ uri, version: 2, text })
  await query(true)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

for (const symbolic of [false, true]) test(`source declaration keeps escaped computed keys local (symbol=${symbolic})`,
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined,
    { ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined })
  const text = symbolic
    ? 'export function run(){ const isolated=Symbol(); return { key: isolated, value: {[isolated]:1} } }\n'
    : 'export function run(){ const isolated="selected"; return {[isolated]:1} }\n'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), text)
  fs.writeFileSync(path.join(sourceRoot, 'Use.ts'), symbolic
    ? 'import {run} from "./Main"; const out=run(); export const value=out.value[out.key]\n'
    : 'import {run} from "./Main"; export const value=run().selected\n')
  await initializeReadinessFixture(f, 101)
  const uri = f.uri(`${folder}/Main.ets`), expected = [...text.matchAll(/isolated/g)].map(m => ({ uri, range: {
    start: positionAt(text, m.index), end: positionAt(text, m.index + 8) } }))
  for (let i = 0; i < 2; i++) {
    const response = await f.session.request('textDocument/references', { textDocument: { uri },
      position: positionAt(text, text.indexOf('isolated') + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(response.result, expected)
  }
  assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, 1)
  assert.equal(f.events().filter(e => e.event === 'references.cache.hit').length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})
