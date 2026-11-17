import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

function fixture(t, logger) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-log-delivery-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const outfile = path.join(root, "entry.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/semantic/worker-log-delivery.ts")],
    outfile, bundle: true, platform: "node", format: "cjs", target: "node20" })
  return new (createRequire(import.meta.url)(outfile).WorkerLogDelivery)(logger)
}
const info = index => ({ level: "info", event: "span", fields: { index } })

test("bounded info batches preserve every row and flush before an error or a terminal", async t => {
  const seen = [], sizes = []
  const queue = fixture(t, { info: (event, fields) => seen.push({ event, fields }),
    error: (event, fields) => seen.push({ event, fields }),
    infoBatch: rows => { sizes.push(rows.length); seen.push(...rows) } })
  for (let index = 0; index < 150; index++) queue.enqueue(info(index))
  queue.enqueue({ level: "error", event: "failure", fields: { reason: "retirement" } })
  assert.deepEqual(seen.slice(0, 150).map(row => row.fields.index), Array.from({ length: 150 }, (_, i) => i))
  assert.equal(seen.at(-1).event, "failure")
  assert.ok(sizes.every(size => size <= 64))
  queue.enqueue(info(150)); queue.flush()
  assert.equal(seen.at(-1).fields.index, 150)
  const count = seen.length
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(seen.length, count, "an already flushed scheduled callback cannot duplicate rows")
})

test("idle flush exposes an in-progress source start while the Worker remains synchronous", async t => {
  const seen = [], queue = fixture(t, { info() {}, error() {}, infoBatch: rows => seen.push(...rows) })
  queue.enqueue({ level: "info", event: "source.start", fields: { source: "Heavy.ets" } })
  assert.equal(seen.length, 0)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(seen[0].event, "source.start")
})

test("a huge row drains earlier entries and uses the direct sink without retaining a huge batch", t => {
  const seen = [], queue = fixture(t, { info: (event, fields) => seen.push({ event, fields }),
    error() {}, infoBatch: rows => seen.push(...rows) })
  queue.enqueue(info(0))
  queue.enqueue({ level: "info", event: "large", fields: { body: "😀".repeat(40_000) } })
  assert.deepEqual(seen.map(row => row.event), ["span", "large"])
  queue.flush()
  assert.equal(seen.length, 2)
})

test("custom loggers without a bulk sink retain synchronous delivery", t => {
  const seen = [], queue = fixture(t, { info: (event, fields) => seen.push({ event, fields }), error() {} })
  queue.enqueue(info(1))
  assert.equal(seen[0].fields.index, 1)
  queue.flush()
  assert.equal(seen.length, 1)
})
