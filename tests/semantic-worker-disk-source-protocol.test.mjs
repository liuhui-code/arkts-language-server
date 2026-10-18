import assert from "node:assert/strict"
import test from "node:test"

import { buildDriver } from "./support/semantic-worker-protocol-driver.mjs"

test("a disk-source definition envelope owns immutable text without an open mutation", t => {
  const protocol = buildDriver(t)
  const input = envelope(protocol)
  const decoded = protocol.decodeSemanticWorkerRequest(input)
  assert.equal(decoded.method, "define")
  assert.equal(decoded.expectedDocumentVersion, 0)
  assert.equal(decoded.requiredRevision, 0)
  assert.deepEqual(decoded.diskSource, { text: "const value = 1\n" })
  assert.equal(Object.isFrozen(decoded.diskSource), true)
  input.diskSource.text = "changed after capture"
  assert.equal(decoded.diskSource.text, "const value = 1\n")
  const typed = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "typeDefinitions" })
  assert.equal(typed.method, "typeDefinitions")
  assert.equal(typed.diskSource.text, "const value = 1\n")
  const hover = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "hover" })
  assert.equal(hover.method, "hover")
  assert.equal(hover.diskSource.text, "const value = 1\n")
  const signature = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "signatureHelp",
    args: { position: { line: 0, character: 1 }, triggerReason: { kind: "characterTyped", triggerCharacter: "," } } })
  assert.equal(signature.method, "signatureHelp")
  assert.equal(signature.diskSource.text, "const value = 1\n")
  const completion = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "complete",
    args: { position: { line: 0, character: 1 }, snippets: false } })
  assert.equal(completion.method, "complete")
  assert.equal(completion.diskSource.text, "const value = 1\n")
  const resolved = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "resolveCompletion",
    args: { position: { line: 0, character: 1 }, completion: { label: "value", data: { source: "sdk" } } } })
  assert.equal(resolved.method, "resolveCompletion")
  assert.equal(resolved.diskSource.text, "const value = 1\n")
  const prepared = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "prepareCallHierarchy" })
  assert.equal(prepared.method, "prepareCallHierarchy")
  assert.equal(prepared.diskSource.text, "const value = 1\n")
  const implementations = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "implementations" })
  assert.equal(implementations.method, "implementations")
  assert.equal(implementations.diskSource.text, "const value = 1\n")
  const references = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "references",
    args: { position: { line: 0, character: 1 }, includeDeclaration: false } })
  assert.equal(references.method, "references")
  assert.equal(references.diskSource.text, "const value = 1\n")
  const prepareRename = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "prepareRename" })
  assert.equal(prepareRename.method, "prepareRename")
  assert.equal(prepareRename.diskSource.text, "const value = 1\n")
  const rename = protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "rename",
    args: { position: { line: 0, character: 1 }, newName: "renamed" } })
  assert.equal(rename.method, "rename")
  assert.equal(rename.diskSource.text, "const value = 1\n")
})

test("disk-source request fields reject hostile records and capabilities without a public transcript", t => {
  const protocol = buildDriver(t)
  let getterCalls = 0
  const hostile = { get text() { getterCalls++; return "executed" } }
  const invalid = [undefined, null, [], "text", { text: 1 }, { text: "ok", ignored: undefined }, hostile]
  for (const diskSource of invalid) {
    assert.throws(() => protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), diskSource }),
      protocol.SemanticWorkerProtocolError)
  }
  const outer = envelope(protocol)
  Object.defineProperty(outer, "diskSource", { enumerable: true, get() { getterCalls++; return { text: "executed" } } })
  assert.throws(() => protocol.decodeSemanticWorkerRequest(outer), protocol.SemanticWorkerProtocolError)
  assert.equal(getterCalls, 0)
  assert.throws(() => protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), method: "documentSymbols", args: {} }),
    protocol.SemanticWorkerProtocolError)
  assert.throws(() => protocol.decodeSemanticWorkerRequest({ ...envelope(protocol), expectedDocumentVersion: 1 }),
    protocol.SemanticWorkerProtocolError)
})

test("disk-source text and escaped message bytes retain their independent existing transport limits", t => {
  const protocol = buildDriver(t)
  const input = envelope(protocol)
  input.diskSource.text = "x".repeat(protocol.MAX_SEMANTIC_WORKER_TEXT_BYTES + 1)
  assert.throws(() => protocol.decodeSemanticWorkerRequest(input), /document text exceeds byte limit/)
  input.diskSource.text = '"'.repeat(protocol.MAX_SEMANTIC_WORKER_TEXT_BYTES)
  assert.throws(() => protocol.decodeSemanticWorkerRequest(input), /message exceeds byte limit/)
})

function envelope(protocol) {
  return { protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1,
    requiredRevision: 0, method: "define", uri: "file:///workspace/Main.ets", expectedDocumentVersion: 0,
    args: { position: { line: 0, character: 1 } }, diskSource: { text: "const value = 1\n" },
    cancelCell: protocol.createSemanticWorkerCancellationCell() }
}
