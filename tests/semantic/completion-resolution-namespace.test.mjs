import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

for (const notified of [true, false]) test(`an issued completion cannot bind to a repaired namespace after ${notified ? "watched" : "unnotified"} package changes`,
  { timeout: 30_000 }, async t => {
    const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: "4096" })
    const text = 'import { Target } from "named"\nconst selected = new Target()\nselected.val\n'
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), text)
    for (const [name, type, value] of [["one", "number", "1"], ["two", "string", "'two'"]]) {
      fs.mkdirSync(path.join(f.workspace, name))
      fs.writeFileSync(path.join(f.workspace, name, "oh-package.json5"), "{main:'Index.ets'}")
      fs.writeFileSync(path.join(f.workspace, name, "Index.ets"), `export class Target { value: ${type} = ${value} }\n`)
    }
    const manifest = path.join(f.workspace, "oh-package.json5")
    fs.writeFileSync(manifest, "{dependencies:{named:'file:./one'}}")
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text })
    await f.session.transport.notification("textDocument/publishDiagnostics", m => m.params.uri === f.uri("Main.ets") && m.params.version === 1, 10_000)
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 12 } }
    const complete = () => f.session.request("textDocument/completion", params)
    const first = await complete(), old = first.result.items.find(item => item.label === "value")
    assert.ok(old?.data, JSON.stringify(first))
    fs.writeFileSync(manifest, "{dependencies:{named:'file:./two'}}")
    if (notified) f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("oh-package.json5"), type: 2 }] } })
    else {
      const rejected = await complete()
      assert.equal(rejected.error?.code, -32803, JSON.stringify(rejected))
      assert.equal(rejected.result, undefined)
    }
    const fresh = await complete(), current = fresh.result.items.find(item => item.label === "value")
    assert.ok(current?.data, JSON.stringify(fresh))
    const expired = await f.session.request("completionItem/resolve", old)
    assert.equal(expired.error, undefined, JSON.stringify(expired))
    assert.deepEqual(expired.result, old, "old immutable list fields survive; no new details or edits may be attached")
    const resolved = await f.session.request("completionItem/resolve", current)
    assert.equal(resolved.error, undefined, JSON.stringify(resolved))
    assert.match(resolved.result.detail, /value: string/)
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })
