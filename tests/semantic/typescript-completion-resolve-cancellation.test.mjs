import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

test("cancels completion resolve at the details provider return boundary", async (t) => {
  const harness = createResolveHarness(t, "provider")
  let cancelProvider = true
  let detailsAccessed = false
  const details = completionDetails()
  Object.defineProperty(details, "displayParts", {
    configurable: false,
    enumerable: true,
    get() {
      detailsAccessed = true
      return [{ kind: "text", text: "resolved detail" }]
    },
  })
  harness.installDetailsProvider(() => {
    if (cancelProvider) harness.cancel()
    return details
  })

  await expectCancellationInsideResolve(harness)
  assert.equal(detailsAccessed, false, "provider-return cancellation must stop before details mapping")

  cancelProvider = false
  const retry = await harness.retry()
  assert.equal(detailsAccessed, true)
  assert.equal(retry.detail, "resolved detail")
})

test("cancels completion resolve during detail display-part mapping", async (t) => {
  const harness = createResolveHarness(t, "detail-parts")
  let sixtyFifthPartAccessed = false
  const displayParts = controlledDisplayParts({
    count: 130,
    onSixtyFourthPart: harness.cancel,
    onSixtyFifthPart() {
      sixtyFifthPartAccessed = true
    },
  })
  harness.installDetailsProvider(() => completionDetails({ displayParts }))

  await expectCancellationInsideResolve(harness)
  assert.equal(sixtyFifthPartAccessed, false)

  const retry = await harness.retry()
  assert.equal(retry.detail, displayPartText(130))
})

test("cancels completion resolve during documentation display-part mapping", async (t) => {
  const harness = createResolveHarness(t, "documentation-parts")
  let sixtyFifthPartAccessed = false
  const documentation = controlledDisplayParts({
    count: 130,
    onSixtyFourthPart: harness.cancel,
    onSixtyFifthPart() {
      sixtyFifthPartAccessed = true
    },
  })
  harness.installDetailsProvider(() => completionDetails({
    displayParts: [],
    documentation,
  }))

  await expectCancellationInsideResolve(harness)
  assert.equal(sixtyFifthPartAccessed, false)

  const retry = await harness.retry()
  assert.equal(retry.detail, harness.item.detail, "empty detail must preserve the original fallback")
  assert.equal(retry.documentation, displayPartText(130))
})

test("cancels completion resolve while selecting the first safe code action", async (t) => {
  const harness = createResolveHarness(t, "action-scan")
  let sixtyFifthActionAccessed = false
  const rejectedActions = Array.from({ length: 130 }, (_, index) => {
    const action = {
      description: `rejected-${index}`,
    }
    Object.defineProperty(action, "changes", {
      configurable: false,
      enumerable: true,
      get() {
        throw new Error("commanded action changes must remain short-circuited")
      },
    })
    Object.defineProperty(action, "commands", {
      configurable: false,
      enumerable: true,
      get() {
        if (index === 63) harness.cancel()
        if (index === 64) sixtyFifthActionAccessed = true
        return [{ type: "install package", packageName: `package-${index}` }]
      },
    })
    return action
  })
  const safeAction = {
    description: "first-safe",
    changes: [completionChange(harness.mainPath, [{
      span: { start: 0, length: 0 },
      newText: "first-safe-edit\n",
    }])],
  }
  const foreignAction = {
    description: "foreign-file",
    changes: [completionChange(path.join(path.dirname(harness.mainPath), "Foreign.ts"), [{
      span: { start: 0, length: 0 },
      newText: "foreign-edit\n",
    }])],
  }
  const newFileAction = {
    description: "new-file",
    changes: [{
      ...completionChange(harness.mainPath, [{
        span: { start: 0, length: 0 },
        newText: "new-file-edit\n",
      }]),
      isNewFile: true,
    }],
  }
  const secondSafeAction = {
    description: "second-safe",
    changes: [completionChange(harness.mainPath, [{
      span: { start: 0, length: 0 },
      newText: "second-safe-edit\n",
    }])],
  }
  harness.installDetailsProvider(() => completionDetails({
    codeActions: [
      ...rejectedActions,
      { description: "empty", changes: [] },
      foreignAction,
      newFileAction,
      safeAction,
      secondSafeAction,
    ],
  }))

  await expectCancellationInsideResolve(harness)
  assert.equal(sixtyFifthActionAccessed, false)

  const retry = await harness.retry()
  assert.equal(retry.additionalTextEdits.length, 1)
  assert.equal(retry.additionalTextEdits[0].newText, "first-safe-edit\n")
})

test("cancels completion resolve while validating code-action changes", async (t) => {
  const harness = createResolveHarness(t, "change-validation")
  let sixtyFifthChangeAccessed = false
  let lastChangeAccessed = false
  const changes = Array.from({ length: 130 }, (_, index) => {
    const change = completionChange(harness.mainPath)
    Object.defineProperty(change, "fileName", {
      configurable: false,
      enumerable: true,
      get() {
        if (index === 63) harness.cancel()
        if (index === 64) sixtyFifthChangeAccessed = true
        if (index === 129) lastChangeAccessed = true
        return harness.mainPath
      },
    })
    return change
  })
  harness.installDetailsProvider(() => completionDetails({
    codeActions: [{ description: "safe", changes }],
  }))

  await expectCancellationInsideResolve(harness)
  assert.equal(sixtyFifthChangeAccessed, false)

  const retry = await harness.retry()
  assert.deepEqual(retry.additionalTextEdits, [])
  assert.equal(lastChangeAccessed, true, "fresh retry must validate every selected-action change")
})

test("cancels completion resolve while mapping code-action change groups", async (t) => {
  const harness = createResolveHarness(t, "change-mapping")
  let sixtyFifthGroupAccessed = false
  let lastGroupAccessed = false
  const changes = Array.from({ length: 130 }, (_, index) => {
    const change = {
      fileName: harness.mainPath,
      isNewFile: false,
    }
    Object.defineProperty(change, "textChanges", {
      configurable: false,
      enumerable: true,
      get() {
        if (index === 63) harness.cancel()
        if (index === 64) sixtyFifthGroupAccessed = true
        if (index === 129) lastGroupAccessed = true
        return []
      },
    })
    return change
  })
  harness.installDetailsProvider(() => completionDetails({
    codeActions: [{ description: "safe", changes }],
  }))

  await expectCancellationInsideResolve(harness)
  assert.equal(sixtyFifthGroupAccessed, false)

  const retry = await harness.retry()
  assert.deepEqual(retry.additionalTextEdits, [])
  assert.equal(lastGroupAccessed, true, "fresh retry must traverse every selected-action group")
})

test("cancels completion resolve while mapping code-action text changes", async (t) => {
  const harness = createResolveHarness(t, "text-change-mapping")
  let sixtyFifthEditAccessed = false
  const textChanges = Array.from({ length: 130 }, (_, index) => {
    const textChange = { newText: `edit-${index}` }
    Object.defineProperty(textChange, "span", {
      configurable: false,
      enumerable: true,
      get() {
        if (index === 63) harness.cancel()
        if (index === 64) sixtyFifthEditAccessed = true
        return { start: 0, length: 0 }
      },
    })
    return textChange
  })
  harness.installDetailsProvider(() => completionDetails({
    codeActions: [{
      description: "safe",
      changes: [completionChange(harness.mainPath, textChanges)],
    }],
  }))

  await expectCancellationInsideResolve(harness)
  assert.equal(sixtyFifthEditAccessed, false)

  const retry = await harness.retry()
  assert.equal(retry.additionalTextEdits.length, 130)
  assert.deepEqual(
    retry.additionalTextEdits.map(({ newText }) => newText),
    Array.from({ length: 130 }, (_, index) => `edit-${index}`),
  )
  assert.equal(retry.additionalTextEdits.every(({ expectedVersion }) => expectedVersion === 1), true)
})

function createResolveHarness(t, name) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `arkts-ts-resolve-${name}-`))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const mainPath = path.join(workspaceRoot, "Main.ts")
  const mainSource = "export const target = 1\n"
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
  const state = engine.prepare({
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
  const position = {
    path: mainPath,
    line: 1,
    column: mainSource.indexOf("target") + 1,
    documentVersion: 1,
    workspaceRoot,
  }
  const item = {
    label: "target",
    detail: "original detail",
    kind: "variable",
    documentation: "original documentation",
    data: {
      provider: "typescript",
      engineVersion: state.version,
      documentVersion: 1,
      entryName: "target",
    },
  }
  const realService = engine.service

  return {
    cancellationCell,
    cancel() {
      Atomics.store(cancellationView, 0, SemanticWorkerCancelState.clientCancelled)
    },
    engine,
    installDetailsProvider(provider) {
      engine.service = new Proxy(realService, {
        get(target, property, receiver) {
          if (property === "getCompletionEntryDetails") return provider
          const value = Reflect.get(target, property, receiver)
          return typeof value === "function" ? value.bind(target) : value
        },
      })
    },
    item,
    mainPath,
    position,
    retry() {
      const retryCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
      return scope.run(retryCell, () => engine.resolveCompletion(position, item))
    },
    scope,
    TypeScriptOperationCanceledException,
  }
}

async function expectCancellationInsideResolve(harness) {
  let errorCaughtInsideResolve
  let publishedResult
  await assert.rejects(
    harness.scope.run(harness.cancellationCell, () => {
      try {
        publishedResult = harness.engine.resolveCompletion(harness.position, harness.item)
        return publishedResult
      } catch (error) {
        errorCaughtInsideResolve = error
        throw error
      }
    }),
    (error) => error instanceof harness.TypeScriptOperationCanceledException,
  )
  assert.equal(
    errorCaughtInsideResolve instanceof harness.TypeScriptOperationCanceledException,
    true,
    "resolveCompletion must observe cancellation before returning to its caller",
  )
  assert.equal(publishedResult, undefined, "cancelled resolve must not publish a completion item")
}

function completionDetails(overrides = {}) {
  return {
    name: "target",
    kind: "const",
    kindModifiers: "export",
    displayParts: [{ kind: "text", text: "resolved detail" }],
    documentation: [],
    ...overrides,
  }
}

function completionChange(fileName, textChanges = []) {
  return {
    fileName,
    isNewFile: false,
    textChanges,
  }
}

function controlledDisplayParts({ count, onSixtyFourthPart, onSixtyFifthPart }) {
  return Array.from({ length: count }, (_, index) => {
    const part = { kind: "text" }
    Object.defineProperty(part, "text", {
      configurable: false,
      enumerable: true,
      get() {
        if (index === 63) onSixtyFourthPart()
        if (index === 64) onSixtyFifthPart()
        return `part-${index};`
      },
    })
    return part
  })
}

function displayPartText(count) {
  return Array.from({ length: count }, (_, index) => `part-${index};`).join("")
}

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-resolve-driver-"))
  const outfile = path.join(outputRoot, "typescript-completion-resolve-cancellation.cjs")
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
      sourcefile: "typescript-completion-resolve-cancellation-driver.ts",
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
