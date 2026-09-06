import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

test("cancels diagnostics during result mapping without publishing a partial list", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-diagnostic-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = `${Array.from(
    { length: 130 },
    (_, index) => `export const value${index}: number = "wrong${index}"`,
  ).join("\n")}\n`
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
  prepareEngine(engine, workspaceRoot, mainPath, mainSource)

  const realService = engine.service
  const realDiagnostics = realService.getSemanticDiagnostics(mainPath)
  assert.equal(realDiagnostics.length, 130)
  const controlledDiagnostics = realDiagnostics.map((diagnostic, index) => (
    controlledDiagnostic({
      diagnostic,
      index,
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
    })
  ))
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getSyntacticDiagnostics") return () => []
      if (property === "getSemanticDiagnostics") return () => controlledDiagnostics
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = semanticPosition(workspaceRoot, mainPath)
  let errorCaughtInsideDiagnostics
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.diagnostics(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideDiagnostics = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideDiagnostics instanceof TypeScriptOperationCanceledException,
    true,
    "engine.diagnostics must observe cancellation while mapping its own result",
  )
  assert.equal(sixtyFifthEntryAccessed, false)
  assert.equal(publishedResult, undefined, "cancelled diagnostics must not publish a partial list")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.diagnostics(position))
  assert.equal(retry.length, 130)
  assert.deepEqual(
    retry.map(({ range }) => range.startLine),
    Array.from({ length: 130 }, (_, index) => index + 1),
    "a fresh request must return every diagnostic in stable source order",
  )
})

function controlledDiagnostic({
  diagnostic,
  index,
  onSixtyFourthEntry,
  onSixtyFifthEntry,
}) {
  const controlled = { ...diagnostic }
  Object.defineProperty(controlled, "start", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 64) onSixtyFifthEntry()
      return diagnostic.start
    },
  })
  Object.defineProperty(controlled, "messageText", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthEntry()
      return diagnostic.messageText
    },
  })
  return controlled
}

function prepareEngine(engine, workspaceRoot, mainPath, mainSource) {
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
}

function semanticPosition(workspaceRoot, mainPath) {
  return {
    path: mainPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot,
  }
}

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-diagnostic-symbol-driver-"))
  const outfile = path.join(outputRoot, "typescript-diagnostic-symbol-cancellation.cjs")
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
      sourcefile: "typescript-diagnostic-symbol-cancellation-driver.ts",
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
