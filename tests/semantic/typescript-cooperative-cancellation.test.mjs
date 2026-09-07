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

test("maps large-file offsets through a reusable line-start index", (t) => {
  const { createLineStartIndex, offsetToLineColumn } = buildDriver(t)
  const source = `${Array.from({ length: 10000 }, (_, index) => `line${index}`).join("\n")}\nlast`
  const index = createLineStartIndex(source)
  const offset = source.lastIndexOf("last") + 2
  assert.deepEqual(offsetToLineColumn(source, offset, index), { line: 10001, column: 3 })
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
  assert.equal(retry.isIncomplete, true)
  assert.equal(retry.items.length, 128)
  assert.deepEqual(
    retry.items.map(({ label }) => label),
    Array.from({ length: 128 }, (_, index) => `method${index}`),
  )
  assert.equal(
    oneHundredTwentyNinthEntryAccessed,
    false,
    "completion must stop scanning once the bounded result is full",
  )
})

test("cancels cross-tier module-export scoring without publishing partial results", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-module-completion-cancel-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "const selected = me\n"
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

  const entries = Array.from({ length: 1_000 }, (_, index) => controlledCompletionEntry({
    index,
    onSixtyFourthEntry() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    onSixtyFifthEntry() {
      sixtyFifthEntryAccessed = true
    },
    onOneHundredTwentyNinthEntry() {},
  }))
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getCompletionsAtPosition") {
        return () => ({
          entries,
          isGlobalCompletion: true,
          isMemberCompletion: false,
          isNewIdentifierLocation: false,
        })
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  let publishedResult
  await assert.rejects(
    scope.run(cancellationCell, () => {
      publishedResult = engine.complete({
        path: mainPath,
        line: 1,
        column: mainSource.trimEnd().length + 1,
        documentVersion: 1,
        workspaceRoot,
      })
      return publishedResult
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )
  assert.equal(sixtyFifthEntryAccessed, false)
  assert.equal(publishedResult, undefined)
})

test("bounds object-property completion context lookup by syntax depth", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-completion-context-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const declarationCount = 10_000
  const completionLine = "const selected: Options = {  }"
  const mainSource = [
    ...Array.from({ length: declarationCount }, (_, index) => `const before${index} = ${index}`),
    "interface Options { title: string }",
    completionLine,
    "",
  ].join("\n")
  const { TypeScriptLanguageServiceEngine } = buildDriver(t)
  let checkpointCount = 0
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    checkpoint() {
      checkpointCount += 1
    },
  })
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)
  const realService = engine.service
  engine.service = new Proxy(realService, {
    get(target, property, receiver) {
      if (property === "getCompletionsAtPosition") {
        return () => ({
          entries: [{ name: "title", kind: "property", sortText: "11" }],
          isGlobalCompletion: false,
          isMemberCompletion: true,
          isNewIdentifierLocation: false,
        })
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })

  checkpointCount = 0
  const result = engine.complete({
    path: mainPath,
    line: declarationCount + 2,
    column: completionLine.indexOf("{") + 3,
    documentVersion: 1,
    workspaceRoot,
  })

  assert.equal(result.items[0]?.kind, "property")
  assert.ok(
    checkpointCount < 20,
    `context lookup must descend by syntax depth, observed ${checkpointCount} checkpoints`,
  )
})

test("counts Unicode code points for the module-export completion threshold", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-unicode-prefix-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const { TypeScriptLanguageServiceEngine } = buildDriver(t)

  function captureOptions(source, fileName) {
    const mainPath = path.join(workspaceRoot, fileName)
    const engine = new TypeScriptLanguageServiceEngine(workspaceRoot)
    t.after(() => engine.dispose())
    prepareSingleDocument(engine, workspaceRoot, mainPath, source)
    const realService = engine.service
    let observedOptions
    engine.service = new Proxy(realService, {
      get(target, property, receiver) {
        if (property === "getCompletionsAtPosition") {
          return (_path, _offset, options) => {
            observedOptions = options
            return {
              entries: [],
              isGlobalCompletion: false,
              isMemberCompletion: false,
              isNewIdentifierLocation: false,
            }
          }
        }
        const value = Reflect.get(target, property, receiver)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    engine.complete({
      path: mainPath,
      line: 1,
      column: source.length + 1,
      documentVersion: 1,
      workspaceRoot,
    })
    assert.ok(observedOptions)
    return observedOptions
  }

  assert.equal(
    captureOptions("const selected = 𐐀", "SingleCodePoint.ts")
      .includeCompletionsForModuleExports,
    false,
  )
  assert.equal(
    captureOptions("const selected = 𐐀R", "TwoCodePoints.ts")
      .includeCompletionsForModuleExports,
    true,
  )
})

test("propagates provider-reported TypeScript completion incompleteness below the local quota", (t) => {
  const harness = completionListHarness(t)
  const result = harness.complete({ count: 1, providerIncomplete: true })

  assert.equal(result.isIncomplete, true)
  assert.deepEqual(result.items.map(({ label }) => label), ["method0"])
})

test("applies TypeScript completion commit-character precedence", (t) => {
  const result = completionListHarness(t).complete({
    count: 3,
    defaultCommitCharacters: [".", ",", ";"],
    commitCharactersByIndex: [undefined, ["("], []],
  })

  assert.deepEqual(
    result.items.map(({ commitCharacters }) => commitCharacters),
    [[".", ",", ";"], ["("], []],
    "an explicit empty entry override must not inherit the list default",
  )
})

test("reports a fully consumed 127-entry TypeScript completion provider as complete", (t) => {
  const result = completionListHarness(t).complete({ count: 127 })

  assert.equal(result.isIncomplete, false)
  assert.equal(result.items.length, 127)
})

test("reports an exact 128-entry TypeScript completion provider as complete", (t) => {
  const result = completionListHarness(t).complete({ count: 128 })

  assert.equal(result.isIncomplete, false)
  assert.equal(result.items.length, 128)
})

test("reports an exact 128-match TypeScript completion tail as complete", (t) => {
  const result = completionListHarness(t).complete({
    count: 129,
    firstFilterText: "other",
  })

  assert.equal(result.isIncomplete, false)
  assert.deepEqual(
    result.items.map(({ label }) => label),
    Array.from({ length: 128 }, (_, index) => `method${index + 1}`),
    "the quota must retain the first 128 accepted entries, not the first 128 raw entries",
  )
})

test("reports a 129-entry TypeScript completion provider incomplete without reading entry 129", (t) => {
  const harness = completionListHarness(t)
  let oneHundredTwentyNinthEntryAccessed = false
  const result = harness.complete({
    count: 129,
    onOneHundredTwentyNinthEntry() {
      oneHundredTwentyNinthEntryAccessed = true
    },
  })

  assert.equal(result.isIncomplete, true)
  assert.deepEqual(
    result.items.map(({ label }) => label),
    Array.from({ length: 128 }, (_, index) => `method${index}`),
  )
  assert.equal(
    oneHundredTwentyNinthEntryAccessed,
    false,
    "completion must report an unscanned tail without reading the 129th entry",
  )
})

test("stops module-export scoring after 128 exact-prefix matches without reading entry 129", (t) => {
  const source = "const selected = Sta\n"
  const harness = completionListHarness(t, {
    mainSource: source,
    position: { line: 1, column: source.trimEnd().length + 1 },
  })
  const entries = Array.from({ length: 129 }, (_, index) => ({
    name: `StartType${String(index).padStart(3, "0")}`,
    kind: "const",
    sortText: "15",
  }))
  let oneHundredTwentyNinthEntryAccessed = false
  const oneHundredTwentyNinthEntry = entries[128]
  Object.defineProperty(entries, 128, {
    configurable: false,
    enumerable: true,
    get() {
      oneHundredTwentyNinthEntryAccessed = true
      return oneHundredTwentyNinthEntry
    },
  })

  const result = harness.complete({
    entries,
    isGlobalCompletion: true,
    isMemberCompletion: false,
  })

  assert.equal(result.items.length, 128)
  assert.equal(result.isIncomplete, true)
  assert.equal(
    oneHundredTwentyNinthEntryAccessed,
    false,
    "module-export completion must preserve the exact-prefix hard stop",
  )
})

test("bounds cross-tier module-export scoring after retaining a late exact match", (t) => {
  const source = "const selected = Sta\n"
  const harness = completionListHarness(t, {
    mainSource: source,
    position: { line: 1, column: source.trimEnd().length + 1 },
  })
  const entries = Array.from({ length: 100_000 }, (_, index) => ({
    name: index === 894
      ? "StaleType"
      : index < 895
        ? `SdkThingAlpha${String(index).padStart(5, "0")}`
        : `TailThing${String(index).padStart(5, "0")}`,
    kind: index === 894 ? "class" : "const",
    sortText: index < 880 ? "15" : "16",
    ...(index === 894 ? { source: path.join(harness.workspaceRoot, "Stale.ts") } : {}),
  }))
  let firstEntryBeyondBudgetAccessed = false
  const firstBeyondBudget = entries[4096]
  Object.defineProperty(entries, 4096, {
    configurable: false,
    enumerable: true,
    get() {
      firstEntryBeyondBudgetAccessed = true
      return firstBeyondBudget
    },
  })

  const result = harness.complete({
    entries,
    isGlobalCompletion: true,
    isMemberCompletion: false,
  })

  assert.equal(result.items[0]?.label, "StaleType")
  assert.equal(result.items.length, 128)
  assert.equal(result.isIncomplete, true)
  assert.equal(
    firstEntryBeyondBudgetAccessed,
    false,
    "module-export ranking must not scan beyond its explicit 4096-entry budget",
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

for (const {
  method,
  provider,
} of [
  { method: "define", provider: "getDefinitionAtPosition" },
  { method: "typeDefinitions", provider: "getTypeDefinitionAtPosition" },
]) {
  test(`cancels ${method} at the provider return boundary`, async (t) => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `arkts-ts-${method}-provider-cancel-`))
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

    const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
      hostCancellationToken: scope.hostToken,
      checkpoint: () => scope.checkpoint(),
    })
    t.after(() => engine.dispose())
    prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

    let targetMapped = false
    const target = {
      textSpan: { start: mainSource.indexOf("anchor"), length: "anchor".length },
    }
    Object.defineProperty(target, "fileName", {
      configurable: false,
      enumerable: true,
      get() {
        targetMapped = true
        return mainPath
      },
    })
    const realService = engine.service
    let cancelProvider = true
    engine.service = new Proxy(realService, {
      get(targetService, property, receiver) {
        if (property === provider) {
          return () => {
            if (cancelProvider) {
              Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
            }
            return [target]
          }
        }
        const value = Reflect.get(targetService, property, receiver)
        return typeof value === "function" ? value.bind(targetService) : value
      },
    })

    const position = {
      path: mainPath,
      line: 1,
      column: mainSource.indexOf("anchor") + 1,
      documentVersion: 1,
      workspaceRoot,
    }
    let errorCaughtInsideMethod
    let publishedResult
    await assert.rejects(
      scope.run(cancellationCell, () => {
        try {
          publishedResult = engine[method](position)
          return publishedResult
        } catch (error) {
          errorCaughtInsideMethod = error
          throw error
        }
      }),
      (error) => error instanceof TypeScriptOperationCanceledException,
    )

    assert.equal(
      errorCaughtInsideMethod instanceof TypeScriptOperationCanceledException,
      true,
      `engine.${method} must observe cancellation before mapping provider results`,
    )
    assert.equal(publishedResult, undefined)
    assert.equal(targetMapped, false, "provider-return cancellation must stop before mapping")

    cancelProvider = false
    const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    const retry = await scope.run(retryCell, () => engine[method](position))
    assert.equal(retry.length, 1)
    assert.equal(retry[0].path, mainPath)
    assert.equal(targetMapped, true)
  })

  test(`cancels ${method} during shared candidate mapping`, async (t) => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `arkts-ts-${method}-map-cancel-`))
    t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

    const mainPath = path.join(workspaceRoot, "Main.ts")
    const mainSource = [
      "export const anchor = 1",
      ...Array.from({ length: 130 }, (_, index) => `export const target${index} = ${index}`),
      "",
    ].join("\n")
    const targetOffsets = Array.from(
      { length: 130 },
      (_, index) => mainSource.indexOf(`target${index}`),
    )
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

    const rawDefinitions = targetOffsets.map((start, index) => controlledDefinitionCandidate({
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
      get(targetService, property, receiver) {
        if (property === provider) return () => rawDefinitions
        const value = Reflect.get(targetService, property, receiver)
        return typeof value === "function" ? value.bind(targetService) : value
      },
    })

    const position = {
      path: mainPath,
      line: 1,
      column: mainSource.indexOf("anchor") + 1,
      documentVersion: 1,
      workspaceRoot,
    }
    let errorCaughtInsideMethod
    let publishedResult
    await assert.rejects(
      scope.run(cancellationCell, () => {
        try {
          publishedResult = engine[method](position)
          return publishedResult
        } catch (error) {
          errorCaughtInsideMethod = error
          throw error
        }
      }),
      (error) => error instanceof TypeScriptOperationCanceledException,
    )

    assert.equal(
      errorCaughtInsideMethod instanceof TypeScriptOperationCanceledException,
      true,
      `engine.${method} must observe cancellation while mapping its own result`,
    )
    assert.equal(sixtyFifthEntryAccessed, false)
    assert.equal(publishedResult, undefined)

    const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    const retry = await scope.run(retryCell, () => engine[method](position))
    assert.equal(retry.length, 130)
    assert.deepEqual(
      retry.map(({ range }) => range.startLine),
      Array.from({ length: 130 }, (_, index) => index + 2),
    )
  })
}

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

function controlledDefinitionCandidate({
  index,
  mainPath,
  start,
  onSixtyFourthEntry,
  onSixtyFifthEntry,
}) {
  const definition = { textSpan: { start, length: `target${index}`.length } }
  Object.defineProperty(definition, "fileName", {
    configurable: false,
    enumerable: true,
    get() {
      if (index === 63) onSixtyFourthEntry()
      if (index === 64) onSixtyFifthEntry()
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

function completionListHarness(t, {
  mainSource = "const receiver = {}\nreceiver.me\n",
  position: completionPosition = {
    line: 2,
    column: "receiver.me".length + 1,
  },
} = {}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-completion-list-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const { TypeScriptLanguageServiceEngine } = buildDriver(t)
  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot)
  t.after(() => engine.dispose())
  prepareSingleDocument(engine, workspaceRoot, mainPath, mainSource)

  const realService = engine.service
  const position = {
    path: mainPath,
    ...completionPosition,
    documentVersion: 1,
    workspaceRoot,
  }
  return {
    workspaceRoot,
    complete({
      count,
      entries: suppliedEntries,
      commitCharactersByIndex = [],
      defaultCommitCharacters,
      firstFilterText,
      isGlobalCompletion = false,
      isMemberCompletion = true,
      providerIncomplete = false,
      onOneHundredTwentyNinthEntry,
    }) {
      const entries = suppliedEntries ?? Array.from({ length: count }, (_, index) => ({
        name: `method${index}`,
        kind: "method",
        sortText: "11",
        ...(commitCharactersByIndex[index] !== undefined
          ? { commitCharacters: commitCharactersByIndex[index] }
          : {}),
        ...(index === 0 && firstFilterText ? { filterText: firstFilterText } : {}),
      }))
      if (onOneHundredTwentyNinthEntry) {
        const lastEntry = entries[128]
        Object.defineProperty(entries, 128, {
          configurable: false,
          enumerable: true,
          get() {
            onOneHundredTwentyNinthEntry()
            return lastEntry
          },
        })
      }
      engine.service = new Proxy(realService, {
        get(target, property, receiver) {
          if (property === "getCompletionsAtPosition") {
            return () => ({
              entries,
              defaultCommitCharacters,
              isGlobalCompletion,
              isMemberCompletion,
              isNewIdentifierLocation: false,
              ...(providerIncomplete ? { isIncomplete: true } : {}),
            })
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === "function" ? value.bind(target) : value
        },
      })
      return engine.complete(position)
    },
  }
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
        'export { createLineStartIndex, offsetToLineColumn } from "./src/core/types/text-position.ts"',
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
