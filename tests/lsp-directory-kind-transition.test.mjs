import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture, initializeReadinessFixture } from "./support/semantic-readiness-lsp.mjs"
for (const name of ["source.ets", ".gitignore", "resources/base/element/string.json"]) test(`directory lifecycle type ambiguity: ${name}`, async t => {
  const f = createReadinessFixture(t, { ARKTS_INDEX_CATALOG_TRACE: "1", ARKTS_MEMORY_BUDGET_MB: undefined })
  f.sources["Main.ets"] = 'import { Thing } from "./Unopened"\nexport const one = new Thing()\n'
  f.sources["Unopened.ets"] = 'export class Thing {}\n'
  for (const [file, text] of Object.entries(f.sources)) fs.writeFileSync(path.join(f.workspace, file), text)
  const records = []
  const refs = () => f.session.request("textDocument/references", { textDocument: { uri: f.uri("Main.ets") },
    position: { line: 1, character: 23 }, context: { includeDeclaration: true } }, { timeoutMs: 15_000 })
  const q = () => f.events().filter(e => e.event === "index.maintenance.phase" && e.outcome === "qualified").at(-1)
  async function notify(type) {
    const before = q().inputRevision
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(path.join(f.workspace, name)).href, type }] } })
    const until = Date.now() + 10_000
    while (Date.now() < until) {
      if (q()?.inputRevision > before) return q()
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.fail("directory event did not qualify")
  }
  try {
    await initializeReadinessFixture(f)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    const baseline = await refs()
    assert.equal(baseline.result.length, 3)
    const dir = path.join(f.workspace, name)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "Late.ets"), `import { Thing } from "${path.relative(dir, path.join(f.workspace, "Unopened")).split(path.sep).join("/")}"\nexport const two = new Thing()\n`)
    const added = await notify(1), afterAdd = await refs()
    records.push({ stage: "created", q: added, response: afterAdd })
    assert.equal(afterAdd.error, undefined, JSON.stringify(afterAdd))
    assert.equal(afterAdd.result.length, 5)
    fs.rmSync(dir, { recursive: true })
    fs.writeFileSync(dir, name.endsWith(".ets") ? "export class ReplacementFile {}\n" : "{\"string\":[]}")
    const removed = await notify(2), afterRemove = await refs()
    records.push({ stage: "deleted", q: removed, response: afterRemove })
    assert.equal(afterRemove.error, undefined, JSON.stringify(afterRemove))
    assert.deepEqual((await f.session.request("workspace/symbol", { query: "two" })).result, [])
    assert.deepEqual(afterRemove.result, baseline.result)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  } finally { t.diagnostic(JSON.stringify(records)) }
})

test("ordinary rule file updates preserve SDK ownership and exact semantic definitions", async t => {
  const f = createReadinessFixture(t, { ARKTS_INDEX_CATALOG_TRACE: "1", ARKTS_MEMORY_BUDGET_MB: undefined })
  await initializeReadinessFixture(f)
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  const query = () => f.session.request("textDocument/definition", { textDocument: { uri: f.uri("Main.ets") },
    position: { line: 1, character: 28 } })
  const before = await query()
  assert.equal(before.error, undefined)
  assert.equal(before.result.length, 1)
  const selections = f.events().filter(e => e.event === "sdk.selected").length
  assert.ok(selections > 0)
  for (const type of [1, 2]) {
    const previous = f.events().filter(e => e.event === "index.maintenance.phase" && e.outcome === "qualified").at(-1)
    const file = path.join(f.workspace, ".gitignore")
    fs.writeFileSync(file, `# metadata-only update ${type}\n`)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: pathToFileURL(file).href, type }] } })
    const until = Date.now() + 10_000
    let qualified
    while (Date.now() < until) {
      qualified = f.events().filter(e => e.event === "index.maintenance.phase" && e.outcome === "qualified").at(-1)
      if (qualified?.inputRevision > previous.inputRevision) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.ok(qualified.inputRevision > previous.inputRevision)
    assert.equal(qualified.writtenDocuments, 0)
    assert.deepEqual((await query()).result, before.result)
    assert.equal(f.events().filter(e => e.event === "sdk.selected").length, selections)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  }
})
