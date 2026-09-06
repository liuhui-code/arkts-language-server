import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

const fixturePath = path.join(
  projectRoot,
  "fixtures",
  "semantic",
  "folding-range",
  "FoldingPage.ets",
)
const fixtureText = fs.readFileSync(fixturePath, "utf8")

test("returns the exact immutable line folds required by the public ArkUI fixture", (t) => {
  const { FoldingRangeProvider } = buildDriver(t)
  const provider = new FoldingRangeProvider()

  const ranges = provider.provide(fixtureText, { lineFoldingOnly: true, rangeLimit: 100 })

  assert.deepEqual(ranges, [
    { startLine: 0, endLine: 1, kind: "imports" },
    { startLine: 3, endLine: 6, kind: "comment" },
    { startLine: 10, endLine: 28 },
    { startLine: 11, endLine: 14 },
    { startLine: 16, endLine: 27 },
    { startLine: 17, endLine: 26 },
    { startLine: 18, endLine: 21 },
    { startLine: 23, endLine: 25 },
  ])
  assert.ok(Object.isFrozen(ranges))
  assert.ok(ranges.every((range) => Object.isFrozen(range)))
  assert.ok(ranges.every(({ startLine, endLine, startCharacter, endCharacter }) => (
    endLine > startLine
    && startCharacter === undefined
    && endCharacter === undefined
  )))
})

test("honors the client rangeLimit with stable character-aware folds", (t) => {
  const { FoldingRangeProvider } = buildDriver(t)
  const provider = new FoldingRangeProvider()

  const first = provider.provide(fixtureText, { lineFoldingOnly: false, rangeLimit: 3 })
  const second = provider.provide(fixtureText, { lineFoldingOnly: false, rangeLimit: 3 })

  assert.deepEqual(first, second)
  assert.equal(first.length, 3)
  assert.ok(first.every(({ startLine, endLine, startCharacter, endCharacter }) => (
    endLine > startLine
    && Number.isSafeInteger(startCharacter)
    && Number.isSafeInteger(endCharacter)
  )))
  assert.deepEqual([...first].sort(compareRanges), first)
})

test("skips string delimiters and fails closed at document, token, and depth limits", (t) => {
  const { FoldingRangeProvider } = buildDriver(t)
  const stringSource = [
    "const fake = `not a {",
    "  [structural]",
    "} range`",
    "function real() {",
    "  const value = fake",
    "}",
    "",
  ].join("\n")
  const safe = new FoldingRangeProvider()

  assert.deepEqual(safe.provide(stringSource, { lineFoldingOnly: true }), [
    { startLine: 3, endLine: 5 },
  ])
  assert.deepEqual(
    new FoldingRangeProvider({ maxDocumentBytes: 8 }).provide(stringSource, {}),
    [],
  )
  assert.deepEqual(
    new FoldingRangeProvider({ maxTokens: 4 }).provide("{\n one two three four\n}\n", {}),
    [],
  )
  assert.deepEqual(
    new FoldingRangeProvider({ maxDepth: 2 }).provide("{\n {\n  {\n  }\n }\n}\n", {}),
    [],
  )
  assert.deepEqual(safe.provide("{\n  unterminated\n", {}), [])
})

test("ignores structural delimiters inside regular-expression literals", (t) => {
  const { FoldingRangeProvider } = buildDriver(t)
  const source = [
    "function match() {",
    "  const escaped = /\\[/",
    "  const characterClass = /[{}]/",
    "  return escaped.test(\"[\") && characterClass.test(\"{\")",
    "}",
    "",
  ].join("\n")

  assert.deepEqual(
    new FoldingRangeProvider().provide(source, { lineFoldingOnly: true }),
    [{ startLine: 0, endLine: 4 }],
  )
})

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-folding-provider-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "folding-range-provider.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "syntax", "folding-range-provider.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function compareRanges(left, right) {
  return left.startLine - right.startLine
    || left.endLine - right.endLine
    || (left.startCharacter ?? 0) - (right.startCharacter ?? 0)
    || (left.endCharacter ?? 0) - (right.endCharacter ?? 0)
}
