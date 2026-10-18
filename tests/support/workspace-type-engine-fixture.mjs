import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

import { buildSync } from "esbuild"

import { projectRoot } from "./lsp-process.mjs"

export function buildTypeEngineDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-type-engine-driver-"))
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

export function completionSource(prefix) {
  return [
    "struct Home {",
    "  build() {",
    `    const value = ${prefix}`,
    "  }",
    "}",
  ].join("\n")
}

export function workspaceView(rootPath, mainPath, mainContent, additional = []) {
  return {
    rootPath,
    documents: [{ path: mainPath, content: mainContent }, ...additional],
    removedPaths: [],
    resetTypeEngine: false,
    state: {
      path: mainPath,
      contentGeneration: 1,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: additional.length + 1,
      syntaxReady: true,
    },
  }
}

export function completionPosition(documentPath, content) {
  const line = content.split("\n")[2]
  return {
    path: documentPath,
    line: 3,
    column: line.length + 1,
    workspaceRoot: path.dirname(documentPath),
  }
}

export function completionArbitrationHarness(t) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-completion-arbitration-"))
  const mainPath = path.join(workspaceRoot, "Main.ets")
  const source = completionSource("value")
  fs.writeFileSync(mainPath, source)
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => {
    registry.dispose()
    fs.rmSync(workspaceRoot, { recursive: true, force: true })
  })
  const context = registry.prepare(workspaceView(workspaceRoot, mainPath, source))
  const entry = registry.coordinator.peek(path.resolve(workspaceRoot))
  assert.ok(entry, "the prepared Registry must retain its provider entry")

  return {
    complete({ arkui, typescript }) {
      const calls = []
      entry.arkui.complete = () => {
        calls.push("arkui")
        return arkui
      }
      entry.engine.complete = () => {
        calls.push("typescript")
        return typescript
      }
      return {
        result: context.complete(completionPosition(mainPath, source)),
        calls,
      }
    },
  }
}

export function completionItem(label, source) {
  return {
    label,
    detail: `${source} ${label}`,
    kind: "property",
    source,
  }
}

export function definitionPosition(documentPath, workspaceRoot, content, name) {
  const offset = content.lastIndexOf(name) + 1
  const before = content.slice(0, offset)
  const lines = before.split("\n")
  return {
    path: documentPath,
    line: lines.length,
    column: lines.at(-1).length + 1,
    workspaceRoot,
  }
}
