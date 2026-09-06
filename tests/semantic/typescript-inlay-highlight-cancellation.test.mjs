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

test("cancels inlay hints during display-part label mapping", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-inlay-parts-cancel-"))
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
  let sixtyFifthPartAccessed = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const displayParts = Array.from({ length: 130 }, (_, index) => controlledDisplayPart({
    index,
    onSixtyFourthPart() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthPart() {
      sixtyFifthPartAccessed = true
    },
  }))
  const rawHint = {
    displayParts,
    kind: ParameterInlayHintKind,
    position: mainSource.indexOf("value"),
  }
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "provideInlayHints") return () => [rawHint]
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

  assert.equal(errorCaughtInsideInlayHints instanceof TypeScriptOperationCanceledException, true)
  assert.equal(sixtyFifthPartAccessed, false)
  assert.equal(publishedResult, undefined)

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.inlayHints(position, requestedRange))
  assert.equal(retry.length, 1)
  assert.equal(
    retry[0].label,
    Array.from({ length: 130 }, (_, index) => `part${index}`).join(""),
  )
})

test("cancels document highlights during span mapping without publishing a partial list", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-highlight-span-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = `${Array.from(
    { length: 130 },
    (_, index) => `const target${index} = ${index}`,
  ).join("\n")}\n`
  const offsets = Array.from(
    { length: 130 },
    (_, index) => mainSource.indexOf(`target${index}`),
  )
  const driver = buildDriver(t)
  const scope = new driver.SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let sixtyFifthSpanAccessed = false
  const engine = preparedEngine(t, driver, scope, workspaceRoot, mainPath, mainSource)

  const highlightSpans = offsets.map((start, index) => controlledHighlightSpan({
    index,
    kind: driver.WrittenReferenceHighlightKind,
    start,
    onSixtyFourthSpan() {
      Atomics.store(cancellationView, 0, driver.SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthSpan() {
      sixtyFifthSpanAccessed = true
    },
  }))
  proxyDocumentHighlights(engine, [{ fileName: mainPath, highlightSpans }])
  const position = semanticPosition(workspaceRoot, mainPath)
  let errorCaughtInsideHighlights
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.documentHighlights(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideHighlights = error
        throw error
      }
    }),
    (error) => error instanceof driver.TypeScriptOperationCanceledException,
  )

  assert.equal(errorCaughtInsideHighlights instanceof driver.TypeScriptOperationCanceledException, true)
  assert.equal(sixtyFifthSpanAccessed, false)
  assert.equal(publishedResult, undefined)

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.documentHighlights(position))
  assert.equal(retry.length, 130)
  assert.deepEqual(
    retry.map(({ range }) => range.startLine),
    Array.from({ length: 130 }, (_, index) => index + 1),
  )
})

test("cancels document highlights while traversing empty result groups", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-highlight-group-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "const target = 1\n"
  const driver = buildDriver(t)
  const scope = new driver.SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let sixtyFifthGroupAccessed = false
  const engine = preparedEngine(t, driver, scope, workspaceRoot, mainPath, mainSource)

  const groups = Array.from({ length: 130 }, (_, index) => controlledHighlightGroup({
    index,
    mainPath,
    onSixtyFourthGroup() {
      Atomics.store(cancellationView, 0, driver.SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthGroup() {
      sixtyFifthGroupAccessed = true
    },
  }))
  proxyDocumentHighlights(engine, groups)
  const position = semanticPosition(workspaceRoot, mainPath)
  let errorCaughtInsideHighlights
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.documentHighlights(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideHighlights = error
        throw error
      }
    }),
    (error) => error instanceof driver.TypeScriptOperationCanceledException,
  )

  assert.equal(errorCaughtInsideHighlights instanceof driver.TypeScriptOperationCanceledException, true)
  assert.equal(sixtyFifthGroupAccessed, false)
  assert.equal(publishedResult, undefined)
  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  assert.deepEqual(await scope.run(retryCell, () => engine.documentHighlights(position)), [])
})

test("cancels document highlights at the provider return boundary", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-highlight-provider-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "const target = 1\n"
  const driver = buildDriver(t)
  const scope = new driver.SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let groupAccessed = false
  const engine = preparedEngine(t, driver, scope, workspaceRoot, mainPath, mainSource)

  const group = { highlightSpans: [] }
  Object.defineProperty(group, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      groupAccessed = true
      return mainPath
    },
  })
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getDocumentHighlights") {
        return () => {
          Atomics.store(cancellationView, 0, driver.SemanticWorkerCancelState.clientCancelled)
          return [group]
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
  const position = semanticPosition(workspaceRoot, mainPath)
  let errorCaughtInsideHighlights
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.documentHighlights(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideHighlights = error
        throw error
      }
    }),
    (error) => error instanceof driver.TypeScriptOperationCanceledException,
  )

  assert.equal(errorCaughtInsideHighlights instanceof driver.TypeScriptOperationCanceledException, true)
  assert.equal(groupAccessed, false)
  assert.equal(publishedResult, undefined)
  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  assert.deepEqual(await scope.run(retryCell, () => engine.documentHighlights(position)), [])
  assert.equal(groupAccessed, true)
})

test("cancels document highlights during result sorting", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-highlight-sort-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = `${Array.from(
    { length: 130 },
    (_, index) => `const target${index} = ${index}`,
  ).join("\n")}\n`
  const offsets = Array.from(
    { length: 130 },
    (_, index) => mainSource.indexOf(`target${index}`),
  )
  const driver = buildDriver(t)
  const scope = new driver.SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  const engine = preparedEngine(t, driver, scope, workspaceRoot, mainPath, mainSource)
  const highlightSpans = [...offsets].reverse().map((start) => ({
    kind: driver.WrittenReferenceHighlightKind,
    textSpan: { start, length: "target".length },
  }))
  proxyDocumentHighlights(engine, [{ fileName: mainPath, highlightSpans }])

  const originalSort = Array.prototype.sort
  let comparisons = 0
  let sixtyFifthComparisonStarted = false
  let sortCompleted = false
  Array.prototype.sort = function controlledSort(compare) {
    if (this.length !== 130 || typeof compare !== "function") {
      return originalSort.call(this, compare)
    }
    const result = originalSort.call(this, (left, right) => {
      comparisons += 1
      if (comparisons === 64) {
        Atomics.store(cancellationView, 0, driver.SemanticWorkerCancelState.clientCancelled)
      }
      if (comparisons === 65) sixtyFifthComparisonStarted = true
      return compare(left, right)
    })
    sortCompleted = true
    return result
  }
  const position = semanticPosition(workspaceRoot, mainPath)
  let errorCaughtInsideHighlights
  let publishedResult
  try {
    await assert.rejects(
      scope.run(cancellationCell, () => {
        try {
          publishedResult = engine.documentHighlights(position)
          return publishedResult
        } catch (error) {
          errorCaughtInsideHighlights = error
          throw error
        }
      }),
      (error) => error instanceof driver.TypeScriptOperationCanceledException,
    )
  } finally {
    Array.prototype.sort = originalSort
  }

  assert.equal(errorCaughtInsideHighlights instanceof driver.TypeScriptOperationCanceledException, true)
  assert.equal(sixtyFifthComparisonStarted, false)
  assert.equal(sortCompleted, false)
  assert.equal(publishedResult, undefined)
  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.documentHighlights(position))
  assert.deepEqual(
    retry.map(({ range }) => range.startLine),
    Array.from({ length: 130 }, (_, index) => index + 1),
  )
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

function controlledDisplayPart({ index, onSixtyFourthPart, onSixtyFifthPart }) {
  const part = {}
  Object.defineProperty(part, "text", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthPart()
      if (index === 64) onSixtyFifthPart()
      return `part${index}`
    },
  })
  return part
}

function controlledHighlightSpan({
  index,
  kind,
  start,
  onSixtyFourthSpan,
  onSixtyFifthSpan,
}) {
  const span = { kind }
  Object.defineProperty(span, "textSpan", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthSpan()
      if (index === 64) onSixtyFifthSpan()
      return { start, length: "target".length }
    },
  })
  return span
}

function controlledHighlightGroup({
  index,
  mainPath,
  onSixtyFourthGroup,
  onSixtyFifthGroup,
}) {
  const group = { highlightSpans: [] }
  Object.defineProperty(group, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthGroup()
      if (index === 64) onSixtyFifthGroup()
      return mainPath
    },
  })
  return group
}

function preparedEngine(t, driver, scope, workspaceRoot, mainPath, mainSource) {
  const engine = new driver.TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)
  return engine
}

function proxyDocumentHighlights(engine, groups) {
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getDocumentHighlights") return () => groups
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
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
        'export const WrittenReferenceHighlightKind = ts.HighlightSpanKind.writtenReference',
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
