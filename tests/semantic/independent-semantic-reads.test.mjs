import assert from "node:assert/strict"
import test from "node:test"

import { startCompletionLifecycle } from "../support/completion-lifecycle-lsp.mjs"

const source = [
  "export class Alpha { constructor(public value: number) {} }",
  "export class Beta { constructor(public value: string) {} }",
  "export const first = new Alpha(1)",
  'export const second = new Beta("b")',
  "export function alpha(value: number): number { return value }",
  "export function beta(value: string): string { return value }",
  "export const one = alpha(1)",
  'export const two = beta("b")',
  "first.value",
  "second.value",
  "fir",
  "sec",
  "",
].join("\n")

function position(needle, after = 1, text = source) {
  const offset = text.lastIndexOf(needle) + after
  assert.ok(offset >= after, `source contains ${needle}`)
  const prefix = text.slice(0, offset)
  return { line: prefix.split("\n").length - 1,
    character: offset - text.lastIndexOf("\n", offset - 1) - 1 }
}

async function fixture(t, disk = false) {
  const c = await startCompletionLifecycle(t)
  const uri = c.uri("Alpha.ets")
  c.session.changeDocument({ uri, version: 1, text: source })
  if (disk) {
    const fs = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    fs.writeFileSync(fileURLToPath(uri), source)
    c.closeDocument("Alpha.ets")
    c.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri, type: 2 }] } })
  }
  return { ...c, uri, params: p => ({ textDocument: { uri }, position: p }) }
}

function locations(response, uri, line) {
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.ok(response.result.some(item => (item.uri ?? item.targetUri) === uri
    && (item.range ?? item.targetSelectionRange).start.line === line), JSON.stringify(response))
}

function singleTerminals(c, ids) {
  for (const id of ids) assert.equal(c.wire.filter(row => row.direction === "receive"
    && row.message.id === id && !row.message.method).length, 1)
}

for (const disk of [false, true]) {
  for (const method of ["textDocument/definition", "textDocument/typeDefinition"]) {
    test(`${method} keeps independent unchanged ${disk ? "disk" : "open"} positions`,
      { timeout: 45_000 }, async t => {
        const c = await fixture(t, disk)
        const points = method === "textDocument/definition"
          ? [position("Alpha("), position("Beta(")]
          : [position("first.value"), position("second.value")]
        for (const [index, point] of points.entries()) {
          locations(await c.request(method, c.params(point)), c.uri, index)
        }
        const ids = [c.session.nextRequestId, c.session.nextRequestId + 1]
        const results = await Promise.all(points.map(point => c.request(method, c.params(point))))
        results.forEach((response, index) => locations(response, c.uri, index))
        singleTerminals(c, ids)
      })
  }
}

for (const [method, points, check] of [
  ["textDocument/hover", [position("first.value"), position("second.value")],
    (r, i) => assert.match(r.result?.contents?.value ?? "", i ? /Beta/u : /Alpha/u)],
  ["textDocument/signatureHelp", [position("alpha(", 6), position("beta(", 5)],
    (r, i) => assert.match(r.result?.signatures?.[0]?.label ?? "", i ? /beta/u : /alpha/u)],
  ["textDocument/completion", [{ line: 10, character: 3 }, { line: 11, character: 3 }],
    (r, i) => assert.ok(r.result?.items?.some(item => item.label === (i ? "second" : "first")), JSON.stringify(r))],
  ["textDocument/documentHighlight", [position("alpha("), position("beta(")],
    (r, i) => assert.ok(r.result?.some(item => item.range.start.line === (i ? 7 : 6)), JSON.stringify(r))],
]) {
  test(`${method} preserves both current consumers at different positions`,
    { timeout: 45_000 }, async t => {
      const c = await fixture(t)
      for (const [index, point] of points.entries()) {
        const serial = await c.request(method, c.params(point))
        assert.equal(serial.error, undefined, JSON.stringify(serial)); check(serial, index)
      }
      const ids = [c.session.nextRequestId, c.session.nextRequestId + 1]
      const results = await Promise.all(points.map(point => c.request(method, c.params(point))))
      for (const [index, response] of results.entries()) {
        assert.equal(response.error, undefined, JSON.stringify(response)); check(response, index)
      }
      singleTerminals(c, ids)
    })
}

test("call hierarchy preparation and incoming reads retain independent consumers",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t)
    const points = [position("alpha("), position("beta(")]
    const items = []
    for (const [index, point] of points.entries()) {
      const response = await c.request("textDocument/prepareCallHierarchy", c.params(point))
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.equal(response.result[0]?.name, index ? "beta" : "alpha")
      items.push(response.result[0])
    }
    const prepared = await Promise.all(points.map(point => c.request("textDocument/prepareCallHierarchy", c.params(point))))
    for (const [index, response] of prepared.entries()) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.equal(response.result[0]?.name, index ? "beta" : "alpha")
    }
    const incoming = await Promise.all(items.map(item => c.request("callHierarchy/incomingCalls", { item })))
    for (const [index, response] of incoming.entries()) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.ok(response.result.some(call => call.fromRanges.some(range => range.start.line === (index ? 7 : 6))), JSON.stringify(response))
    }
    const outgoing = await Promise.all(items.map(item => c.request("callHierarchy/outgoingCalls", { item })))
    for (const response of outgoing) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [])
    }
  })

test("a small mixed navigation burst cannot erase the first current user definition",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t)
    const points = ["Alpha(", "Beta(", "first.value", "second.value", "alpha(", "beta(", "first.value", "Alpha(", "Beta("].map(needle => position(needle))
    const expected = []
    for (const point of points) {
      const response = await c.request("textDocument/definition", c.params(point))
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.ok(response.result.length > 0)
      expected.push(response.result)
    }
    const ids = points.map((_, index) => c.session.nextRequestId + index)
    const responses = await Promise.all(points.map(point => c.request("textDocument/definition", c.params(point))))
    responses.forEach((response, index) => {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, expected[index])
    })
    singleTerminals(c, ids)
  })

test("cancelling one navigation request does not cancel a current sibling",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t), id = c.session.nextRequestId
    const cancelled = c.request("textDocument/definition", c.params(position("Alpha(")))
    const surviving = c.request("textDocument/definition", c.params(position("Beta(")))
    c.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
    const [first, second] = await Promise.all([cancelled, surviving])
    assert.equal(first.error?.code, -32800, JSON.stringify(first))
    locations(second, c.uri, 1)
    singleTerminals(c, [id, id + 1])
  })

test("document edits still revoke every old independent navigation result",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t)
    const pending = ["Alpha(", "Beta("].map(needle => c.request("textDocument/definition", c.params(position(needle))))
    const updated = source.replaceAll("Alpha", "Gamma")
    c.session.changeDocument({ uri: c.uri, version: 2, text: updated })
    for (const response of await Promise.all(pending)) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [])
    }
    locations(await c.request("textDocument/definition", c.params(position("Gamma(", 1, updated))), c.uri, 0)
    const current = await c.request("textDocument/hover", c.params(position("first.value", 1, updated)))
    assert.match(current.result?.contents?.value ?? "", /Gamma/u)
  })

test("identical navigation requests remain separate valid consumers",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t), id = c.session.nextRequestId
    const responses = await Promise.all([0, 1].map(() => c.request("textDocument/definition", c.params(position("Alpha(")))))
    for (const response of responses) locations(response, c.uri, 0)
    singleTerminals(c, [id, id + 1])
  })

test("different current reference positions do not supersede another operation",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t)
    const responses = await Promise.all([position("first.value"), position("second.value")].map(point =>
      c.request("textDocument/references", { ...c.params(point), context: { includeDeclaration: true } })))
    for (const [index, response] of responses.entries()) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result.filter(item => item.uri === c.uri).map(item => item.range.start.line).sort((a, b) => a - b), index ? [3, 9] : [2, 8])
    }
  })

test("independent rename preparation preserves both current target ranges",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t)
    const responses = await Promise.all([position("first.value"), position("second.value")].map(point =>
      c.request("textDocument/prepareRename", c.params(point))))
    for (const [index, response] of responses.entries()) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.equal(response.result.range.start.line, index ? 9 : 8)
      assert.equal(response.result.placeholder, index ? "second" : "first")
    }
  })

test("close and reopen cannot revive an independent request from an old document life",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t)
    const pending = ["Alpha(", "Beta("].map(needle => c.request("textDocument/definition", c.params(position(needle))))
    c.closeDocument("Alpha.ets")
    const reopened = source.replaceAll("Alpha", "Gamma")
    c.session.openDocument({ uri: c.uri, version: 1, text: reopened })
    for (const response of await Promise.all(pending)) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [])
    }
    const current = await c.request("textDocument/hover", c.params(position("first.value", 1, reopened)))
    assert.match(current.result?.contents?.value ?? "", /Gamma/u)
  })

test("workspace symbol queries preserve independent current search consumers",
  { timeout: 45_000 }, async t => {
    const c = await startCompletionLifecycle(t)
    await c.session.transport.notification("$/progress", message => message.params.value.kind === "end", 20_000)
    const queries = ["Alpha", "unrelated"]
    for (const query of queries) {
      const response = await c.request("workspace/symbol", { query })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.ok(response.result.some(item => item.name === query), JSON.stringify(response))
    }
    const ids = queries.map((_, index) => c.session.nextRequestId + index)
    const responses = await Promise.all(queries.map(query => c.request("workspace/symbol", { query })))
    for (const [index, response] of responses.entries()) {
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.ok(response.result.some(item => item.name === queries[index]), JSON.stringify(response))
    }
    singleTerminals(c, ids)
  })
