import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

const fixtureRoot = path.join(projectRoot, "fixtures", "semantic", "document-highlight")
const currentPath = path.join(fixtureRoot, "Current.ets")
const otherPath = path.join(fixtureRoot, "Other.ets")
const overlayText = [
  "/* 😀 */ export let tracked = 0",
  "/* 😀 */ tracked = tracked + 1",
  "/* 😀 */ export const snapshot = tracked",
  "",
].join("\n")

test("returns sorted current-document write and read highlights from the overlay", (t) => {
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())
  const ranges = rangesOf(overlayText, "tracked")
  const context = registry.prepare({
    rootPath: fixtureRoot,
    documents: [
      {
        path: currentPath,
        content: overlayText,
        documentVersion: 7,
        overlay: true,
      },
      {
        path: otherPath,
        content: fs.readFileSync(otherPath, "utf8"),
        overlay: false,
      },
    ],
    projectMembership: {
      status: "complete",
      paths: [currentPath, otherPath],
      revision: 1,
    },
    removedPaths: [],
    changedPaths: [],
    contentRevision: 1,
    resetTypeEngine: false,
    state: {
      path: currentPath,
      contentGeneration: 1,
      documentVersion: 7,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: 2,
      syntaxReady: true,
    },
  })
  const position = {
    path: currentPath,
    line: ranges[2].startLine,
    column: ranges[2].startColumn,
    documentVersion: 7,
    workspaceRoot: fixtureRoot,
  }
  const expected = [
    { range: ranges[0], kind: "write" },
    { range: ranges[1], kind: "write" },
    { range: ranges[2], kind: "read" },
    { range: ranges[3], kind: "read" },
  ]

  assert.deepEqual(context.documentHighlights(position), expected)
  assert.deepEqual(context.documentHighlights(position), expected)
})

function buildTypeEngineDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-highlight-core-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "type-engine.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "core", "types", "type-engine.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}

function rangesOf(source, name) {
  const ranges = []
  let offset = 0
  while ((offset = source.indexOf(name, offset)) >= 0) {
    ranges.push(toSemanticRange(source, offset, name.length))
    offset += name.length
  }
  assert.deepEqual(ranges.map(({ startColumn }) => startColumn), [21, 10, 20, 34])
  return ranges
}

function toSemanticRange(source, start, length) {
  const from = lineColumnAt(source, start)
  const to = lineColumnAt(source, start + length)
  return {
    startLine: from.line,
    startColumn: from.column,
    endLine: to.line,
    endColumn: to.column,
  }
}

function lineColumnAt(source, offset) {
  const prefix = source.slice(0, offset)
  const lines = prefix.split("\n")
  return { line: lines.length, column: lines.at(-1).length + 1 }
}
