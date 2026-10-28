import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { buildSync } from "esbuild"

function policy(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lane-policy-"))
  const outfile = path.join(directory, "policy.cjs")
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  buildSync({ stdin: { contents: 'export * from "./src/semantic/semantic-request-lanes.ts";'
    + 'export {SEMANTIC_WORKER_METHODS} from "./src/semantic/worker-protocol.ts";', resolveDir: process.cwd() },
    bundle: true, platform: "node", format: "cjs", outfile, logLevel: "silent" })
  return createRequire(import.meta.url)(outfile)
}
const record = (method, id) => ({ input: { method }, id })

test("every interactive classification actually receives bounded ordinary diagnostic priority", t => {
  const p = policy(t)
  for (const method of p.SEMANTIC_WORKER_METHODS.filter(p.isInteractiveSemanticWorkerMethod)) {
    const oldest = record("diagnose", 1), foreground = record(method, 2), pending = [oldest, foreground]
    const first = p.takeNextSemanticWorkerRequest(pending, false)
    assert.equal(first.request, foreground, method)
    pending.push(record("complete", 3))
    assert.equal(p.takeNextSemanticWorkerRequest(pending, false, first.bypassedDiagnostic).request, oldest,
      `${method} may bypass once, then the oldest diagnosis must make progress`)
  }
})

test("all noninteractive global operations fence later foreground work", t => {
  const p = policy(t)
  for (const method of p.SEMANTIC_WORKER_METHODS.filter(m => m !== "diagnose" && !p.isInteractiveSemanticWorkerMethod(m))) {
    const oldest = record("diagnose", 1), barrier = record(method, 2), foreground = record("resolveCompletion", 3)
    const pending = [oldest, barrier, foreground]
    assert.equal(p.takeNextSemanticWorkerRequest(pending, false).request, oldest, method)
    assert.equal(p.takeNextSemanticWorkerRequest(pending, false).request, barrier, method)
    assert.equal(p.takeNextSemanticWorkerRequest(pending, false).request, foreground)
  }
})

test("mixed interactive arrivals cannot repeatedly bypass any original queue head", t => {
  const p = policy(t), methods = ["diagnose", "documentHighlights", "hover", "resolveCompletion", "complete", "signatureHelp"]
  const original = Array.from({ length: 128 }, (_, i) => record(methods[i % methods.length], i))
  const pending = [...original], seen = new Set(), bypasses = new Map()
  let bypassed, sequence = 128, step = 0
  while (pending.length) {
    const head = pending[0], next = p.takeNextSemanticWorkerRequest(pending, false, bypassed)
    if (next.request !== head) {
      const count = (bypasses.get(head.id) ?? 0) + 1
      assert.equal(count, 1, `head ${head.id}`); bypasses.set(head.id, count)
    }
    assert.ok(!seen.has(next.request.id)); seen.add(next.request.id)
    bypassed = next.bypassedDiagnostic
    if (step++ < 128) pending.push(record(step % 2 ? "complete" : "resolveCompletion", sequence++))
    assert.ok(step <= 256)
  }
  assert.ok(original.every(r => seen.has(r.id)))
})
