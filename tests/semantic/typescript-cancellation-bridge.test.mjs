import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "../support/lsp-process.mjs"

test("interrupts a real TypeScript references query from a lazy project snapshot", async (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-cancel-bridge-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const mainPath = path.join(workspaceRoot, "Main.ts")
  const callerPath = path.join(workspaceRoot, "Caller.ts")
  const mainSource = [
    "export function target(value: number): number {",
    "  return value + 1",
    "}",
    "",
  ].join("\n")
  const callerSource = [
    'import { target } from "./Main"',
    "export const result = target(1)",
    "",
  ].join("\n")
  fs.writeFileSync(callerPath, callerSource, "utf8")
  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptLanguageServiceEngine,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cancellationCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const cancellationView = new Int32Array(cancellationCell)
  let lazyReadHappened = false

  const engine = new TypeScriptLanguageServiceEngine(workspaceRoot, {
    hostCancellationToken: scope.hostToken,
    readSourceFile(filePath) {
      if (path.resolve(filePath) !== callerPath) return null
      lazyReadHappened = true
      Atomics.store(
        cancellationView,
        0,
        SemanticWorkerCancelState.clientCancelled,
      )
      return callerSource
    },
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
      paths: [callerPath, mainPath],
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

  let errorCaughtInsideReferences
  let referencesReturnedNormally = false
  await assert.rejects(
    scope.run(cancellationCell, () => {
      try {
        const result = engine.references({
          path: mainPath,
          line: 1,
          column: mainSource.indexOf("target") + 1,
          documentVersion: 1,
          workspaceRoot,
        }, true)
        referencesReturnedNormally = true
        return result
      } catch (error) {
        errorCaughtInsideReferences = error
        throw error
      }
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(lazyReadHappened, true, "the cancellation must be injected by Caller.ts lazy loading")
  assert.equal(
    errorCaughtInsideReferences instanceof TypeScriptOperationCanceledException,
    true,
    "TypeScript must throw while engine.references is still on the stack",
  )
  assert.equal(
    referencesReturnedNormally,
    false,
    "engine.references must not return a result before the scope exit checkpoint",
  )
})

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-ts-cancel-driver-"))
  const outfile = path.join(outputRoot, "typescript-cancellation-bridge.cjs")
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
      sourcefile: "typescript-cancellation-bridge-driver.ts",
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
