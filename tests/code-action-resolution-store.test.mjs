import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

test("bounds code-action resolutions to the newest 512 entries", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const remembered = Array.from({ length: 513 }, (_, index) => (
    store.remember(record(`file:///workspace/Action-${index}.ets`, index + 1))
  ))

  assert.deepEqual(store.lookup(remembered[0]), { status: "unknown" })
  assert.deepEqual(store.lookup(remembered[1]), {
    status: "active",
    record: record("file:///workspace/Action-1.ets", 2),
  })
  assert.deepEqual(store.lookup(remembered[512]), {
    status: "active",
    record: record("file:///workspace/Action-512.ets", 513),
  })
})

test("exposes only an opaque UUID and rejects non-canonical client data", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const data = store.remember(record("file:///workspace/Main.ets", 7))

  assert.deepEqual(Object.keys(data), ["arktsCodeActionId"])
  assert.match(
    data.arktsCodeActionId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  assert.deepEqual(store.lookup({ ...data, documentUri: "file:///forged.ets" }), {
    status: "unknown",
  })
  const hiddenExtra = { ...data }
  Object.defineProperty(hiddenExtra, "documentVersion", { value: 7 })
  assert.deepEqual(store.lookup(hiddenExtra), { status: "unknown" })
  assert.deepEqual(store.lookup({ arktsCodeActionId: "not-a-uuid" }), { status: "unknown" })
  assert.deepEqual(store.lookup(null), { status: "unknown" })
})

test("forgets one document as stale while forged identifiers remain unknown", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const first = store.remember(record("file:///workspace/Main.ets", 7))
  const second = store.remember(record("file:///workspace/Main.ets", 7))
  const other = store.remember(record("file:///workspace/Other.ets", 3))

  store.forgetDocument("file:///workspace/Main.ets")

  assert.deepEqual(store.lookup(first), { status: "stale" })
  assert.deepEqual(store.lookup(second), { status: "stale" })
  assert.equal(store.lookup(other).status, "active")
  assert.deepEqual(store.lookup({
    arktsCodeActionId: "00000000-0000-4000-8000-000000000000",
  }), { status: "unknown" })
})

test("clear removes both active records and stale tombstones", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const stale = store.remember(record("file:///workspace/Stale.ets", 1))
  const active = store.remember(record("file:///workspace/Active.ets", 2))
  store.forgetDocument("file:///workspace/Stale.ets")

  store.clear()

  assert.deepEqual(store.lookup(stale), { status: "unknown" })
  assert.deepEqual(store.lookup(active), { status: "unknown" })
})

test("snapshots and deeply freezes records across the client boundary", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const source = record("file:///workspace/Main.ets", 7)
  const data = store.remember(source)

  source.action.title = "Forged before lookup"
  source.action.diagnostic.range.start.character = 0
  source.fingerprint = "forged"
  const first = store.lookup(data)

  assert.equal(first.status, "active")
  assert.equal(first.record.action.title, "Change spelling to 'greeting'")
  assert.equal(first.record.action.diagnostic.range.start.character, 19)
  assert.equal(first.record.fingerprint, "sha256:spelling-greeting")
  assert.equal(Object.isFrozen(data), true)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.record), true)
  assert.equal(Object.isFrozen(first.record.action.diagnostic.range.start), true)
  assert.throws(() => {
    first.record.action.title = "Forged after lookup"
  }, TypeError)
  assert.equal(store.lookup(data).record.action.title, "Change spelling to 'greeting'")
})

test("evicts oldest records when canonical payloads exceed 512 KiB in total", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const firstRecord = record("file:///workspace/First.ets", 1)
  const secondRecord = record("file:///workspace/Second.ets", 1)
  firstRecord.action.diagnostic.message = "a".repeat(300 * 1024)
  secondRecord.action.diagnostic.message = "b".repeat(300 * 1024)

  const first = store.remember(firstRecord)
  const second = store.remember(secondRecord)

  assert.deepEqual(store.lookup(first), { status: "unknown" })
  assert.equal(store.lookup(second).status, "active")
})

test("rejects one oversized record without evicting existing resolutions", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const existing = store.remember(record("file:///workspace/Existing.ets", 1))
  const oversized = record("file:///workspace/Oversized.ets", 1)
  oversized.action.diagnostic.message = "x".repeat(512 * 1024)

  assert.throws(
    () => store.remember(oversized),
    /Code-action resolution record exceeds 524288 bytes/,
  )
  assert.equal(store.lookup(existing).status, "active")
})

test("tombstones release record bytes but remain inside the 512-entry bound", (t) => {
  const { CodeActionResolutionStore } = buildDriver(t)
  const store = new CodeActionResolutionStore()
  const firstRecord = record("file:///workspace/First.ets", 1)
  const secondRecord = record("file:///workspace/Second.ets", 1)
  firstRecord.action.diagnostic.message = "a".repeat(300 * 1024)
  secondRecord.action.diagnostic.message = "b".repeat(300 * 1024)
  const first = store.remember(firstRecord)
  store.forgetDocument(firstRecord.documentUri)
  const second = store.remember(secondRecord)

  assert.deepEqual(store.lookup(first), { status: "stale" })
  assert.equal(store.lookup(second).status, "active")

  store.forgetDocument(secondRecord.documentUri)
  const later = Array.from({ length: 511 }, (_, index) => {
    const uri = `file:///workspace/Later-${index}.ets`
    const data = store.remember(record(uri, index + 1))
    store.forgetDocument(uri)
    return data
  })

  assert.deepEqual(store.lookup(first), { status: "unknown" })
  assert.deepEqual(store.lookup(second), { status: "stale" })
  assert.deepEqual(store.lookup(later[510]), { status: "stale" })
})

function record(documentUri, documentVersion) {
  return {
    documentUri,
    documentVersion,
    action: {
      title: "Change spelling to 'greeting'",
      kind: "quickfix",
      diagnostic: {
        range: {
          start: { line: 3, character: 19 },
          end: { line: 3, character: 26 },
        },
        severity: 1,
        code: 2552,
        source: "arkts",
        message: "Cannot find name 'greting'. Did you mean 'greeting'?",
      },
    },
    fingerprint: "sha256:spelling-greeting",
  }
}

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-code-action-store-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "code-action-resolution-store.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "lsp", "code-action-resolution-store.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
