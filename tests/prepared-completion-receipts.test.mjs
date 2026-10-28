import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { buildSync } from "esbuild"

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-completion-receipt-"))
const output = path.join(directory, "receipt.cjs")
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))
buildSync({ entryPoints: ["src/semantic/prepared-completion-receipts.ts"], outfile: output,
  bundle: true, platform: "node", format: "cjs", target: "node20" })
const { PreparedCompletionReceipts } = createRequire(import.meta.url)(output)
function fixture() {
  const receipts = new PreparedCompletionReceipts()
  const item = { label: "Target", detail: "module", kind: "class", data: { resolutionNamespace: "owner:1" },
    preResolved: { documentVersion: 1, detail: "class Target", documentation: "x".repeat(400_000),
      additionalTextEdits: [{ uri: "file:///root/Main.ets", expectedVersion: 1, newText: "import Target" }] } }
  const stamp = { rootUri: "file:///root", rootRevision: 2, configurationRevision: 3 }
  receipts.remember({ items: [item] }, stamp)
  const query = { document: { uri: "file:///root/Main.ets", workspaceId: stamp.rootUri, version: 1 }, completion: item }
  return { receipts, item, query, stamp }
}
test("a cached large payload requires a small authoritative Worker admission", async () => {
  const { receipts, item, query } = fixture()
  let calls = 0
  const result = await receipts.resolve(query, () => true, async completion => {
    calls++
    assert.ok(Buffer.byteLength(JSON.stringify(completion)) < 1024)
    assert.equal(completion.preResolved, undefined)
    return { documentVersion: 1, value: { ...completion,
      data: { admittedCachedNamespace: "owner:1" } } }
  })
  assert.equal(calls, 1)
  assert.equal(result.value.documentation.length, 400_000)
  assert.deepEqual(result.value.additionalTextEdits, item.preResolved.additionalTextEdits)
})
test("a mutation after admission or mismatched namespace cannot attach cached edits", async () => {
  const { receipts, query } = fixture()
  const failed = await receipts.resolve(query, () => true, async completion => ({ documentVersion: 1,
    value: { ...completion, data: { admittedCachedNamespace: "other:2" } } }))
  assert.equal(failed.value.additionalTextEdits, undefined)
  assert.equal(failed.value.documentation, undefined)
  let current = true
  const changed = await receipts.resolve(query, () => current, async completion => {
    current = false
    return { documentVersion: 1, value: { ...completion, data: { admittedCachedNamespace: "owner:1" } } }
  })
  assert.equal(changed.value.additionalTextEdits, undefined)
})
test("an old revision falls through and genuine backend failures remain errors", async () => {
  const { receipts, query } = fixture()
  assert.equal(receipts.resolve(query, () => false, () => { throw Error("must not call") }), undefined)
  await assert.rejects(receipts.resolve(query, () => true, async () => { throw Error("backend failed") }), /backend failed/)
})
