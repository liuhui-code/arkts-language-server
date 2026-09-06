import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

test("cancels inlay hints during result mapping without publishing a partial list", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-inlay-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = `${Array.from(
    { length: 130 },
    (_, index) => `const value${index} = source${index}`,
  ).join("\n")}\n`
  const hintOffsets = Array.from(
    { length: 130 },
    (_, index) => mainSource.indexOf(`value${index}`),
  )
  const {
    ParameterInlayHintKind,
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptLanguageServiceEngine,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let sixtyFifthHintAccessed = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const rawHints = hintOffsets.map((position, index) => controlledInlayHint({
    index,
    kind: ParameterInlayHintKind,
    position,
    onSixtyFourthHint() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthHint() {
      sixtyFifthHintAccessed = true
    },
  }))
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "provideInlayHints") return () => rawHints
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = {
    path: mainPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot,
  }
  const requestedRange = {
    startLine: 1,
    startColumn: 1,
    endLine: 131,
    endColumn: 1,
  }
  let errorCaughtInsideInlayHints
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.inlayHints(position, requestedRange)
        return publishedResult
      } catch (error) {
        errorCaughtInsideInlayHints = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideInlayHints instanceof TypeScriptOperationCanceledException,
    true,
    "engine.inlayHints must observe cancellation while mapping its own result",
  )
  assert.equal(sixtyFifthHintAccessed, false)
  assert.equal(publishedResult, undefined, "cancelled inlay hints must not publish a partial list")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.inlayHints(position, requestedRange))
  assert.equal(retry.length, 130)
  assert.deepEqual(
    retry.map(({ label }) => label),
    Array.from({ length: 130 }, (_, index) => `parameter${index}:`),
  )
})

test("cancels inlay hints after the TypeScript provider before reading its first result", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-inlay-provider-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "const value = source\n"
  const {
    ParameterInlayHintKind,
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptLanguageServiceEngine,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let hintAccessed = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const rawHint = {
    position: mainSource.indexOf("value"),
    text: "parameter:",
  }
  Object.defineProperty(rawHint, "kind", {
    configurable: false,
    enumerable: true,
    get() {
      hintAccessed = true
      return ParameterInlayHintKind
    },
  })
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "provideInlayHints") {
        return () => {
          Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
          return [rawHint]
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = {
    path: mainPath,
    line: 1,
    column: 1,
    documentVersion: 1,
    workspaceRoot,
  }
  const requestedRange = {
    startLine: 1,
    startColumn: 1,
    endLine: 2,
    endColumn: 1,
  }
  let errorCaughtInsideInlayHints
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.inlayHints(position, requestedRange)
        return publishedResult
      } catch (error) {
        errorCaughtInsideInlayHints = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideInlayHints instanceof TypeScriptOperationCanceledException,
    true,
    "engine.inlayHints must observe provider-side cancellation at its return boundary",
  )
  assert.equal(hintAccessed, false)
  assert.equal(publishedResult, undefined)

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.inlayHints(position, requestedRange))
  assert.equal(retry.length, 1)
  assert.equal(hintAccessed, true)
})

function controlledInlayHint({
  index,
  kind,
  position,
  onSixtyFourthHint,
  onSixtyFifthHint,
}) {
  const hint = {
    kind,
    text: `parameter${index}:`,
    whitespaceAfter: false,
    whitespaceBefore: true,
  }
  Object.defineProperty(hint, "position", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthHint()
      if (index === 64) onSixtyFifthHint()
      return position
    },
  })
  return hint
}

function prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource) {
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

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-inlay-highlight-driver-"))
  const outfile = path.join(outputRoot, "typescript-inlay-highlight-cancellation.cjs")
  buildSync({
    stdin: {
      contents: [
        'import ts from "typescript"',
        'export { TypeScriptLanguageServiceEngine } from "./src/core/types/typescript-language-service.ts"',
        'export { SemanticCancellationScope } from "./src/semantic/semantic-cancellation-scope.ts"',
        'export { SemanticWorkerCancelState } from "./src/semantic/worker-protocol.ts"',
        'export const ParameterInlayHintKind = ts.InlayHintKind.Parameter',
        'export const TypeScriptOperationCanceledException = ts.OperationCanceledException',
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "typescript-inlay-highlight-cancellation-driver.ts",
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
