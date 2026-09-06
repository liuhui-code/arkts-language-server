import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

test("cancels rename during result mapping without publishing partial edits", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-rename-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const lines = [
    "export const target = 1",
    ...Array.from({ length: 129 }, (_, index) => `export const use${index} = target`),
  ]
  const mainSource = `${lines.join("\n")}\n`
  const targetOffsets = offsetsOf(mainSource, "target")
  assert.equal(targetOffsets.length, 130)

  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptLanguageServiceEngine,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let sixtyFifthEntryAccessed = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  engine.prepare({
    rootPath: workspaceRoot,
    documents: [{
      path: mainPath,
      content: mainSource,
      documentVersion: 1,
      overlay: true,
    }],
    projectMembership: {
      paths: [mainPath],
      status: "complete",
      revision: 1,
    },
    contentRevision: 1,
    resetTypeEngine: false,
    state: {
      path: mainPath,
      contentGeneration: 1,
      documentVersion: 1,
      dependencyGeneration: 1,
      documentCacheHit: false,
      dependencyClosureCacheHit: false,
      queryCacheHit: false,
      loadedDocumentCount: 1,
      syntaxReady: true,
    },
  })

  const rawLocations = [...targetOffsets]
    .reverse()
    .map((start, index) => controlledRenameLocation({
      index,
      mainPath,
      start,
      onSixtyFourthEntry() {
        Atomics.store(
          cancellationView,
          0,
          SemanticWorkerCancelState.clientCancelled,
        )
      },
      onSixtyFifthEntry() {
        sixtyFifthEntryAccessed = true
      },
    }))
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getRenameInfo") {
        return () => ({
          canRename: true,
          displayName: "target",
          fullDisplayName: "target",
          kind: "const",
          kindModifiers: "export",
          triggerSpan: { start: targetOffsets[0], length: "target".length },
        })
      }
      if (property === "findRenameLocations") return () => rawLocations
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = {
    path: mainPath,
    line: 1,
    column: mainSource.indexOf("target") + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  let errorCaughtInsideRename
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.rename(position, "renamed")
        return publishedResult
      } catch (error) {
        errorCaughtInsideRename = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideRename instanceof TypeScriptOperationCanceledException,
    true,
    "engine.rename must observe cancellation while mapping its own result",
  )
  assert.equal(sixtyFifthEntryAccessed, false)
  assert.equal(publishedResult, undefined, "a cancelled rename must not publish partial edits")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.rename(position, "renamed"))
  assert.equal(retry.status, "complete")
  assert.equal(retry.edits.length, 130)
  assert.deepEqual(
    retry.edits.map(({ range }) => range.startLine),
    Array.from({ length: 130 }, (_, index) => index + 1),
    "a fresh request must return the complete, stable source order",
  )
  for (let index = 1; index < retry.edits.length; index += 1) {
    assert.ok(
      retry.edits[index - 1].range.endLine <= retry.edits[index].range.startLine,
      "a successful retry must contain only non-overlapping edits",
    )
  }
})

function controlledRenameLocation({
  index,
  mainPath,
  start,
  onSixtyFourthEntry,
  onSixtyFifthEntry,
}) {
  const location = { textSpan: { start, length: "target".length } }
  Object.defineProperty(location, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthEntry()
      if (index === 64) onSixtyFifthEntry()
      return mainPath
    },
  })
  return location
}

function offsetsOf(source, token) {
  const offsets = []
  let offset = source.indexOf(token)
  while (offset >= 0) {
    offsets.push(offset)
    offset = source.indexOf(token, offset + token.length)
  }
  return offsets
}

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-rename-driver-"))
  const outfile = path.join(outputRoot, "typescript-rename-cancellation.cjs")
  buildSync({
    stdin: {
      contents: [
        'import ts from "typescript"',
        'export { TypeScriptLanguageServiceEngine } from "./src/core/types/typescript-language-service.ts"',
        'export { SemanticCancellationScope } from "./src/semantic/semantic-cancellation-scope.ts"',
        'export { SemanticWorkerCancelState } from "./src/semantic/worker-protocol.ts"',
        'export const TypeScriptOperationCanceledException = ts.OperationCanceledException',
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "typescript-rename-cancellation-driver.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
    logLevel: "silent",
  })
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  return createRequire(import.meta.url)(outfile)
}
