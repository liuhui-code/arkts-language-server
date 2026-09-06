import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

test("exposes one stable inactive TypeScript host token", (t) => {
  const { SemanticCancellationScope } = buildDriver(t)
  const scope = new SemanticCancellationScope()

  assert.strictEqual(scope.hostToken, scope.hostToken)
  assert.equal(scope.hostToken.isCancellationRequested(), false)
  assert.doesNotThrow(() => scope.checkpoint())
})

test("rejects every terminal request before entering its operation", async (t) => {
  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)

  for (const state of [
    SemanticWorkerCancelState.clientCancelled,
    SemanticWorkerCancelState.contentModified,
    SemanticWorkerCancelState.supervisorDisposing,
  ]) {
    const scope = new SemanticCancellationScope()
    const cell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    Atomics.store(new Int32Array(cell), 0, state)
    let entered = false

    await assert.rejects(
      scope.run(cell, () => { entered = true }),
      (error) => error instanceof TypeScriptOperationCanceledException,
    )
    assert.equal(entered, false)
    assert.equal(scope.hostToken.isCancellationRequested(), false)
  }
})

test("rejects a nested run without replacing the outer request", async (t) => {
  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const outerCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const nestedCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  let nestedEntered = false

  await assert.rejects(
    scope.run(outerCell, async () => {
      await assert.rejects(
        scope.run(nestedCell, () => { nestedEntered = true }),
        /Semantic cancellation scope already has an active request/,
      )
      assert.equal(nestedEntered, false)
      Atomics.store(
        new Int32Array(outerCell),
        0,
        SemanticWorkerCancelState.clientCancelled,
      )
      assert.equal(scope.hostToken.isCancellationRequested(), true)
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  assert.equal(scope.hostToken.isCancellationRequested(), false)
})

test("observes every in-flight terminal state through the stable host token", async (t) => {
  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const token = scope.hostToken

  for (const state of [
    SemanticWorkerCancelState.clientCancelled,
    SemanticWorkerCancelState.contentModified,
    SemanticWorkerCancelState.supervisorDisposing,
  ]) {
    const cell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
    await assert.rejects(
      scope.run(cell, () => {
        assert.strictEqual(scope.hostToken, token)
        assert.equal(token.isCancellationRequested(), false)
        Atomics.store(new Int32Array(cell), 0, state)
        assert.equal(token.isCancellationRequested(), true)
        scope.checkpoint()
      }),
      (error) => error instanceof TypeScriptOperationCanceledException,
    )
  }
  assert.equal(token.isCancellationRequested(), false)
})

test("clears the active cell after synchronous, asynchronous, and cancellation failures", async (t) => {
  const {
    SemanticCancellationScope,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const failures = [
    { error: new Error("synchronous failure"), operation(error) { throw error } },
    { error: new Error("asynchronous failure"), operation(error) { return Promise.reject(error) } },
    {
      error: new TypeScriptOperationCanceledException(),
      operation(error) { throw error },
    },
  ]
  const scope = new SemanticCancellationScope()

  for (const { error, operation } of failures) {
    await assert.rejects(
      scope.run(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT), () => operation(error)),
      (candidate) => candidate === error,
    )
    assert.equal(scope.hostToken.isCancellationRequested(), false)

    let entered = false
    await scope.run(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT), () => {
      entered = true
    })
    assert.equal(entered, true)
  }
})

test("fails closed when the active cancellation cell becomes corrupt", async (t) => {
  const {
    SemanticCancellationScope,
    SemanticWorkerProtocolError,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const cell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)

  await assert.rejects(
    scope.run(cell, () => {
      Atomics.store(new Int32Array(cell), 0, 99)
      return "must not escape"
    }),
    (error) => error instanceof SemanticWorkerProtocolError,
  )
  assert.equal(scope.hostToken.isCancellationRequested(), false)
})

test("accepts only a valid four-byte SharedArrayBuffer cancellation cell", async (t) => {
  const {
    SemanticCancellationScope,
    SemanticWorkerProtocolError,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const corrupt = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  Atomics.store(new Int32Array(corrupt), 0, 99)

  for (const cell of [
    new ArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
    new SharedArrayBuffer(0),
    new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2),
    corrupt,
  ]) {
    await assert.rejects(
      scope.run(cell, () => "must not run"),
      (error) => error instanceof SemanticWorkerProtocolError,
    )
    assert.equal(scope.hostToken.isCancellationRequested(), false)
  }

  assert.equal(
    await scope.run(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT), () => "valid"),
    "valid",
  )
})

test("does not leak a cancelled request into the next request cell", async (t) => {
  const {
    SemanticCancellationScope,
    SemanticWorkerCancelState,
    TypeScriptOperationCanceledException,
  } = buildDriver(t)
  const scope = new SemanticCancellationScope()
  const firstCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const nextCell = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)

  await assert.rejects(
    scope.run(firstCell, () => {
      Atomics.store(
        new Int32Array(firstCell),
        0,
        SemanticWorkerCancelState.clientCancelled,
      )
      scope.checkpoint()
    }),
    (error) => error instanceof TypeScriptOperationCanceledException,
  )

  const result = await scope.run(nextCell, () => {
    assert.equal(scope.hostToken.isCancellationRequested(), false)
    return "next request"
  })
  assert.equal(result, "next request")
  assert.equal(
    Atomics.load(new Int32Array(firstCell), 0),
    SemanticWorkerCancelState.clientCancelled,
  )
  assert.equal(Atomics.load(new Int32Array(nextCell), 0), SemanticWorkerCancelState.active)
})

function buildDriver(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-semantic-cancellation-"))
  const outfile = path.join(directory, "semantic-cancellation-scope.cjs")
  buildSync({
    stdin: {
      contents: [
        'import ts from "typescript"',
        'export { SemanticCancellationScope } from "./src/semantic/semantic-cancellation-scope.ts"',
        'export { SemanticWorkerCancelState, SemanticWorkerProtocolError } from "./src/semantic/worker-protocol.ts"',
        'export const TypeScriptOperationCanceledException = ts.OperationCanceledException',
      ].join("\n"),
      resolveDir: projectRoot,
      sourcefile: "semantic-cancellation-driver.ts",
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
    logLevel: "silent",
  })
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return createRequire(import.meta.url)(outfile)
}
