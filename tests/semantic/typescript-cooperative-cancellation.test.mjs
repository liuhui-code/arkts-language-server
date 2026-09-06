import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

test("cancels references during result mapping without publishing partial results", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-cooperative-cancel-"))
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
  const firstCancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const firstCancellationView = new Int32Array(firstCancellationCell)
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

  const rawReferences = [...targetOffsets]
    .reverse()
    .map((start, index) => controlledReference({
      definitionStart: targetOffsets[0],
      index,
      mainPath,
      start,
      onSixtyFourthEntry() {
        Atomics.store(
          firstCancellationView,
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
      if (property === "getDefinitionAtPosition") {
        return () => [{
          fileName: mainPath,
          textSpan: { start: targetOffsets[0], length: "target".length },
        }]
      }
      if (property === "findReferences") {
        return () => [{
          definition: {
            fileName: mainPath,
            textSpan: { start: targetOffsets[0], length: "target".length },
          },
          references: rawReferences,
        }]
      }
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
  let errorCaughtInsideReferences
  let publishedResult
  await assert.rejects(
    scope.run(firstCancellationCell, () => {
      try {
        publishedResult = engine.references(position, true)
        return publishedResult
      } catch (error) {
        errorCaughtInsideReferences = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideReferences instanceof TypeScriptOperationCanceledException,
    true,
    "engine.references must observe cancellation while mapping its own result",
  )
  assert.equal(sixtyFifthEntryAccessed, false)
  assert.equal(publishedResult, undefined, "a cancelled request must not publish partial results")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.references(position, true))
  assert.equal(retry.status, "complete")
  assert.equal(retry.references.length, 130)
  assert.deepEqual(
    retry.references.map(({ range }) => range.startLine),
    Array.from({ length: 130 }, (_, index) => index + 1),
    "a fresh request must return the complete, stable source order",
  )
})

function controlledReference({
  definitionStart,
  index,
  mainPath,
  start,
  onSixtyFourthEntry,
  onSixtyFifthEntry,
}) {
  const reference = {
    textSpan: { start, length: "target".length },
    isDefinition: start === definitionStart,
  }
  Object.defineProperty(reference, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthEntry()
      if (index === 64) onSixtyFifthEntry()
      return mainPath
    },
  })
  return reference
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
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-cooperative-driver-"))
  const outfile = path.join(outputRoot, "typescript-cooperative-cancellation.cjs")
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
      sourcefile: "typescript-cooperative-cancellation-driver.ts",
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
