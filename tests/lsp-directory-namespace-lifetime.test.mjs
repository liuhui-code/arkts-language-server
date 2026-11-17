import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { createReadinessFixture, initializeReadinessFixture } from "./support/semantic-readiness-lsp.mjs"
for (const preexisting of [false, true])
for (const name of ["opaque.module", "source.ets", ".gitignore", "resources/base/element/string.json"]) test(`directory lifecycle ${name}, preexisting=${preexisting}`, async t => {
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
    const dir = path.join(f.workspace, name)
    const populate = () => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, "Late.ets"), `import { Thing } from "${path.relative(dir, path.join(f.workspace, "Unopened")).split(path.sep).join("/")}"\nexport const two = new Thing()\n`)
    }
    if (preexisting) populate()
    await initializeReadinessFixture(f, preexisting ? 3 : 2)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    assert.equal((await refs()).result.length, preexisting ? 5 : 3)
    if (!preexisting) {
      populate()
      const added = await notify(1), afterAdd = await refs()
      records.push({ stage: "created", q: added, response: afterAdd })
      assert.equal(afterAdd.error, undefined, JSON.stringify(afterAdd))
      assert.equal(afterAdd.result.length, 5)
    }
    fs.rmSync(dir, { recursive: true })
    const removed = await notify(3), afterRemove = await refs()
    records.push({ stage: "deleted", q: removed, response: afterRemove })
    assert.equal(afterRemove.error, undefined, JSON.stringify(afterRemove))
    assert.equal(afterRemove.result.length, 3)
  } finally {
    t.diagnostic(JSON.stringify(records))
  }
})
