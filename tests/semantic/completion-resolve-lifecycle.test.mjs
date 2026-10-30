import assert from "node:assert/strict"
import test from "node:test"

import { startCompletionLifecycle } from "../support/completion-lifecycle-lsp.mjs"

test("different current completion items resolve independently in the same document",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t)
    async function items() {
      const response = await c.request("textDocument/completion", {
        textDocument: { uri: c.uri("Alpha.ets") }, position: { line: 3, character: 22 },
      })
      assert.equal(response.error, undefined, JSON.stringify(response))
      return ["title", "run"].map(label => {
        const item = response.result.items.find(entry => entry.label === label)
        assert.ok(item, JSON.stringify(response))
        return item
      })
    }
    const serial = []
    for (const item of await items()) serial.push(await c.request("completionItem/resolve", item))
    assert.match(serial[0].result.detail, /Alpha\.title: string/u)
    assert.match(serial[1].result.detail, /Alpha\.run\(\): string/u)
    const current = await items()
    const ids = [c.session.nextRequestId, c.session.nextRequestId + 1]
    const concurrent = await Promise.all(current.map(item => c.request("completionItem/resolve", item)))
    for (const response of concurrent) assert.equal(response.error, undefined, JSON.stringify(response))
    assert.match(concurrent[0].result.detail, /Alpha\.title: string/u)
    assert.match(concurrent[1].result.detail, /Alpha\.run\(\): string/u)
    assert.match(concurrent[0].result.documentation, /documented member/u)
    for (const id of ids) {
      assert.equal(c.wire.filter(row => row.direction === "receive" && row.message.id === id).length, 1)
    }
  })

test("a bounded editor prefetch burst resolves every issued item without overflowing the Worker queue",
  { timeout: 45_000 }, async t => {
    const { c, items, count } = await prefetch(t)
    const responses = await Promise.all(items.map(item => c.request("completionItem/resolve", item)))
    assert.deepEqual(responses.flatMap((r, i) => r.error ? [{ label: items[i].label, error: r.error }] : []), [],
      "independent item requests need backpressure before the existing physical Worker queue")
    for (const [index, response] of responses.entries()) {
      assert.match(response.result.detail, new RegExp(`ManyFields\\.${items[index].label}: number`, "u"))
    }
  })

test("duplicate current completion details share work without superseding either subscriber",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t), item = await c.list()
    const pair = await Promise.all([
      c.request("completionItem/resolve", item), c.request("completionItem/resolve", item),
    ])
    for (const response of pair) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.match(response.result.detail, /Alpha\.title: string/u)
      assert.match(response.result.documentation, /documented member/u)
    }
    assert.deepEqual(pair[0].result, pair[1].result)
  })

test("cancelling a queued prefetch item preserves other items and leaves one terminal response",
  { timeout: 45_000 }, async t => {
    const { c, items } = await prefetch(t)
    const firstId = c.session.nextRequestId
    const pending = items.map(item => c.request("completionItem/resolve", item))
    const cancelledId = firstId + items.length - 1
    c.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: cancelledId } })
    const responses = await Promise.all(pending)
    assert.equal(responses.at(-1).error?.code, -32800, JSON.stringify(responses.at(-1)))
    for (const [i, response] of responses.slice(0, -1).entries()) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.match(response.result.detail, new RegExp(`ManyFields\\.${items[i].label}: number`, "u"))
    }
    assert.equal(c.wire.filter(row => row.direction === "receive" && row.message.id === cancelledId).length, 1)
    const later = await c.request("completionItem/resolve", items.at(-1))
    assert.equal(later.error, undefined, JSON.stringify(later))
    assert.match(later.result.detail, /: number/u)
  })

test("editing and closing during a prefetch burst drains stale jobs and permits fresh details after reopen",
  { timeout: 45_000 }, async t => {
    const { c, items, text } = await prefetch(t)
    const pending = items.map(item => c.request("completionItem/resolve", item))
    c.session.changeDocument({ uri: c.uri("Alpha.ets"), version: 2,
      text: text.replace("field0: number = 0", 'field0: string = "edited"') })
    c.closeDocument("Alpha.ets")
    c.session.openDocument({ uri: c.uri("Alpha.ets"), version: 0,
      text: text.replace("field0: number = 0", 'field0: string = "reopened"') })
    const responses = await Promise.all(pending)
    for (const response of responses) assert.equal(response.error, undefined, JSON.stringify(response))
    assert.deepEqual(responses.at(-1).result, items.at(-1), "an old queued item cannot revive after reopen")
    const list = await c.request("textDocument/completion", {
      textDocument: { uri: c.uri("Alpha.ets") }, position: { line: text.split("\n").length - 1, character: 6 },
    })
    assert.equal(list.error, undefined, JSON.stringify(list))
    const fresh = await c.request("completionItem/resolve", list.result.items.find(item => item.label === "field0"))
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.match(fresh.result.detail, /ManyFields\.field0: string/u)
  })

test("cancelling one duplicate detail subscriber preserves the other current subscriber",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t), item = await c.list()
    const cancelledId = c.session.nextRequestId
    const cancelled = c.request("completionItem/resolve", item)
    const surviving = c.request("completionItem/resolve", item)
    c.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: cancelledId } })
    const [first, second] = await Promise.all([cancelled, surviving])
    assert.equal(first.error?.code, -32800, JSON.stringify(first))
    assert.equal(second.error, undefined, JSON.stringify(second))
    assert.match(second.result.detail, /Alpha\.title: string/u)
    assert.match(second.result.documentation, /documented member/u)
    assert.equal(c.wire.filter(row => row.direction === "receive" && row.message.id === cancelledId).length, 1)
  })

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

async function prefetch(t) {
  const c = await startCompletionLifecycle(t), count = 128
  const text = "export class ManyFields {\n" + Array.from({ length: count }, (_, i) =>
    `  field${i}: number = ${i}\n`).join("") + "}\nconst probe = new ManyFields()\nprobe."
  c.session.changeDocument({ uri: c.uri("Alpha.ets"), version: 1, text })
  const list = await c.request("textDocument/completion", {
    textDocument: { uri: c.uri("Alpha.ets") },
    position: { line: text.split("\n").length - 1, character: 6 },
  })
  assert.equal(list.error, undefined, JSON.stringify(list))
  const items = list.result.items.filter(item => /^field\d+$/u.test(item.label))
  assert.equal(items.length, count)
  return { c, items, count, text }
}
