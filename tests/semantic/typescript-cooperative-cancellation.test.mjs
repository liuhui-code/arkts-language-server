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

test("cancels completion during the bounded raw entry scan without publishing partial results", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-completion-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "const receiver = {}\nreceiver.me\n"
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
  let oneHundredTwentyNinthEntryAccessed = false

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

  const entries = Array.from({ length: 130 }, (_, index) => controlledCompletionEntry({
    index,
    onSixtyFourthEntry() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthEntry() {
      sixtyFifthEntryAccessed = true
    },
    onOneHundredTwentyNinthEntry() {
      oneHundredTwentyNinthEntryAccessed = true
    },
  }))
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getCompletionsAtPosition") {
        return () => ({
          entries,
          isGlobalCompletion: false,
          isMemberCompletion: true,
          isNewIdentifierLocation: false,
        })
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = {
    path: mainPath,
    line: 2,
    column: "receiver.me".length + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  let errorCaughtInsideCompletion
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.complete(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideCompletion = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideCompletion instanceof TypeScriptOperationCanceledException,
    true,
    "engine.complete must observe cancellation while scanning its own raw result",
  )
  assert.equal(sixtyFifthEntryAccessed, false)
  assert.equal(publishedResult, undefined, "cancelled completion must not publish a partial list")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.complete(position))
  assert.equal(retry.length, 128)
  assert.deepEqual(
    retry.map(({ label }) => label),
    Array.from({ length: 128 }, (_, index) => `method${index}`),
  )
  assert.equal(
    oneHundredTwentyNinthEntryAccessed,
    false,
    "completion must stop scanning once the bounded result is full",
  )
})

test("cancels implementations during result filtering without publishing partial results", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-implementation-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = [
    "export const anchor = 1",
    ...Array.from({ length: 130 }, (_, index) => `export const use${index} = target`),
    "",
  ].join("\n")
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
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const rawImplementations = targetOffsets.map((start, index) => controlledImplementation({
    index,
    mainPath,
    start,
    onSixtyFourthEntry() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthEntry() {
      sixtyFifthEntryAccessed = true
    },
  }))
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getDefinitionAtPosition") return () => []
      if (property === "getImplementationAtPosition") return () => rawImplementations
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = {
    path: mainPath,
    line: 1,
    column: mainSource.indexOf("anchor") + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  let errorCaughtInsideImplementations
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.implementations(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideImplementations = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideImplementations instanceof TypeScriptOperationCanceledException,
    true,
    "engine.implementations must observe cancellation while filtering its own raw result",
  )
  assert.equal(sixtyFifthEntryAccessed, false)
  assert.equal(publishedResult, undefined, "cancelled implementations must not publish partial results")

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.implementations(position))
  assert.equal(retry.length, 130)
  assert.deepEqual(
    retry.map(({ range }) => range.startLine),
    Array.from({ length: 130 }, (_, index) => index + 2),
    "a fresh request must return every implementation in provider order",
  )
})

test("cancels implementations during shared candidate mapping", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-implementation-map-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = [
    "export const anchor = 1",
    ...Array.from({ length: 130 }, (_, index) => `export const mapped${index} = target`),
    "",
  ].join("\n")
  const targetOffsets = offsetsOf(mainSource, "target")
  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptLanguageServiceEngine,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let sixtyFifthMappingAccessed = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const rawImplementations = targetOffsets.map((start, index) => controlledMappedImplementation({
    index,
    mainPath,
    start,
    onSixtyFourthMapping() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthMapping() {
      sixtyFifthMappingAccessed = true
    },
  }))
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getDefinitionAtPosition") return () => []
      if (property === "getImplementationAtPosition") return () => rawImplementations
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = {
    path: mainPath,
    line: 1,
    column: mainSource.indexOf("anchor") + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  let errorCaughtInsideImplementations
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.implementations(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideImplementations = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideImplementations instanceof TypeScriptOperationCanceledException,
    true,
    "engine.implementations must observe cancellation inside shared candidate mapping",
  )
  assert.equal(sixtyFifthMappingAccessed, false)
  assert.equal(publishedResult, undefined)

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.implementations(position))
  assert.equal(retry.length, 130)
})

test("cancels implementations while indexing declarations before querying implementations", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-declaration-cancel-"))
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
  let sixtyFifthDefinitionAccessed = false
  let implementationProviderCalled = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    checkpoint: () => scope.checkpoint(),
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const rawDefinitions = Array.from({ length: 130 }, (_, index) => controlledDefinition({
    index,
    mainPath,
    onSixtyFourthDefinition() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthDefinition() {
      sixtyFifthDefinitionAccessed = true
    },
  }))
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getDefinitionAtPosition") return () => rawDefinitions
      if (property === "getImplementationAtPosition") {
        return () => {
          implementationProviderCalled = true
          return []
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  const position = {
    path: mainPath,
    line: 1,
    column: mainSource.indexOf("anchor") + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  let errorCaughtInsideImplementations
  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        publishedResult = engine.implementations(position)
        return publishedResult
      } catch (error) {
        errorCaughtInsideImplementations = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(
    errorCaughtInsideImplementations instanceof TypeScriptOperationCanceledException,
    true,
  )
  assert.equal(sixtyFifthDefinitionAccessed, false)
  assert.equal(implementationProviderCalled, false)
  assert.equal(publishedResult, undefined)

  const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const retry = await scope.run(retryCell, () => engine.implementations(position))
  assert.deepEqual(retry, [])
  assert.equal(implementationProviderCalled, true)
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

function controlledCompletionEntry({
  index,
  onSixtyFourthEntry,
  onSixtyFifthEntry,
  onOneHundredTwentyNinthEntry,
}) {
  const name = `method${index}`
  return {
    name,
    kind: "method",
    sortText: "11",
    get filterText() {
      if (index === 63) onSixtyFourthEntry()
      if (index === 64) onSixtyFifthEntry()
      if (index === 128) onOneHundredTwentyNinthEntry()
      return name
    },
  }
}

function controlledImplementation({
  index,
  mainPath,
  start,
  onSixtyFourthEntry,
  onSixtyFifthEntry,
}) {
  const implementation = { textSpan: { start, length: "target".length } }
  Object.defineProperty(implementation, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthEntry()
      if (index === 64) onSixtyFifthEntry()
      return mainPath
    },
  })
  return implementation
}

function controlledMappedImplementation({
  index,
  mainPath,
  start,
  onSixtyFourthMapping,
  onSixtyFifthMapping,
}) {
  let fileNameAccesses = 0
  const implementation = { textSpan: { start, length: "target".length } }
  Object.defineProperty(implementation, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      fileNameAccesses += 1
      if (fileNameAccesses === 2 && index === 63) onSixtyFourthMapping()
      if (fileNameAccesses === 2 && index === 64) onSixtyFifthMapping()
      return mainPath
    },
  })
  return implementation
}

function controlledDefinition({
  index,
  mainPath,
  onSixtyFourthDefinition,
  onSixtyFifthDefinition,
}) {
  const definition = { textSpan: { start: 0, length: 1 } }
  Object.defineProperty(definition, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthDefinition()
      if (index === 64) onSixtyFifthDefinition()
      return mainPath
    },
  })
  return definition
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
