import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

test("caps frozen completion providers independently before cross-provider deduplication", (t) => {
  const { arbitrateCompletionLists } = buildDriver(t)
  const arkuiItems = Array.from(
    { length: 130 },
    (_, index) => completionItem(`arkui-${String(index).padStart(3, "0")}`, "arkui"),
  )
  const typescriptItems = Array.from(
    { length: 130 },
    (_, index) => completionItem(`type-${String(index).padStart(3, "0")}`, "type"),
  )
  arkuiItems[128] = completionItem("late-shared", "arkui")
  typescriptItems[0] = completionItem("late-shared", "type")
  const arkui = completionList(arkuiItems)
  const typescript = completionList(typescriptItems)

  const result = arbitrateCompletionLists(arkui, typescript)

  assert.equal(result.isIncomplete, true)
  assert.equal(result.items.length, 256)
  assert.deepEqual(
    result.items.map(({ label }) => label),
    [...arkuiItems.slice(0, 128), ...typescriptItems.slice(0, 128)].map(({ label }) => label),
    "an ArkUI label outside its quota must not suppress a retained TypeScript item",
  )
  assert.strictEqual(result.items[0], arkuiItems[0])
  assert.strictEqual(result.items[128], typescriptItems[0])
  assert.strictEqual(result.items.at(-1), typescriptItems[127])
  assert.equal(arkui.items.length, 130)
  assert.equal(typescript.items.length, 130)

  const exact = arbitrateCompletionLists(
    completionList(arkuiItems.slice(0, 128)),
    completionList(typescriptItems.slice(0, 128)),
  )
  assert.equal(exact.isIncomplete, false)
  assert.equal(exact.items.length, 256)
})

test("preserves ArkUI priority and TypeScript source identity without quota refill", (t) => {
  const { arbitrateCompletionLists } = buildDriver(t)
  const arkuiItems = [
    completionItem("shared", "arkui"),
    completionItem("arkui-only", "arkui"),
  ]
  const duplicateAlpha = completionItem("duplicate", "type", "alpha")
  const duplicateBeta = completionItem("duplicate", "type", "beta")
  const typescriptItems = [
    completionItem("shared", "type"),
    duplicateAlpha,
    duplicateBeta,
    ...Array.from(
      { length: 127 },
      (_, index) => completionItem(`type-${String(index).padStart(3, "0")}`, "type"),
    ),
  ]

  const result = arbitrateCompletionLists(
    completionList(arkuiItems),
    completionList(typescriptItems),
  )

  assert.equal(result.isIncomplete, true)
  assert.equal(result.items.length, 129, "an unused ArkUI quota must not pull more TypeScript items")
  assert.deepEqual(result.items.slice(0, 4).map(({ label }) => label), [
    "shared",
    "arkui-only",
    "duplicate",
    "duplicate",
  ])
  assert.strictEqual(result.items[2], duplicateAlpha)
  assert.strictEqual(result.items[3], duplicateBeta)
  assert.equal(result.items.at(-1).label, "type-124")
  assert.equal(result.items.some(({ label }) => label === "type-125"), false)
  assert.equal(result.items.some(({ label }) => label === "type-126"), false)
})

test("ORs provider completeness without inventing incompleteness", (t) => {
  const { arbitrateCompletionLists } = buildDriver(t)
  const empty = completionList([])

  assert.equal(arbitrateCompletionLists(
    completionList([], true),
    empty,
  ).isIncomplete, true)
  assert.equal(arbitrateCompletionLists(
    empty,
    completionList([], true),
  ).isIncomplete, true)
  assert.deepEqual(arbitrateCompletionLists(empty, empty), {
    items: [],
    isIncomplete: false,
  })

  const arkuiOverflow = completionList(Array.from(
    { length: 129 },
    (_, index) => completionItem(`arkui-${index}`, "arkui"),
  ))
  const typescriptOverflow = completionList(Array.from(
    { length: 129 },
    (_, index) => completionItem(`type-${index}`, "type"),
  ))
  assert.equal(arbitrateCompletionLists(arkuiOverflow, empty).isIncomplete, true)
  assert.equal(arbitrateCompletionLists(empty, typescriptOverflow).isIncomplete, true)

  const suppressed = arbitrateCompletionLists(
    completionList([completionItem("shared", "arkui")]),
    completionList([completionItem("shared", "type")]),
  )
  assert.deepEqual(suppressed.items.map(({ source }) => source), ["arkui"])
  assert.equal(suppressed.isIncomplete, false)
})

function completionList(items, isIncomplete = false) {
  for (const item of items) Object.freeze(item)
  return Object.freeze({
    items: Object.freeze(items),
    isIncomplete,
  })
}

function completionItem(label, source, entrySource) {
  return {
    label,
    detail: `${source} ${label}`,
    kind: "property",
    source,
    ...(entrySource ? { data: { entrySource } } : {}),
  }
}

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-completion-arbitrator-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "completion-arbitrator.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "types", "completion-arbitrator.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
