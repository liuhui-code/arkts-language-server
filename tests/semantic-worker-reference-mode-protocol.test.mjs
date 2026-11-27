import assert from "node:assert/strict"
import test from "node:test"
import { buildDriver } from "./support/semantic-worker-protocol-driver.mjs"

test("retained, qualified and proof-only reference modes preserve immutable mutually exclusive worker envelopes", t => {
  const protocol = buildDriver(t)
  const decode = args => protocol.decodeSemanticWorkerRequest({
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1, requiredRevision: 1,
    method: "references", uri: "file:///workspace/Main.ets", expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 }, includeDeclaration: true, ...args },
    cancelCell: protocol.createSemanticWorkerCancellationCell(),
  })
  for (const [mode, value] of [["residentOnly", true], ["retainedOnly", true],
    ["qualifiedOnly", "group"], ["qualifiedOnly", "retained-first"], ["qualifiedOnly", "source"]]) {
    const input = { [mode]: value }
    const request = decode(input)
    assert.equal(request.args[mode], value)
    assert.equal(Object.isFrozen(request.args), true)
    input[mode] = false
    assert.equal(request.args[mode], value)
    for (const extra of [{ forceLegacy: false }, { candidateUris: [] }, { candidateIdentityComplete: false },
      { candidateAnchorUri: "file:///workspace/Main.ets" }, { candidateSupportUris: [] },
      ...["residentOnly", "retainedOnly", "qualifiedOnly"].filter(other => other !== mode)
        .map(other => ({ [other]: other === "qualifiedOnly" ? "group" : true }))]) {
      assert.throws(() => decode({ [mode]: value, ...extra }), protocol.SemanticWorkerProtocolError)
    }
    assert.throws(() => decode({ [mode]: "true" }), protocol.SemanticWorkerProtocolError)
  }
  for (const value of [true, false, null, "lexical", 1]) {
    assert.throws(() => decode({ qualifiedOnly: value }), protocol.SemanticWorkerProtocolError)
  }
  let invoked = false
  const accessor = Object.defineProperty({}, "retainedOnly", { enumerable: true,
    get() { invoked = true; return true } })
  // Construct the envelope directly: spreading would itself invoke the hostile getter.
  const request = { protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1,
    requiredRevision: 1, method: "references", uri: "file:///workspace/Main.ets", expectedDocumentVersion: 1,
    args: Object.defineProperties(accessor, { position: { value: { line: 0, character: 0 }, enumerable: true },
      includeDeclaration: { value: true, enumerable: true } }),
    cancelCell: protocol.createSemanticWorkerCancellationCell() }
  assert.throws(() => protocol.decodeSemanticWorkerRequest(request), protocol.SemanticWorkerProtocolError)
  assert.equal(invoked, false)
})
