import assert from "node:assert/strict"
import test from "node:test"
import { buildDriver } from "./support/semantic-worker-protocol-driver.mjs"

test("resident-only reference requests cannot mix candidate proofs or force a legacy query", t => {
  const { SEMANTIC_WORKER_PROTOCOL_VERSION, decodeSemanticWorkerRequest, SemanticWorkerProtocolError } = buildDriver(t)
  const uri = "file:///workspace/Main.ets"
  const request = {
    protocol: SEMANTIC_WORKER_PROTOCOL_VERSION, epoch: 1, id: 1, requiredRevision: 1,
    method: "references", uri, expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 4 }, includeDeclaration: true, residentOnly: true },
    cancelCell: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
  }
  const decoded = decodeSemanticWorkerRequest(request)
  assert.equal(decoded.args.residentOnly, true)
  assert.equal(Object.isFrozen(decoded.args), true)
  for (const additional of [
    { candidateUris: [uri] },
    { candidateUris: [uri], candidateIdentityComplete: true, candidateAnchorUri: uri },
    { forceLegacy: true },
    { forceLegacy: false },
  ]) {
    assert.throws(() => decodeSemanticWorkerRequest({ ...request,
      args: { ...request.args, ...additional } }), SemanticWorkerProtocolError,
    "a resident-only attempt must not also describe a candidate/fallback query")
  }
  for (const residentOnly of ["true", 1, null, {}]) {
    assert.throws(() => decodeSemanticWorkerRequest({ ...request,
      args: { ...request.args, residentOnly } }), SemanticWorkerProtocolError)
  }
  const originalOrder = decodeSemanticWorkerRequest({ ...request, args: {
    ...request.args, residentOnly: false, candidateUris: [uri], candidateIdentityComplete: true,
  } })
  assert.equal(originalOrder.args.residentOnly, false)
  assert.deepEqual(originalOrder.args.candidateUris, [uri])
})
