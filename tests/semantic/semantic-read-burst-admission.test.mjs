import assert from "node:assert/strict"
import test from "node:test"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { startCompletionLifecycle } from "../support/completion-lifecycle-lsp.mjs"

// Real Zed emitted 80 distinct current queries in 1.2s (WUI-008), not duplicates.
async function fixture(t, controlled = false) {
  const preload = controlled ? fileURLToPath(new URL("../fixtures/semantic-read-burst-window.cjs", import.meta.url)) : undefined
  const c = await startCompletionLifecycle(t, { preload }), uri = c.uri("Alpha.ets")
  const source = Array.from({ length: 40 }, (_, i) => [
    `export class Type${i} { value = ${i} }`,
    `export const item${i} = new Type${i}()`,
    `item${i}.value`,
  ].join("\n")).join("\n") + "\n"
  c.session.changeDocument({ uri, version: 1, text: source })
  const params = i => ({ textDocument: { uri }, position: { line: i * 3 + 2, character: 2 } })
  const check = (response, i, type) => {
    assert.equal(response.error, undefined, JSON.stringify(response))
    assert.ok(response.result.some(item => (item.uri ?? item.targetUri) === uri
      && (item.range ?? item.targetSelectionRange).start.line === i * 3 + (type ? 0 : 1)), JSON.stringify(response))
  }
  for (const type of [false, true]) {
    check(await c.request(type ? "textDocument/typeDefinition" : "textDocument/definition", params(0)), 0, type)
  }
  const specs = Array.from({ length: 40 }, (_, i) => [false, true].map(type => ({ i, type }))).flat()
  const burst = () => specs.map(({ i, type }) => c.request(type ? "textDocument/typeDefinition" : "textDocument/definition", params(i)))
  return { ...c, uri, source, params, check, specs, burst }
}

function singleTerminals(c, firstId) {
  for (let n = 0; n < c.specs.length; n++) {
    assert.equal(c.wire.filter(row => row.direction === "receive"
      && row.message.id === firstId + n && !row.message.method).length, 1)
  }
}

test("an unchanged editor burst preserves 80 distinct definition and type consumers",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t), firstId = c.session.nextRequestId
    const results = await Promise.all(c.burst())
    results.forEach((response, n) => c.check(response, c.specs[n].i, c.specs[n].type))
    singleTerminals(c, firstId)
    c.check(await c.request("textDocument/definition", c.params(39)), 39, false)
  })

test("cancelling one consumer in an 80-read burst preserves every current sibling",
  { timeout: 45_000 }, async t => {
    const c = await fixture(t), firstId = c.session.nextRequestId
    const pending = c.burst(), cancelled = 41
    c.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: firstId + cancelled } })
    const results = await Promise.all(pending)
    results.forEach((response, n) => {
      if (n === cancelled) assert.equal(response.error?.code, -32800, JSON.stringify(response))
      else c.check(response, c.specs[n].i, c.specs[n].type)
    })
    singleTerminals(c, firstId)
    c.check(await c.request("textDocument/definition", c.params(39)), 39, false)
  })

for (const reopen of [false, true]) {
  test(`${reopen ? "same-version close/reopen" : "a new edit"} revokes old burst reads and admits current input`,
    { timeout: 45_000 }, async t => {
      const c = await fixture(t, true), firstId = c.session.nextRequestId
      const directory = path.dirname(path.dirname(fileURLToPath(c.uri)))
      fs.writeFileSync(path.join(directory, "burst-window-arm"), "armed")
      const pending = c.burst(), updated = c.source.replaceAll("Type", "Current")
      const until = performance.now() + 5000
      while (!fs.existsSync(path.join(directory, "burst-window-entered.json")) && performance.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      assert.ok(fs.existsSync(path.join(directory, "burst-window-entered.json")), "actual compiler query entered")
      if (reopen) {
        c.closeDocument("Alpha.ets")
        c.session.openDocument({ uri: c.uri, version: 1, text: updated })
      } else c.session.changeDocument({ uri: c.uri, version: 2, text: updated })
      // An unsent sibling must terminate empty before the held compiler is released:
      // this proves the server applied the public mutation, rather than relying on timing.
      const revoked = await Promise.race(pending.slice(2))
      assert.equal(revoked.error, undefined, JSON.stringify(revoked))
      assert.deepEqual(revoked.result, [])
      fs.writeFileSync(path.join(directory, "burst-window-release"), "released")
      for (const response of await Promise.all(pending)) {
        assert.equal(response.error, undefined, JSON.stringify(response))
        assert.deepEqual(response.result, [])
      }
      singleTerminals(c, firstId)
      const current = await c.request("textDocument/hover", c.params(39))
      assert.equal(current.error, undefined, JSON.stringify(current))
      assert.match(current.result?.contents?.value ?? "", /Current39/u)
      c.check(await c.request("textDocument/definition", c.params(39)), 39, false)
    })
}
