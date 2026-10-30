import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"
import { projectRoot } from "./support/lsp-process.mjs"

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-read-admission-"))
  const outfile = path.join(directory, "driver.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "src/semantic/semantic-worker-supervisor.ts")],
    bundle: true, platform: "node", target: "node20", format: "cjs", outfile, logLevel: "silent" })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const api = createRequire(import.meta.url)(outfile)
  const endpoint = { sent: [], listen(handlers) { this.handlers = handlers; return () => {} },
    send(message) { this.sent.push(message) }, terminate() {} }
  const rootUri = pathToFileURL(path.join(os.tmpdir(), "arkts-read-admission-workspace")).href
  const uri = name => `${rootUri}/${name}`
  const supervisor = new api.RootSemanticWorkerSupervisor({ rootUri, epoch: 1,
    endpoint, waitForDisposeDeadline: () => new Promise(() => {}) })
  const results = []
  const request = (uri, large = false) => {
    const handle = supervisor.request({ method: large ? "resolveCompletion" : "hover", uri,
      expectedDocumentVersion: 1, args: { position: { line: 0, character: 0 },
        ...(large ? { completion: { label: "item", data: { payload: "x".repeat(200_000) } } } : {}) } })
    const outcome = { handle }
    results.push(outcome)
    outcome.finished = handle.result.then(value => { outcome.value = value }, error => { outcome.error = error })
    return outcome
  }
  const held = request(uri("Held.ets"))
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
  const fail = async () => { endpoint.handlers.error(new Error("controlled endpoint close")); await Promise.all(results.map(r => r.finished)) }
  return { api, endpoint, supervisor, request, results, held, flush, fail, uri }
}

test("keeps the 64 pending source-owner bound and releases it on cancellation", async t => {
  const c = fixture(t)
  const pending = Array.from({ length: 64 }, (_, i) => c.request(c.uri(`Queued${i}.ets`)))
  const rejected = c.request(c.uri("Overflow.ets"))
  await c.flush()
  assert.equal(rejected.error?.code, "queue-overflow")
  assert.equal(c.endpoint.sent.length, 1)
  pending[0].handle.cancel(c.api.SemanticWorkerCancelState.clientCancelled)
  await pending[0].finished
  const replacement = c.request(c.uri("Replacement.ets"))
  await c.flush()
  assert.equal(replacement.error, undefined)
  await c.fail()
  assert.equal(replacement.error.code, "worker-unavailable")
})

test("bounds aggregate canonical input bytes even for one source and returns cancelled capacity", async t => {
  const c = fixture(t)
  const pending = Array.from({ length: 22 }, () => c.request(c.uri("Main.ets"), true))
  await c.flush()
  assert.equal(pending.filter(p => p.error?.code === "queue-overflow").length, 2,
    "20 x ~200KB fits 4MiB, the next two do not")
  pending[0].handle.cancel(c.api.SemanticWorkerCancelState.clientCancelled)
  await pending[0].finished
  const replacement = c.request(c.uri("Main.ets"), true)
  await c.flush()
  assert.equal(replacement.error, undefined)
  await c.fail()
  assert.equal(replacement.error.code, "worker-unavailable")
})

test("input invalidation drains owner and byte accounting before admitting current reads", async t => {
  const c = fixture(t)
  const pending = Array.from({ length: 64 }, (_, i) => c.request(c.uri(`Queued${i}.ets`)))
  const mutation = c.supervisor.mutate({ kind: "change", uri: c.uri("Held.ets"),
    documentVersion: 2, text: "export const latest = 2" })
  mutation.catch(() => {})
  await c.flush()
  assert.ok(pending.every(p => p.error?.code === "content-modified"))
  const current = c.request(c.uri("Current.ets"))
  await c.flush()
  assert.equal(current.error, undefined)
  await c.fail()
  assert.equal(current.error.code, "worker-unavailable")
})
