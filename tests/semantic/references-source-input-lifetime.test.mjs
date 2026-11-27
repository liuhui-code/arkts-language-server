import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createSdkPartialScopeFixture } from '../support/sdk-partial-scope-lsp.mjs'
import { initializeReadinessFixture } from '../support/semantic-readiness-lsp.mjs'
import { positionAt } from '../support/resident-interactive-lsp.mjs'
import { auditFixture, until, rows, workerLifetime } from '../support/worker-recovery-audit.mjs'

const sorted = rows => rows.map(JSON.stringify).sort()
const locations = (text, uri, re) => [...text.matchAll(re)].map(m => ({ uri, range: {
  start: positionAt(text, m.index), end: positionAt(text, m.index + m[0].length) } }))

for (const [form, name, invocation] of [['call', 'func', 'local()'], ['tag', 'tag', 'local`x`']]) {
  test(`source profile refuses ${form} usage whose binding includes an external function`, { timeout: 30000 }, async t => {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, { ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined })
    const main = `import { ${name} } from './Dep'\nexport function run() { let local = ${name}; return ${invocation} }\n`
    const dep = `export function ${name}(...args: any[]): number { return 1 }\n`
    fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), main)
    fs.writeFileSync(path.join(sourceRoot, 'Dep.ets'), dep)
    await initializeReadinessFixture(f, 101)
    const uri = f.uri(`${folder}/Main.ets`), depUri = f.uri(`${folder}/Dep.ets`)
    f.session.openDocument({ uri, version: 1, text: main })
    // A declaration really is local; a call/tag usage must retain full semantics.
    const declaration = await f.session.request('textDocument/references', { textDocument: { uri },
      position: positionAt(main, main.indexOf('local') + 1), context: { includeDeclaration: true } })
    assert.equal(declaration.error, undefined, JSON.stringify(declaration))
    assert.deepEqual(sorted(declaration.result), sorted(locations(main, uri, /local/g)))
    const before = f.events().filter(e => e.event === 'references.source-owner.complete').length
    const response = await f.session.request('textDocument/references', { textDocument: { uri },
      position: positionAt(main, main.lastIndexOf('local') + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted([...locations(main, uri, new RegExp(`\\b(?:local|${name})\\b`, 'g')),
      ...locations(dep, depUri, new RegExp(`\\b${name}\\b`, 'g'))]))
    assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, before)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  })
}

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
    position: positionAt(main, main.indexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: main })
  fs.writeFileSync(path.join(f.directory, 'source-cancel-arm'), 'armed')
  const id = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: '2.0', id, method: 'textDocument/references', params })
  const entered = path.join(f.directory, 'source-cancel-entered'), deadline = Date.now() + 5000
  while (!fs.existsSync(entered)) {
    assert.ok(Date.now() < deadline, 'actual source Host must enter before cancellation')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.ok(JSON.parse(fs.readFileSync(entered, 'utf8')).threadId > 0)
  f.session.transport.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
  const cancelled = await f.session.transport.response(id, 5000)
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
  const response = await f.session.request('textDocument/references', params)
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(sorted(response.result), sorted(locations(main, uri, /local/g)))
  assert.ok(fs.existsSync(path.join(f.directory, 'source-cancel-observed')), 'B completes only after A Host cancellation drains')
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory, 'source-cancel-observed'), 'utf8')).masked, false,
    'the official factory completes its finite synchronization before checking cancellation')
  assert.equal(f.events().filter(e => e.event === 'semantic.worker.started').length, 1)
  assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, 1)
  const terminal = f.session.transport.transcriptEntries.filter(({ entry }) =>
    entry.direction === 'receive' && entry.id === id && entry.method === null)
  assert.equal(terminal.length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test('source result cache respects an explicit RSS budget admission observation', { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined, ARKTS_MEMORY_BUDGET_MB: '1024',
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve('tests/fixtures/source-reference-budget.cjs'))}`,
  })
  const main = 'export function run() { let local = 1; return local + local }\n'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), main)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(main, main.indexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: main })
  const query = async () => {
    const response = await f.session.request('textDocument/references', params)
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(sorted(response.result), sorted(locations(main, uri, /local/g)))
  }
  await query()
  assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, 1)
  fs.writeFileSync(path.join(f.directory, 'source-cache-pressure'), 'controlled parent RSS observation')
  await query()
  assert.equal(f.events().filter(e => e.event === 'references.cache.hit').length, 0,
    'source-qualified cache must not bypass explicit-budget admission')
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

for (const [name, text] of [
  ['shorthand', 'export function run() { let local = 1; return { local } }\n'],
  ['namespace', 'namespace Outer { export function run() { let local = 1; return local } }\n'],
  ['eval', 'export function run() { let local = 1; eval("local"); return local }\n'],
  ['ambient', 'declare function unrelated(): void; export function run() { let local = 1; return local }\n'],
]) test(`unsupported ${name} retains the complete project oracle`, { timeout: 30000 }, async t => {
  const results = []
  for (const fastPath of ['0', undefined]) {
    const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined,
      { ARKTS_REFERENCES_RESIDENT_FAST_PATH: fastPath })
    fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), text)
    await initializeReadinessFixture(f, 100)
    const uri = f.uri(`${folder}/Main.ets`)
    f.session.openDocument({ uri, version: 1, text })
    const response = await f.session.request('textDocument/references', { textDocument: { uri },
      position: positionAt(text, text.indexOf('local') + 1), context: { includeDeclaration: true } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    results.push(sorted(response.result.map(location => ({ ...location, uri: location.uri.replace(f.rootUri, 'ROOT') }))))
    assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, 0)
    assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
  }
  assert.ok(results[0].length > 0, 'full oracle must really find references')
  assert.deepEqual(results[1], results[0])
})

test('same-byte target replacement between source observations rejects A and permits current B',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve('tests/fixtures/source-reference-final-replacement.cjs'))}`,
  })
  const main = 'export function run() { let local = 1; return local + local }\n'
  const file = path.join(sourceRoot, 'Main.ets'), timestamp = Math.floor(Date.now() / 1000)
  fs.writeFileSync(file, main)
  fs.utimesSync(file, timestamp, timestamp)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`), params = { textDocument: { uri },
    position: positionAt(main, main.indexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: main })
  const plan = path.join(f.directory, 'source-final-replacement')
  fs.writeFileSync(plan, 'replace before final source capture')
  const response = await f.session.request('textDocument/references', params)
  const replacement = JSON.parse(fs.readFileSync(plan + '.fired', 'utf8'))
  assert.notEqual(replacement.before.ino, replacement.after.ino)
  assert.equal(replacement.before.size, replacement.after.size)
  assert.equal(replacement.before.mtimeMs, replacement.after.mtimeMs)
  assert.equal(response.result, undefined)
  assert.equal(response.error?.code, -32801, JSON.stringify(response))
  const recovered = await f.session.request('textDocument/references', params)
  assert.equal(recovered.error, undefined, JSON.stringify(recovered))
  assert.deepEqual(sorted(recovered.result), sorted(locations(main, uri, /local/g)))
  assert.equal(f.events().filter(e => e.event === 'semantic.worker.started').length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})

test('an unavailable initial source snapshot does not poison same-version source retry',
  { timeout: 30000 }, async t => {
  const { f, folder, sourceRoot } = createSdkPartialScopeFixture(t, undefined, {
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined,
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve('tests/fixtures/source-reference-unavailable.cjs'))}`,
  })
  const main = 'export function run() { let local = 1; return local + local }\n'
  fs.writeFileSync(path.join(sourceRoot, 'Main.ets'), main)
  await initializeReadinessFixture(f, 100)
  const uri = f.uri(`${folder}/Main.ets`)
  f.session.openDocument({ uri, version: 1, text: main })
  for (const includeDeclaration of [true, false]) {
    const response = await f.session.request('textDocument/references', { textDocument: { uri },
      position: positionAt(main, main.indexOf('local') + 1), context: { includeDeclaration } })
    assert.equal(response.error, undefined, JSON.stringify(response))
    const all = locations(main, uri, /local/g)
    assert.deepEqual(sorted(response.result), sorted(includeDeclaration ? all : all.slice(1)))
  }
  assert.ok(fs.existsSync(path.join(f.directory, 'source-unavailable-observed')))
  assert.equal(f.events().filter(e => e.event === 'references.source-owner.complete').length, 1,
    'the second same-version request must use a healthy source owner, not permanent project fallback')
  assert.equal(f.events().filter(e => e.event === 'semantic.worker.started').length, 1)
  assert.deepEqual((await f.session.close()).exit, { code: 0, signal: null })
})


test('source cancellation cannot hide uncertain Registry release or multiply Worker recovery',
  { timeout: 30000 }, async t => {
  const fixture = name => `--require=${JSON.stringify(path.resolve('tests/fixtures', name))}`
  const f = await auditFixture(t, 'source-cancel-cleanup-ownership', { env: {
    ARKTS_MEMORY_BUDGET_MB: undefined,
    NODE_OPTIONS: [fixture('worker-lifecycle-audit.cjs'), fixture('source-reference-cancellation.cjs')].join(' '),
  } })
  const original = 'export function run() { let local = 1; return local + local }\n'
  const edited = original.replace('local + local', 'local + local + local')
  fs.writeFileSync(path.join(f.workspace, 'Main.ets'), original)
  await f.initialize()
  const uri = f.uri('Main.ets'), params = { textDocument: { uri },
    position: positionAt(original, original.indexOf('local') + 1), context: { includeDeclaration: true } }
  f.session.openDocument({ uri, version: 1, text: original })
  const warm = await f.request('textDocument/references', params)
  assert.equal(warm.error, undefined, JSON.stringify(warm))
  assert.deepEqual(sorted(warm.result), sorted(locations(original, uri, /local/g)))
  fs.writeFileSync(path.join(f.directory, 'source-cancel-arm'), 'armed')
  f.write('source-release-fault', { mode: 'after' })
  f.session.changeDocument({ uri, version: 2, text: edited })
  const id = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: '2.0', id, method: 'textDocument/references', params })
  await until(() => fs.existsSync(path.join(f.directory, 'source-cancel-entered')), 'real source Host entered')
  f.session.transport.send({ jsonrpc: '2.0', method: '$/cancelRequest', params: { id } })
  const cancelled = await f.session.transport.response(id, 5000)
  assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
  await until(() => f.events().some(e => e.event === 'semantic.worker.recovery.complete'), 'source ownership recovery')
  const fault = f.read('source-release-fault.fired')
  f.report.observations.sourceReleaseFault = fault
  assert.equal(fault.domain, 'source')
  assert.equal(fault.before, 1)
  assert.equal(fault.after, 0)
  assert.match(fault.caller, /SourceReferenceOwner.dispose/u)
  const response = await f.request('textDocument/references', params)
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(sorted(response.result), sorted(locations(edited, uri, /local/g)))
  assert.equal(f.events().filter(e => e.event === 'semantic.worker.recovery.complete').length, 1)
  assert.equal(rows(f).filter(r => r.event === 'created').length, 2)
  assert.equal(workerLifetime(f).peak, 1)
  t.diagnostic('source cleanup fault evidence: ' + f.output)
})
