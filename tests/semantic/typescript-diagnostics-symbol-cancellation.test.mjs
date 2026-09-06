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

test("cancels document symbols during navigation mapping without publishing a partial tree", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-symbol-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const expectedNames = Array.from({ length: 130 }, (_, index) => `symbol${index}`)
  const mainSource = `${expectedNames
    .map((name) => `export function ${name}(): number { return ${name.length} }`)
    .join("\n")}\n`
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
  const realTree = realService.getNavigationTree(mainPath)
  assert.equal(realTree.childItems?.length, 130)
  const controlledItems = realTree.childItems.map((item, index) => controlledNavigationItem({
    item,
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
  }))
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getNavigationTree") {
        return () => ({ ...realTree, childItems: controlledItems })
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = semanticPosition(workspaceRoot, mainPath)
  let errorCaughtInsideDocumentSymbols
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.documentSymbols(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideDocumentSymbols = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideDocumentSymbols instanceof TypeScriptOperationCanceledException,
    true,
    "engine.documentSymbols must observe cancellation while mapping its own result",
  )
  assert.equal(sixtyFifthEntryAccessed, false)
  assert.equal(publishedResult, undefined, "cancelled symbols must not publish a partial tree")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.documentSymbols(position))
  assert.equal(retry.length, 130)
  assert.deepEqual(
    retry.map(({ name }) => name),
    expectedNames,
    "a fresh request must return every top-level symbol in stable source order",
  )
})

test("promotes a wide unsupported navigation container without spread overflow", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-symbol-wide-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "export const anchor = 1\n"
  const { TypeScriptLanguageServiceEngine } = buildDriver(t)
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot)
  t.after(() => engine.dispose())
  prepareEngine(engine, workspaceRoot, mainPath, mainSource)

  const realService = engine.service
  const realTree = realService.getNavigationTree(mainPath)
  const template = realTree.childItems?.[0]
  assert.ok(template)
  const childCount = 150_000
  const promotedChildren = Array.from({ length: childCount }, (_, index) => ({
    ...template,
    text: `wide${index}`,
  }))
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getNavigationTree") {
        return () => ({
          ...realTree,
          childItems: [{
            text: "unsupported-container",
            kind: "unsupported-container",
            kindModifiers: "",
            spans: template.spans,
            childItems: promotedChildren,
          }],
        })
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const symbols = engine.documentSymbols(semanticPosition(workspaceRoot, mainPath))
  assert.equal(symbols.length, childCount)
  assert.equal(symbols[0].name, "wide0")
  assert.equal(symbols[64].name, "wide64")
  assert.equal(symbols.at(-1).name, `wide${childCount - 1}`)
})

test("cancels a deep navigation tree before entering the sixty-fifth node", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-symbol-deep-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "export const anchor = 1\n"
  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptLanguageServiceEngine,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let sixtyFifthNodeAccessed = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  prepareEngine(engine, workspaceRoot, mainPath, mainSource)

  const realService = engine.service
  const realTree = realService.getNavigationTree(mainPath)
  const template = realTree.childItems?.[0]
  assert.ok(template)
  const nodeCount = 1_000
  let child
  for (let index = nodeCount - 1; index >= 0; index -= 1) {
    child = controlledDeepNavigationItem({
      item: {
        ...template,
        text: `depth${index}`,
        childItems: child ? [child] : undefined,
      },
      index,
      onSixtyFourthNode() {
        Atomics.store(
          cancellationView,
          0,
          SemanticWorkerCancelState.clientCancelled,
        )
      },
      onSixtyFifthNode() {
        sixtyFifthNodeAccessed = true
      },
    })
  }
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getNavigationTree") {
        return () => ({ ...realTree, childItems: [child] })
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = semanticPosition(workspaceRoot, mainPath)
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      publishedResult = engine.documentSymbols(position)
      return publishedResult
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )
  assert.equal(sixtyFifthNodeAccessed, false)
  assert.equal(publishedResult, undefined, "a cancelled deep tree must not publish partial symbols")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.documentSymbols(position))
  const names = []
  let current = retry[0]
  while (current) {
    names.push(current.name)
    current = current.children?.[0]
  }
  assert.equal(names.length, nodeCount)
  assert.equal(names[0], "depth0")
  assert.equal(names[64], "depth64")
  assert.equal(names.at(-1), `depth${nodeCount - 1}`)
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

function controlledNavigationItem({
  item,
  index,
  onSixtyFourthEntry,
  onSixtyFifthEntry,
}) {
  const controlled = { ...item }
  Object.defineProperty(controlled, "spans", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 64) onSixtyFifthEntry()
      return item.spans
    },
  })
  Object.defineProperty(controlled, "text", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthEntry()
      return item.text
    },
  })
  return controlled
}

function controlledDeepNavigationItem({
  item,
  index,
  onSixtyFourthNode,
  onSixtyFifthNode,
}) {
  const controlled = { ...item }
  Object.defineProperty(controlled, "spans", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthNode()
      if (index === 64) onSixtyFifthNode()
      return item.spans
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
