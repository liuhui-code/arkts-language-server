import { getEventListeners } from "node:events"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { buildSync } from "esbuild"

const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-input-queue-"))
const output = path.join(root, "queue.mjs")
try {
  buildSync({ entryPoints: [new URL("../src/index/maintenance-inputs.ts", import.meta.url).pathname],
    outfile: output, bundle: true, platform: "node", format: "esm" })
} catch (error) { fs.rmSync(root, { recursive: true, force: true }); throw error }
const { MaintenanceInputs } = await import(pathToFileURL(output).href)
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }))
const intent = (uri, kind = "changed") => ({ changes: [{ uri, kind }], uncertainty: [] })
const ack = value => ({ accepted: true, status: { statusScope: "task", observedInput: value.input } })

test("observes input synchronously and merges the latest URI intent before delivery", async () => {
  const calls = []
  const q = new MaintenanceInputs("window-a", async payload => { calls.push(payload); return ack(payload) })
  q.observe(intent("file:///a.ets", "created"))
  const first = q.current
  q.observe(intent("file:///a.ets", "removed"))
  assert.equal(q.current.revision, first.revision + 1)
  assert.equal(calls.length, 0, "observation invalidates proof before asynchronous delivery")
  await q.flush()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { input: q.current, changes: [{ uri: "file:///a.ets", kind: "removed" }], uncertainty: [] })
  assert.equal(q.forReconcile(), q.current, "qualification must certify the delivered input, not a fabricated extra revision")
})

test("a refused or cancelled-before-admission reconcile has not consumed the Native input assignment", () => {
  const q = new MaintenanceInputs("window-a", async payload => ack(payload))
  const first = q.forReconcile()
  assert.equal(q.forReconcile(), first)
  q.acknowledgeReconcile(first)
  assert.equal(q.forReconcile().revision, first.revision + 1)
})

test("one in-flight change delivery retains one coalesced successor", async () => {
  const calls = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const q = new MaintenanceInputs("window-a", async payload => {
    calls.push(payload)
    if (calls.length === 1) await gate
    return ack(payload)
  })
  q.observe(intent("file:///a.ets"))
  await Promise.resolve()
  assert.equal(calls.length, 1)
  q.observe(intent("file:///b.ets", "created"))
  q.observe(intent("file:///b.ets", "changed"))
  assert.equal(calls.length, 1)
  release()
  await q.flush()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].input.revision, 3)
  assert.deepEqual(calls[1].changes, [{ uri: "file:///b.ets", kind: "changed" }])
})

test("overflow retains an explicit reconcile requirement rather than silently losing paths", async () => {
  const calls = []
  const q = new MaintenanceInputs("window-a", async payload => { calls.push(payload); return ack(payload) })
  for (let n = 0; n < 1000; n++) q.observe(intent(`file:///source${n}.ets`))
  await q.flush()
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].changes, [])
  assert.ok(calls[0].uncertainty.includes("watch-overflow"))
  assert.equal(calls[0].input.revision, 1000)
})

test("protocol UTF-8 byte bounds also collapse to reconciliation", async () => {
  const calls = []
  const q = new MaintenanceInputs("window-a", async payload => { calls.push(payload); return ack(payload) })
  q.observe(intent(`file:///${"界".repeat(1400)}.ets`))
  await q.flush()
  assert.deepEqual(calls[0].changes, [])
  assert.deepEqual(calls[0].uncertainty, ["watch-overflow"])
})

test("uncertainty is retained across coalesced observations and file spelling is preserved", async () => {
  const calls = []
  const q = new MaintenanceInputs("window-a", async payload => { calls.push(payload); return ack(payload) })
  q.observe({ ...intent("file:///MixedCase.ets"), uncertainty: ["configuration"] })
  q.observe({ ...intent("file:///MixedCase.ets"), uncertainty: ["namespace", "configuration"] })
  await q.flush()
  assert.deepEqual(calls[0].changes, [{ uri: "file:///MixedCase.ets", kind: "changed" }])
  assert.deepEqual(new Set(calls[0].uncertainty), new Set(["configuration", "namespace"]))
})

test("a wrong observed-input ACK fails once and cannot release a read barrier", async () => {
  const failures = []
  let sends = 0
  const q = new MaintenanceInputs("window-a", async payload => {
    sends++
    return { ...ack(payload), status: { statusScope: "task", observedInput: { issuer: "other", revision: 1 } } }
  }, error => failures.push(error))
  q.observe(intent("file:///a.ets"))
  await assert.rejects(q.flush(), { name: "SidecarProtocolError" })
  q.observe(intent("file:///b.ets"))
  await assert.rejects(q.flush(), { name: "SidecarProtocolError" })
  assert.equal(sends, 1)
  assert.equal(failures.length, 1)
})

test("closing while delivery is in flight prevents successor sends", async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const calls = []
  const q = new MaintenanceInputs("window-a", async payload => { calls.push(payload); await gate; return ack(payload) })
  q.observe(intent("file:///a.ets"))
  await Promise.resolve()
  q.observe(intent("file:///b.ets"))
  const closed = new Error("closed")
  q.stop(closed)
  release()
  await assert.rejects(q.flush(), error => error === closed)
  assert.equal(calls.length, 1)
})

test("an input observed between the last drain and finally cannot lose its delivery wakeup", async () => {
  const calls = []
  const q = new MaintenanceInputs("window-a", async payload => {
    calls.push(payload)
    if (calls.length > 1) return ack(payload)
    return { status: ack(payload).status, get accepted() {
      queueMicrotask(() => q.observe(intent("file:///after-ack.ets")))
      return true
    } }
  })
  q.observe(intent("file:///before-ack.ets"))
  await q.flush()
  assert.equal(calls.length, 2)
  assert.equal(q.isObserved(q.current), true)
})


test("unacknowledged admission has a terminal and the same input can retry without a phantom observation", async () => {
  const q = new MaintenanceInputs("window-a", async payload => ack(payload))
  const input = q.forReconcile()
  await assert.rejects(q.waitForObserved(input), { name: "IndexInputObservationError" })
  q.expectAdmission(input)
  const controller = new AbortController()
  const waiting = q.waitForObserved(input, controller.signal)
  assert.equal(getEventListeners(controller.signal, "abort").length, 1)
  q.finishAdmission(input)
  await assert.rejects(waiting, /not acknowledged/)
  assert.equal(getEventListeners(controller.signal, "abort").length, 0)
  assert.equal(q.forReconcile(), input)
  q.expectAdmission(input)
  const retry = q.waitForObserved(input, controller.signal)
  q.acknowledgeReconcile(input)
  await retry
  q.finishAdmission(input)
  assert.equal(getEventListeners(controller.signal, "abort").length, 0)
  assert.equal(q.forReconcile().revision, input.revision + 1)
})

test("supersession and cancellation unsubscribe exact-input waiters without stopping shared delivery", async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const sent = []
  const q = new MaintenanceInputs("window-a", async payload => {
    sent.push(payload)
    if (sent.length === 1) await gate
    return ack(payload)
  })
  q.observe(intent("file:///a.ets"))
  await Promise.resolve()
  const obsolete = new AbortController()
  const old = q.waitForObserved(q.current, obsolete.signal)
  assert.equal(getEventListeners(obsolete.signal, "abort").length, 1)
  q.observe(intent("file:///b.ets"))
  await assert.rejects(old, /input changed/)
  assert.equal(getEventListeners(obsolete.signal, "abort").length, 0)
  const cancelled = new AbortController()
  const wait = q.waitForObserved(q.current, cancelled.signal)
  cancelled.abort()
  await assert.rejects(wait, { name: "AbortError" })
  assert.equal(getEventListeners(cancelled.signal, "abort").length, 0)
  assert.equal(sent.length, 1)
  release()
  await q.flush()
  assert.equal(sent.length, 2)
  const current = new AbortController()
  await q.waitForObserved(q.current, current.signal)
  assert.equal(getEventListeners(current.signal, "abort").length, 0)
})

test("owner failure rejects observation waiters and removes their abort listeners", async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const q = new MaintenanceInputs("window-a", async payload => { await gate; return ack(payload) })
  q.observe(intent("file:///a.ets"))
  const controller = new AbortController()
  const waiting = q.waitForObserved(q.current, controller.signal)
  const failure = new Error("controlled owner disposal")
  q.stop(failure)
  await assert.rejects(waiting, error => error === failure)
  assert.equal(getEventListeners(controller.signal, "abort").length, 0)
  release()
  await assert.rejects(q.flush(), error => error === failure)
  await assert.rejects(q.waitForObserved(q.current), error => error === failure)
})


test("source-policy snapshots coalesce with ordinary input barriers and explicit empty revocation survives", async () => {
  const calls = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const q = new MaintenanceInputs("window-a", async payload => {
    calls.push(payload); if (calls.length === 1) await gate; return ack(payload)
  })
  const row = { directory: "/Cache/workspaces/peer", workspaceIdentity: "file:///Peer", objectId: "old" }
  q.observe({ changes: [], uncertainty: ["namespace"], managedCacheNamespaces: [row] })
  row.objectId = "mutated after capture"
  await Promise.resolve()
  assert.equal(calls[0].managedCacheNamespaces[0].objectId, "old")
  q.observe(intent("file:///Real.ets"))
  q.observe({ changes: [], uncertainty: ["namespace"], managedCacheNamespaces: [] })
  release(); await q.flush()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1].managedCacheNamespaces, [])
  assert.deepEqual(calls[1].changes, intent("file:///Real.ets").changes)
  assert.deepEqual(calls[1].uncertainty, ["namespace"])
  assert.equal(calls[1].input, q.current)
})
