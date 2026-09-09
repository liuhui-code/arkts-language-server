import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"
import { MessageChannel } from "node:worker_threads"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

test("decodes a versioned semantic document mutation into an immutable snapshot", (t) => {
  const {
    SEMANTIC_WORKER_PROTOCOL_VERSION,
    decodeSemanticWorkerMutation,
  } = buildDriver(t)
  const input = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 2,
    revision: 7,
    kind: "change",
    uri: "file:///workspace/Main.ets",
    documentVersion: 3,
    text: "@Entry\nstruct Main {}\n",
  }

  const mutation = decodeSemanticWorkerMutation(input)

  assert.deepEqual(mutation, input)
  assert.notEqual(mutation, input)
  assert.equal(Object.isFrozen(mutation), true)
  input.text = "forged"
  assert.equal(mutation.text, "@Entry\nstruct Main {}\n")
})

test("rejects non-canonical mutation envelopes without reflecting hostile input", (t) => {
  const {
    SEMANTIC_WORKER_PROTOCOL_VERSION,
    SemanticWorkerProtocolError,
    decodeSemanticWorkerMutation,
  } = buildDriver(t)
  const valid = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 2,
    revision: 7,
    kind: "open",
    uri: "file:///workspace/Main.ets",
    documentVersion: 0,
    text: "struct Main {}\n",
  }
  const invalid = [
    null,
    { ...valid, protocol: SEMANTIC_WORKER_PROTOCOL_VERSION + 1 },
    { ...valid, epoch: 0 },
    { ...valid, revision: 0 },
    { ...valid, kind: "delete" },
    { ...valid, uri: "https://example.com/Main.ets" },
    { ...valid, documentVersion: -1 },
    { ...valid, text: undefined },
    { ...valid, kind: "close", text: "must not cross the wire" },
    { ...valid, ignored: true },
  ]

  for (const candidate of invalid) {
    assert.throws(
      () => decodeSemanticWorkerMutation(candidate),
      (error) => (
        error instanceof SemanticWorkerProtocolError
        && error.message === "Invalid semantic worker mutation"
      ),
    )
  }

  assert.deepEqual(decodeSemanticWorkerMutation({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 2,
    revision: 7,
    kind: "close",
    uri: "file:///workspace/Main.ets",
    documentVersion: 0,
  }), {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 2,
    revision: 7,
    kind: "close",
    uri: "file:///workspace/Main.ets",
    documentVersion: 0,
  })
})

test("accepts only canonical file URIs that safely convert to local paths", (t) => {
  const protocol = buildDriver(t)
  const mutation = (uri) => ({
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    revision: 1,
    kind: "open",
    uri,
    documentVersion: 1,
    text: "struct Main {}\n",
  })

  for (const uri of [
    "file:///workspace/Main.ets",
    "file:///workspace/My%20Page.ets",
  ]) {
    assert.equal(protocol.decodeSemanticWorkerMutation(mutation(uri)).uri, uri)
  }
  for (const uri of [
    "file:///workspace/%41.ets",
    "file:///workspace/Main%00.ets",
    "file:///workspace/encoded%2Fslash.ets",
    "file:///workspace/encoded%2fslash.ets",
    "file:///workspace/encoded%5Cbackslash.ets",
    "file:///workspace/encoded%5cbackslash.ets",
    "file:///workspace/bad%ZZescape.ets",
    "file://remote-host/workspace/Main.ets",
    `file:///workspace/raw${String.fromCharCode(0)}nul.ets`,
  ]) {
    assert.throws(
      () => protocol.decodeSemanticWorkerMutation(mutation(uri)),
      /Invalid semantic worker mutation/,
    )
  }
})

test("classifies one canonical local file URI identity without throwing", (t) => {
  const { isCanonicalSemanticWorkerFileUri } = buildDriver(t)

  for (const uri of [
    "file:///workspace/",
    "file:///workspace/Main.ets",
    "file:///workspace/My%20Page.ets",
  ]) {
    assert.equal(isCanonicalSemanticWorkerFileUri(uri), true)
  }
  for (const value of [
    "file:///workspace/%41.ets",
    "file:///%77orkspace/",
    "file:///workspace/Main%00.ets",
    "file:///workspace/encoded%2Fslash.ets",
    "file:///workspace/encoded%5cbackslash.ets",
    "file://remote-host/workspace/Main.ets",
    "file:///workspace/Main.ets?query",
    "file:///workspace/Main.ets#fragment",
    `file:///workspace/raw${String.fromCharCode(0)}nul.ets`,
    "file:///workspace/bad%ZZescape.ets",
    null,
    {},
  ]) {
    assert.equal(isCanonicalSemanticWorkerFileUri(value), false)
  }
})

test("enforces independent document-text and serialized-message byte caps", (t) => {
  const {
    MAX_SEMANTIC_WORKER_MESSAGE_BYTES,
    MAX_SEMANTIC_WORKER_TEXT_BYTES,
    SEMANTIC_WORKER_PROTOCOL_VERSION,
    decodeSemanticWorkerMutation,
  } = buildDriver(t)
  const mutation = (text) => ({
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    revision: 1,
    kind: "change",
    uri: "file:///workspace/Main.ets",
    documentVersion: 1,
    text,
  })

  assert.throws(
    () => decodeSemanticWorkerMutation(mutation("x".repeat(MAX_SEMANTIC_WORKER_TEXT_BYTES + 1))),
    /Semantic worker document text exceeds byte limit/,
  )

  const escapeExpandedText = "\u0000".repeat(Math.ceil(MAX_SEMANTIC_WORKER_MESSAGE_BYTES / 6))
  assert.ok(Buffer.byteLength(escapeExpandedText) <= MAX_SEMANTIC_WORKER_TEXT_BYTES)
  assert.throws(
    () => decodeSemanticWorkerMutation(mutation(escapeExpandedText)),
    /Semantic worker message exceeds byte limit/,
  )
})

test("uses one exact four-byte shared cell and preserves the first terminal cancel reason", (t) => {
  const {
    SemanticWorkerCancelState,
    cancelSemanticWorkerRequest,
    createSemanticWorkerCancellationCell,
    readSemanticWorkerCancellationState,
  } = buildDriver(t)
  const cell = createSemanticWorkerCancellationCell()

  assert.ok(cell instanceof SharedArrayBuffer)
  assert.equal(cell.byteLength, 4)
  assert.equal(
    readSemanticWorkerCancellationState(cell),
    SemanticWorkerCancelState.active,
  )
  assert.equal(
    cancelSemanticWorkerRequest(cell, SemanticWorkerCancelState.contentModified),
    SemanticWorkerCancelState.contentModified,
  )
  assert.equal(
    cancelSemanticWorkerRequest(cell, SemanticWorkerCancelState.clientCancelled),
    SemanticWorkerCancelState.contentModified,
  )
  assert.equal(
    readSemanticWorkerCancellationState(cell),
    SemanticWorkerCancelState.contentModified,
  )

  for (const invalid of [new ArrayBuffer(4), new SharedArrayBuffer(8)]) {
    assert.throws(
      () => readSemanticWorkerCancellationState(invalid),
      /Invalid semantic worker cancellation cell/,
    )
  }
  assert.throws(
    () => cancelSemanticWorkerRequest(
      createSemanticWorkerCancellationCell(),
      SemanticWorkerCancelState.active,
    ),
    /Invalid semantic worker cancellation state/,
  )
})

test("decodes a query-by-reference request as a deeply immutable transport snapshot", (t) => {
  const {
    SEMANTIC_WORKER_PROTOCOL_VERSION,
    createSemanticWorkerCancellationCell,
    decodeSemanticWorkerRequest,
  } = buildDriver(t)
  const cancelCell = createSemanticWorkerCancellationCell()
  const input = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 4,
    id: 9,
    requiredRevision: 12,
    method: "references",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 6,
    args: {
      position: { line: 7, character: 11 },
      includeDeclaration: true,
    },
    cancelCell,
  }

  const request = decodeSemanticWorkerRequest(input)

  assert.deepEqual(request, input)
  assert.notEqual(request, input)
  assert.notEqual(request.args, input.args)
  assert.notEqual(request.args.position, input.args.position)
  assert.equal(request.cancelCell, cancelCell)
  assert.equal(Object.isFrozen(request), true)
  assert.equal(Object.isFrozen(request.args), true)
  assert.equal(Object.isFrozen(request.args.position), true)
  input.args.position.line = 99
  assert.equal(request.args.position.line, 7)
})

test("accepts only the current semantic method allowlist with exact argument families", (t) => {
  const protocol = buildDriver(t)
  const position = { position: { line: 1, character: 2 } }
  const range = {
    range: {
      start: { line: 1, character: 2 },
      end: { line: 3, character: 4 },
    },
  }
  const callHierarchyItem = {
    uri: "file:///workspace/Main.ets",
    name: "build",
    kind: "method",
    range: range.range,
    selectionRange: {
      start: { line: 1, character: 2 },
      end: { line: 1, character: 4 },
    },
  }
  const cases = [
    ["complete", position],
    ["resolveCompletion", { ...position, completion: { label: "value", data: { source: "sdk" } } }],
    ["define", position],
    ["typeDefinitions", position],
    ["implementations", position],
    ["references", { ...position, includeDeclaration: false }],
    ["prepareRename", position],
    ["rename", { ...position, newName: "nextName" }],
    ["documentHighlights", position],
    ["inlayHints", range],
    ["foldingRanges", { lineFoldingOnly: true, rangeLimit: 50 }],
    ["formatDocument", {
      options: {
        tabSize: 2,
        insertSpaces: true,
        trimTrailingWhitespace: true,
        insertFinalNewline: true,
        trimFinalNewlines: false,
      },
    }],
    ["documentSymbols", {}],
    ["diagnose", {}],
    ["codeActions", range],
    ["resolveCodeAction", { action: { title: "Fix", fingerprint: "sha256:fixed" } }],
    ["hover", position],
    ["signatureHelp", {
      ...position,
      triggerReason: { kind: "characterTyped", triggerCharacter: "(" },
    }],
    ["prepareCallHierarchy", position],
    ["outgoingCalls", { item: callHierarchyItem, sourceFingerprint: "a".repeat(64) }],
    ["incomingCalls", { item: callHierarchyItem, sourceFingerprint: "b".repeat(64) }],
  ]

  assert.deepEqual(protocol.SEMANTIC_WORKER_METHODS, cases.map(([method]) => method))
  assert.equal(Object.isFrozen(protocol.SEMANTIC_WORKER_METHODS), true)
  for (const [index, [method, args]] of cases.entries()) {
    const decoded = protocol.decodeSemanticWorkerRequest(requestEnvelope(protocol, {
      id: index + 1,
      method,
      args,
    }))
    assert.equal(decoded.method, method)
    assert.deepEqual(decoded.args, args)
  }
})

test("canonicalizes representative editor request argument shapes", (t) => {
  const protocol = buildDriver(t)
  const cases = [
    ["complete", { position: { line: 1, character: 2 } }],
    ["foldingRanges", { lineFoldingOnly: true, rangeLimit: 5_000, omitted: undefined }],
    ["formatDocument", {
      options: {
        tabSize: 2,
        insertSpaces: true,
        trimTrailingWhitespace: undefined,
        insertFinalNewline: true,
      },
    }],
    ["inlayHints", {
      range: {
        start: { line: 0, character: 0 },
        end: { line: 100, character: 0 },
      },
    }],
    ["documentSymbols", { omitted: undefined }],
  ]

  for (const [index, [method, args]] of cases.entries()) {
    const request = protocol.decodeSemanticWorkerRequest(requestEnvelope(protocol, {
      id: index + 1,
      method,
      args,
    }))
    assert.deepEqual(request.args, JSON.parse(JSON.stringify(args)))
    assertDeepFrozen(request.args)
  }
})

test("clones and strictly decodes export discovery candidates for completion", (t) => {
  const protocol = buildDriver(t)
  const input = requestEnvelope(protocol, {
    method: "complete",
    args: {
      position: { line: 3, character: 7 },
      discovery: {
        incomplete: false,
        candidates: [{
          exportedName: "NeedleExport",
          kind: "class",
          uri: "file:///workspace/NeedleExport.ets",
          ordinal: 4999,
          declarationIdentity: "needle-identity",
          importSpecifier: "./NeedleExport",
        }],
      },
    },
  })

  const decoded = protocol.decodeSemanticWorkerRequest(input)
  assert.deepEqual(decoded.args, input.args)
  assert.notEqual(decoded.args.discovery, input.args.discovery)
  assert.notEqual(decoded.args.discovery.candidates, input.args.discovery.candidates)
  assert.equal(Object.isFrozen(decoded.args.discovery), true)
  assert.equal(Object.isFrozen(decoded.args.discovery.candidates), true)
  assert.equal(Object.isFrozen(decoded.args.discovery.candidates[0]), true)
})

test("rejects malformed requests, executable values, document text, and invalid cancel cells", (t) => {
  const protocol = buildDriver(t)
  const valid = requestEnvelope(protocol)
  const corruptedCell = new SharedArrayBuffer(4)
  Atomics.store(new Int32Array(corruptedCell), 0, 99)
  const controller = new AbortController()
  const invalid = [
    null,
    { ...valid, protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION + 1 },
    { ...valid, epoch: 0 },
    { ...valid, id: 0 },
    { ...valid, requiredRevision: -1 },
    { ...valid, method: "evaluateArbitraryCode" },
    { ...valid, uri: "relative/Main.ets" },
    { ...valid, expectedDocumentVersion: -1 },
    { ...valid, cancelCell: new ArrayBuffer(4) },
    { ...valid, cancelCell: new SharedArrayBuffer(8) },
    { ...valid, cancelCell: corruptedCell },
    { ...valid, text: "queries must reference the worker snapshot" },
    { ...valid, signal: controller.signal },
    requestEnvelope(protocol, {
      method: "complete",
      args: { position: { line: 0, character: 0 }, text: "forbidden" },
    }),
    requestEnvelope(protocol, {
      method: "resolveCompletion",
      args: {
        position: { line: 0, character: 0 },
        completion: { label: "x", callback: () => undefined },
      },
    }),
    requestEnvelope(protocol, {
      method: "resolveCodeAction",
      args: { action: { signal: controller.signal } },
    }),
  ]
  let getterCalled = false
  const accessor = requestEnvelope(protocol)
  Object.defineProperty(accessor, "args", {
    enumerable: true,
    get() {
      getterCalled = true
      return { position: { line: 0, character: 0 } }
    },
  })
  invalid.push(accessor)
  const accessorArray = [null]
  Object.defineProperty(accessorArray, "0", {
    enumerable: true,
    get() {
      getterCalled = true
      return "executed"
    },
  })
  invalid.push(requestEnvelope(protocol, {
    method: "resolveCodeAction",
    args: { action: { values: accessorArray } },
  }))

  for (const candidate of invalid) {
    assert.throws(
      () => protocol.decodeSemanticWorkerRequest(candidate),
      (error) => error instanceof protocol.SemanticWorkerProtocolError,
    )
  }
  assert.equal(getterCalled, false)
})

test("bounds cloned query arguments independently from the whole worker message", (t) => {
  const protocol = buildDriver(t)
  const request = requestEnvelope(protocol, {
    method: "resolveCompletion",
    args: {
      position: { line: 0, character: 0 },
      completion: {
        label: "oversized",
        data: { payload: "x".repeat(protocol.MAX_SEMANTIC_WORKER_ARGS_BYTES) },
      },
    },
  })

  assert.ok(Buffer.byteLength(JSON.stringify(request)) < protocol.MAX_SEMANTIC_WORKER_MESSAGE_BYTES)
  assert.throws(
    () => protocol.decodeSemanticWorkerRequest(request),
    /Semantic worker request args exceed byte limit/,
  )
})

test("omits undefined object properties while rejecting non-data JSON values", (t) => {
  const protocol = buildDriver(t)
  const request = protocol.decodeSemanticWorkerRequest(requestEnvelope(protocol, {
    method: "resolveCompletion",
    args: {
      position: { line: 0, character: 0 },
      completion: {
        label: "value",
        optional: undefined,
        data: { source: "sdk", detail: undefined },
      },
    },
  }))
  assert.deepEqual(request.args.completion, {
    label: "value",
    data: { source: "sdk" },
  })
  assert.equal(Object.isFrozen(request.args.completion.data), true)

  let getterCalled = false
  const accessor = {}
  Object.defineProperty(accessor, "secret", {
    enumerable: true,
    get() {
      getterCalled = true
      return "executed"
    },
  })
  const symbolValue = { label: "value" }
  symbolValue[Symbol("hidden")] = "secret"
  const sparse = []
  sparse.length = 1
  const nonPlain = Object.create({ inherited: true })
  nonPlain.label = "value"
  const invalidValues = [
    undefined,
    [undefined],
    sparse,
    () => undefined,
    Symbol("value"),
    1n,
    accessor,
    symbolValue,
    nonPlain,
  ]
  const responseBase = {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    id: 1,
    appliedRevision: 1,
    documentVersion: 1,
    ok: true,
  }
  for (const value of invalidValues) {
    assert.throws(
      () => protocol.decodeSemanticWorkerResponse({ ...responseBase, value }),
      /Invalid semantic worker response/,
    )
  }
  assert.equal(getterCalled, false)
})

test("canonicalizes, clones, and revalidates a request across a real MessageChannel", async (t) => {
  const protocol = buildDriver(t)
  const channel = new MessageChannel()
  t.after(() => {
    channel.port1.close()
    channel.port2.close()
  })
  const sourceCell = protocol.createSemanticWorkerCancellationCell()
  const sender = protocol.decodeSemanticWorkerRequest(requestEnvelope(protocol, {
    method: "resolveCompletion",
    args: {
      position: { line: 2, character: 3 },
      completion: {
        label: "Button",
        optional: undefined,
        data: { source: "arkui" },
      },
    },
    cancelCell: sourceCell,
  }))
  const clonedMessage = new Promise((resolve) => channel.port2.once("message", resolve))

  channel.port1.postMessage(sender)
  const receiver = protocol.decodeSemanticWorkerRequest(await clonedMessage)

  assert.deepEqual(receiver.args, sender.args)
  assert.notEqual(receiver, sender)
  assert.notEqual(receiver.args, sender.args)
  assert.notEqual(receiver.cancelCell, sender.cancelCell)
  assert.equal(Object.isFrozen(receiver), true)
  assert.equal(Object.isFrozen(receiver.args.completion.data), true)
  protocol.cancelSemanticWorkerRequest(
    sender.cancelCell,
    protocol.SemanticWorkerCancelState.clientCancelled,
  )
  assert.equal(
    protocol.readSemanticWorkerCancellationState(receiver.cancelCell),
    protocol.SemanticWorkerCancelState.clientCancelled,
  )
})

test("keeps the node budget above every currently bounded editor provider result", (t) => {
  const protocol = buildDriver(t)
  assert.ok(protocol.MAX_SEMANTIC_WORKER_VALUE_NODES >= 65_536)
  const hints = Array.from({ length: 1_000 }, (_, index) => ({
    position: { line: index, character: 0 },
    label: `: Type${index}`,
    kind: "type",
  }))
  const folds = Array.from({ length: 5_000 }, (_, index) => ({
    startLine: index * 2,
    endLine: index * 2 + 1,
    kind: "region",
  }))
  const edits = Array.from({ length: 4_096 }, (_, index) => ({
    range: {
      start: { line: index, character: 0 },
      end: { line: index, character: 1 },
    },
    newText: " ",
  }))

  for (const [value, expectedLength] of [
    [hints, 1_000],
    [folds, 5_000],
    [edits, 4_096],
  ]) {
    assert.ok(Buffer.byteLength(JSON.stringify(value)) < protocol.MAX_SEMANTIC_WORKER_MESSAGE_BYTES)
    const decoded = protocol.decodeSemanticWorkerResponse(successEnvelope(protocol, value))
    assert.equal(decoded.value.length, expectedLength)
    assert.equal(Object.isFrozen(decoded.value), true)
    assert.equal(Object.isFrozen(decoded.value.at(-1)), true)
  }
})

test("accepts the exact node/depth boundaries and rejects the next pathological value", (t) => {
  const protocol = buildDriver(t)
  const exactNodes = new Array(protocol.MAX_SEMANTIC_WORKER_VALUE_NODES - 1).fill(null)
  const decodedNodes = protocol.decodeSemanticWorkerResponse(successEnvelope(protocol, exactNodes))
  assert.equal(decodedNodes.value.length, exactNodes.length)

  const overNodes = new Array(protocol.MAX_SEMANTIC_WORKER_VALUE_NODES).fill(null)
  assert.throws(
    () => protocol.decodeSemanticWorkerResponse(successEnvelope(protocol, overNodes)),
    /Invalid semantic worker response/,
  )

  let exactDepth = null
  for (let index = 0; index < protocol.MAX_SEMANTIC_WORKER_VALUE_DEPTH; index += 1) {
    exactDepth = [exactDepth]
  }
  assert.deepEqual(
    protocol.decodeSemanticWorkerResponse(successEnvelope(protocol, exactDepth)).value,
    exactDepth,
  )
  assert.throws(
    () => protocol.decodeSemanticWorkerResponse(successEnvelope(protocol, [exactDepth])),
    /Invalid semantic worker response/,
  )
})

test("preserves representative completion, folding, formatting, inlay, and symbol values", (t) => {
  const protocol = buildDriver(t)
  const values = [
    [{
      label: "Button",
      detail: "ArkUI component",
      kind: "class",
      documentation: undefined,
      replacementRange: {
        start: { line: 2, character: 4 },
        end: { line: 2, character: 6 },
      },
      data: { source: "arkui" },
    }],
    [{ startLine: 0, endLine: 8, kind: "region" }],
    [{
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 2 },
      },
      newText: "  ",
    }],
    [{ position: { line: 3, character: 9 }, label: ": string", kind: "type" }],
    [{
      name: "Page",
      kind: "struct",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 8, character: 1 },
      },
      selectionRange: {
        start: { line: 0, character: 7 },
        end: { line: 0, character: 11 },
      },
      children: [{
        name: "build",
        kind: "method",
        range: {
          start: { line: 2, character: 2 },
          end: { line: 7, character: 3 },
        },
        selectionRange: {
          start: { line: 2, character: 2 },
          end: { line: 2, character: 7 },
        },
      }],
    }],
  ]

  for (const value of values) {
    const response = protocol.decodeSemanticWorkerResponse(successEnvelope(protocol, value))
    const expected = JSON.parse(JSON.stringify(value))
    assert.deepEqual(response.value, expected)
    assertDeepFrozen(response.value)
  }
})

test("decodes a successful response into a deeply immutable bounded value snapshot", (t) => {
  const protocol = buildDriver(t)
  const input = {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 3,
    id: 11,
    appliedRevision: 17,
    documentVersion: 8,
    ok: true,
    value: [{ uri: "file:///workspace/Main.ets", range: { line: 2, character: 4 } }],
  }

  const response = protocol.decodeSemanticWorkerResponse(input)

  assert.deepEqual(response, input)
  assert.notEqual(response, input)
  assert.notEqual(response.value, input.value)
  assert.equal(Object.isFrozen(response), true)
  assert.equal(Object.isFrozen(response.value), true)
  assert.equal(Object.isFrozen(response.value[0]), true)
  assert.equal(Object.isFrozen(response.value[0].range), true)
  input.value[0].range.line = 99
  assert.equal(response.value[0].range.line, 2)
})

test("permits only canonical safe worker errors and strips no arbitrary failure detail", (t) => {
  const protocol = buildDriver(t)
  const base = {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 3,
    id: 11,
    appliedRevision: 17,
    documentVersion: 8,
    ok: false,
  }
  const expected = [
    ["client-cancelled", "Semantic request cancelled"],
    ["content-modified", "Semantic document changed"],
    ["invalid-request", "Invalid semantic worker request"],
    ["workspace-incomplete", "Semantic workspace is incomplete"],
    ["queue-overflow", "Semantic worker queue is full"],
    ["worker-unavailable", "Semantic worker unavailable"],
    ["restart-required", "Semantic worker restart required"],
    ["internal-error", "Semantic worker request failed"],
  ]

  assert.deepEqual(protocol.SEMANTIC_WORKER_ERROR_CODES, expected.map(([code]) => code))
  for (const [code, message] of expected) {
    const error = protocol.createSemanticWorkerError(code)
    const response = protocol.decodeSemanticWorkerResponse({ ...base, error })
    assert.deepEqual(response.error, { code, message })
    assert.equal(Object.isFrozen(error), true)
    assert.equal(Object.isFrozen(response.error), true)
  }

  for (const error of [
    { code: "internal-error", message: "ENOENT /Users/private/project/Main.ets" },
    { code: "internal-error", message: "Semantic worker request failed", stack: "secret" },
    { code: "arbitrary", message: "Semantic worker request failed" },
  ]) {
    assert.throws(
      () => protocol.decodeSemanticWorkerResponse({ ...base, error }),
      /Invalid semantic worker response/,
    )
  }
})

test("fails malformed response identity and values at the response boundary", (t) => {
  const protocol = buildDriver(t)
  const valid = {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    id: 1,
    appliedRevision: 0,
    documentVersion: 0,
    ok: true,
    value: null,
  }
  const invalid = [
    null,
    { ...valid, protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION + 1 },
    { ...valid, epoch: 0 },
    { ...valid, id: 0 },
    { ...valid, appliedRevision: -1 },
    { ...valid, documentVersion: -1 },
    { ...valid, ok: true, error: protocol.createSemanticWorkerError("internal-error") },
    { ...valid, ok: false, value: null },
    { ...valid, value: () => undefined },
  ]

  for (const response of invalid) {
    assert.throws(
      () => protocol.decodeSemanticWorkerResponse(response),
      (error) => (
        error instanceof protocol.SemanticWorkerProtocolError
        && error.message === "Invalid semantic worker response"
      ),
    )
  }
})

test("decodes only an exact immutable mutation acknowledgement", (t) => {
  const protocol = buildDriver(t)
  const input = {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 4,
    appliedRevision: 19,
  }

  const ack = protocol.decodeSemanticWorkerMutationAck(input)

  assert.deepEqual(ack, input)
  assert.notEqual(ack, input)
  assert.equal(Object.isFrozen(ack), true)
  for (const invalid of [
    null,
    { ...input, protocol: input.protocol + 1 },
    { ...input, epoch: 0 },
    { ...input, appliedRevision: 0 },
    { ...input, ignored: true },
  ]) {
    assert.throws(
      () => protocol.decodeSemanticWorkerMutationAck(invalid),
      (error) => (
        error instanceof protocol.SemanticWorkerProtocolError
        && error.message === "Invalid semantic worker mutation acknowledgement"
      ),
    )
  }
})

test("decodes one per-root workspace invalidation as a bounded immutable mutation", (t) => {
  const protocol = buildDriver(t)
  const input = {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 2,
    revision: 20,
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace/",
    rootDirty: false,
    resourceDirty: true,
    resourceChanged: true,
    changes: [
      { uri: "file:///workspace/Created.ets", kind: "created" },
      { uri: "file:///workspace/Changed.ets", kind: "changed" },
      { uri: "file:///workspace/Deleted.ets", kind: "deleted" },
    ],
  }

  const mutation = protocol.decodeSemanticWorkerMutation(input)

  assert.deepEqual(mutation, input)
  assert.notEqual(mutation, input)
  assert.notEqual(mutation.changes, input.changes)
  assert.notEqual(mutation.changes[0], input.changes[0])
  assert.equal(Object.isFrozen(mutation), true)
  assert.equal(Object.isFrozen(mutation.changes), true)
  assert.ok(mutation.changes.every(Object.isFrozen))
  input.changes[0].kind = "deleted"
  assert.equal(mutation.changes[0].kind, "created")
})

test("rejects non-canonical, cross-root, and over-budget workspace invalidations", (t) => {
  const protocol = buildDriver(t)
  const valid = {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 2,
    revision: 20,
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace/",
    rootDirty: false,
    resourceDirty: false,
    resourceChanged: false,
    changes: [{ uri: "file:///workspace/Changed.ets", kind: "changed" }],
  }
  let getterCalled = false
  const accessorChanges = [{ uri: "file:///workspace/Changed.ets", kind: "changed" }]
  Object.defineProperty(accessorChanges, "0", {
    enumerable: true,
    get() {
      getterCalled = true
      return { uri: "file:///workspace/Executed.ets", kind: "changed" }
    },
  })
  const invalid = [
    { ...valid, rootUri: "file:///%77orkspace/" },
    { ...valid, rootDirty: false, resourceDirty: false, resourceChanged: false, changes: [] },
    { ...valid, resourceDirty: true, resourceChanged: false },
    { ...valid, changes: [{ uri: "file:///other/Changed.ets", kind: "changed" }] },
    { ...valid, changes: [{ uri: "file:///workspace/Changed.ets", kind: "renamed" }] },
    { ...valid, changes: accessorChanges },
    {
      ...valid,
      changes: Array.from(
        { length: protocol.MAX_SEMANTIC_WORKER_FILE_CHANGES + 1 },
        (_, index) => ({ uri: `file:///workspace/File-${index}.ets`, kind: "changed" }),
      ),
    },
  ]

  for (const mutation of invalid) {
    assert.throws(
      () => protocol.decodeSemanticWorkerMutation(mutation),
      /Invalid semantic worker mutation/,
    )
  }
  assert.equal(getterCalled, false)
})

function requestEnvelope(protocol, overrides = {}) {
  return {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    id: 1,
    requiredRevision: 1,
    method: "complete",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
    cancelCell: protocol.createSemanticWorkerCancellationCell(),
    ...overrides,
  }
}

function successEnvelope(protocol, value, overrides = {}) {
  return {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 1,
    id: 1,
    appliedRevision: 1,
    documentVersion: 1,
    ok: true,
    value,
    ...overrides,
  }
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== "object") return
  assert.equal(Object.isFrozen(value), true)
  for (const nested of Object.values(value)) assertDeepFrozen(nested)
}

function buildDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-worker-protocol-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "semantic-worker-protocol.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "semantic", "worker-protocol.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
