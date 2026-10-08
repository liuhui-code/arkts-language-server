import assert from "node:assert/strict"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { buildSync } from "esbuild"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

test("the type engine registry uses the two-context coordinator and honors pressure", (t) => {
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-context-runtime-fixture-"))
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))
  const registry = new SemanticTypeEngineRegistry()
  t.after(() => registry.dispose())

  for (const name of ["a", "b", "c"]) {
    const rootPath = path.join(fixtureRoot, name)
    fs.mkdirSync(rootPath)
    const filePath = path.join(rootPath, "Main.ets")
    const content = `export const ${name} = 1\n`
    fs.writeFileSync(filePath, content)
    registry.prepare(workspace(rootPath, filePath, content)).documentSymbols({
      path: filePath,
      line: 1,
      column: 1,
      documentVersion: 1,
      workspaceRoot: rootPath,
    })
    assert.ok(registry.runtimeStats().residentContextCount <= 2)
  }

  assert.equal(registry.workspaceCount(), 2)
  registry.applyMemoryPressure("level2")
  assert.equal(registry.workspaceCount(), 2)
  registry.applyMemoryPressure("level3")
  assert.equal(registry.workspaceCount(), 0)
})

test("a failed optional script-admission observer cannot fail semantic preparation", (t) => {
  const { SemanticTypeEngineRegistry } = buildTypeEngineDriver(t)
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-admission-observer-"))
  t.after(() => fs.rmSync(rootPath, { recursive: true, force: true }))
  const filePath = path.join(rootPath, "Main.ets")
  const content = "export class MainThing {}\n"
  fs.writeFileSync(filePath, content)
  let observed = 0
  const registry = new SemanticTypeEngineRegistry(undefined, undefined, undefined, {
    references: { trace: true },
    onReferenceTrace(event) {
      if (event === "semantic.prepare.script-admission") {
        observed += 1
        throw new Error("observer unavailable")
      }
    },
  })
  t.after(() => registry.dispose())
  const state = registry.prepare(workspace(rootPath, filePath, content))
  assert.equal(state.state.engine, "typescript-language-service")
  assert.equal(observed, 1)
})

function workspace(rootPath, filePath, content) {
  return {
    rootPath,
    documents: [{
      path: filePath,
      content,
      documentVersion: 1,
      overlay: true,
    }],
    projectMembership: {
      status: "complete",
      paths: [filePath],
      revision: 1,
    },
    removedPaths: [],
    changedPaths: [],
    contentRevision: 1,
    resetTypeEngine: false,
    state: {
      path: filePath,
      contentGeneration: 1,
      documentVersion: 1,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: 1,
      syntaxReady: true,
    },
  }
}

function buildTypeEngineDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-context-runtime-"))
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
