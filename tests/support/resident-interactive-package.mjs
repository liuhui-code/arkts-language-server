import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { createFixture, diagnostic, positionAt, startSession, warmAndPromote } from "./resident-interactive-lsp.mjs"

export async function assertPackageEntryFreshness(t, policy, {
  method, offset, expected, members = () => "", suffix = "", normalize = value => value,
}) {
  const fixture = createFixture(t)
  const root = path.join(fixture.workspace, "shared")
  fs.mkdirSync(root)
  fs.writeFileSync(path.join(fixture.workspace, "oh-package.json5"), "{ dependencies: { shared: 'file:./shared' } }")
  const manifest = path.join(root, "oh-package.json5")
  const targets = ["number", "string"].map((type, index) =>
    `// package entry ${index} 😀\nexport class ValueTarget { value: ${type} = ${index ? '\"updated\"' : "1"}${members(type)} }\n`)
  for (const [index, name] of ["First.ets", "Second.ets"].entries()) fs.writeFileSync(path.join(root, name), targets[index])
  const source = 'import { ValueTarget } from "shared"\nexport const selected = new ValueTarget()\n'
    + "export const broken: number = selected.value\n" + suffix
  const overlay = `// authoritative package switch 😀\n${source}`
  fs.writeFileSync(path.join(fixture.workspace, "ZPackage.ets"), source)
  const uri = fixture.uri("ZPackage.ets")
  const query = text => ({ textDocument: { uri }, position: positionAt(text, offset(text)) })
  const oraclePayload = (index, text) => expected({ fixture, target: targets[index],
    name: `shared/${index ? "Second" : "First"}.ets`, source: text })
  fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
  const coldFixture = { ...fixture }
  const cold = await startSession(t, coldFixture, false, policy)
  cold.openDocument({ uri, version: 1, text: overlay })
  const coldErrors = (await diagnostic(cold, uri, 1)).params.diagnostics
  assert.deepEqual(coldErrors.map(item => item.code), [2322])
  const oracle = await cold.request(`textDocument/${method}`, query(overlay), { timeoutMs: 20_000 })
  assert.equal(oracle.error, undefined, JSON.stringify(oracle.error))
  assert.deepEqual(normalize(oracle.result), oraclePayload(1, overlay))
  assert.deepEqual((await cold.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  fixture.runCount = coldFixture.runCount
  fs.writeFileSync(manifest, "{ main: 'First.ets' }")
  const session = await startSession(t, fixture, true, policy)
  await warmAndPromote(session, fixture)
  session.openDocument({ uri, version: 1, text: source })
  assert.deepEqual((await diagnostic(session, uri, 1)).params.diagnostics, [])
  const first = await session.request(`textDocument/${method}`, query(source), { timeoutMs: 20_000 })
  assert.equal(first.error, undefined, JSON.stringify(first.error))
  assert.deepEqual(normalize(first.result), oraclePayload(0, source))
  fs.writeFileSync(path.join(fixture.workspace, "ZPackage.ets"), "export const diskOnly = 1\n")
  fs.writeFileSync(manifest, "{ main: 'Second.ets' }")
  session.changeDocument({ uri, version: 2, text: overlay })
  let refreshed = await session.request(`textDocument/${method}`, query(overlay), { timeoutMs: 20_000 })
  let version = 2
  if (refreshed.error) {
    assert.equal(refreshed.error.code, -32803, JSON.stringify(refreshed.error))
    assert.equal(refreshed.result, undefined)
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(manifest).href, type: 2 }] } })
    session.changeDocument({ uri, version: ++version, text: overlay })
    refreshed = await session.request(`textDocument/${method}`, query(overlay), { timeoutMs: 20_000 })
  }
  assert.equal(refreshed.error, undefined, JSON.stringify(refreshed.error))
  assert.deepEqual(normalize(refreshed.result), normalize(oracle.result),
    `unproven inputs cannot return a successful old ${method}`)
  assert.deepEqual((await diagnostic(session, uri, version)).params.diagnostics, coldErrors)
  assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
}
