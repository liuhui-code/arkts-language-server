import assert from "node:assert/strict"
import test from "node:test"

import { startCompletionLifecycle } from "../support/completion-lifecycle-lsp.mjs"

test("a late Zed completion resolve after close returns its original item without new edits",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t)
    const item = await c.list()
    const fresh = await c.request("completionItem/resolve", item)
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.match(fresh.result.documentation, /documented member/u)
    c.closeDocument("Alpha.ets")
    const late = await c.request("completionItem/resolve", item)
    assert.equal(late.error, undefined, JSON.stringify(late))
    assert.deepEqual(late.result, item)
    assert.equal(late.result.additionalTextEdits, undefined)
  })

test("close/reopen with the same numeric version never revives an old compiler context",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t), item = await c.list()
    c.closeDocument("Alpha.ets")
    c.session.openDocument({ uri: c.uri("Alpha.ets"), version: 0,
      text: c.sources["Alpha.ets"].replace('"alpha"', "42") })
    const late = await c.request("completionItem/resolve", item)
    assert.equal(late.error, undefined, JSON.stringify(late))
    assert.deepEqual(late.result, item)
    const fresh = await c.request("completionItem/resolve", await c.list())
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.match(fresh.result.detail, /number/u)
  })

test("real Worker mutation interleavings return safe items and retain healthy subsequent resolution",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t), item = await c.list()
    for (const action of ["open-other", "close-other", "close-target"]) {
      const id = c.session.nextRequestId
      const pending = c.request("completionItem/resolve", item)
      if (action === "open-other") {
        c.session.openDocument({ uri: c.uri("Unrelated.ets"), version: 0, text: c.sources["Unrelated.ets"] })
      } else c.closeDocument(action === "close-other" ? "Unrelated.ets" : "Alpha.ets")
      const response = await pending
      assert.equal(response.error, undefined, JSON.stringify({ action, response }))
      assert.deepEqual(response.result, item)
      assert.equal(response.result.additionalTextEdits, undefined)
      assert.equal(c.wire.filter(row => row.direction === "receive" && row.message.id === id).length, 1)
      if (action !== "close-target") {
        const settled = await c.request("completionItem/resolve", item)
        assert.equal(settled.error, undefined, JSON.stringify(settled))
        assert.match(settled.result.documentation, /documented member/u)
      }
    }
  })

test("client cancellation stays RequestCancelled with one terminal response and no recovery loop",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t), item = await c.list()
    const id = c.session.nextRequestId
    const pending = c.request("completionItem/resolve", item)
    c.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const cancelled = await pending
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    const healthy = await c.request("completionItem/resolve", item)
    assert.equal(healthy.error, undefined, JSON.stringify(healthy))
    assert.match(healthy.result.documentation, /documented member/u)
    assert.equal(c.wire.filter(row => row.direction === "receive" && row.message.id === id).length, 1)
  })

test("editing the target invalidates details without echoing forged edits or commands",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t), item = await c.list()
    c.session.changeDocument({ uri: c.uri("Alpha.ets"), version: 1,
      text: c.sources["Alpha.ets"].replace('"alpha"', "42") })
    const late = await c.request("completionItem/resolve", { ...item, label: "forged",
      documentation: "forged", command: { title: "forged", command: "forged" },
      additionalTextEdits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "unsafe" }] })
    assert.equal(late.error, undefined, JSON.stringify(late))
    assert.deepEqual(late.result, item)
    const fresh = await c.request("completionItem/resolve", await c.list())
    assert.match(fresh.result.detail, /number/u)
    for (const data of [undefined, null, [], { arktsCompletionId: "forged" }, { ...item.data, extra: true }]) {
      const malformed = await c.request("completionItem/resolve", { ...item, data })
      assert.equal(malformed.error?.code, -32602, JSON.stringify(malformed))
    }
  })
