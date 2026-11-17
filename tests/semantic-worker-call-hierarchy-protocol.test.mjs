import assert from "node:assert/strict"
import test from "node:test"
import { MessageChannel } from "node:worker_threads"
import { buildDriver, requestEnvelope, successEnvelope, callHierarchyInputItem } from "./support/semantic-worker-call-hierarchy-protocol.mjs"

test("fences the call hierarchy wire contract at the current ABI while rejecting earlier peers", (t) => {
  const protocol = buildDriver(t)
  assert.equal(protocol.SEMANTIC_WORKER_PROTOCOL_VERSION, 3)
  const current = requestEnvelope(protocol)

  assert.equal(protocol.decodeSemanticWorkerRequest(current).protocol, protocol.SEMANTIC_WORKER_PROTOCOL_VERSION)
  for (const obsoleteProtocol of [1, 2]) assert.throws(
    () => protocol.decodeSemanticWorkerRequest({ ...current, protocol: obsoleteProtocol }),
    /Invalid semantic worker request/,
  )
  const currentResponse = successEnvelope(protocol, {
    status: "complete",
    items: [],
  })
  assert.equal(
    protocol.decodeSemanticWorkerResponseForMethod(
      "prepareCallHierarchy",
      currentResponse,
    ).protocol,
    protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
  )
  for (const obsoleteProtocol of [1, 2]) assert.throws(
    () => protocol.decodeSemanticWorkerResponseForMethod(
      "prepareCallHierarchy",
      { ...currentResponse, protocol: obsoleteProtocol },
    ),
    /Invalid semantic worker response/,
  )
})

test("clones and decodes one open-document call hierarchy prepare request", async (t) => {
  const protocol = buildDriver(t)
  const channel = new MessageChannel()
  t.after(() => {
    channel.port1.close()
    channel.port2.close()
  })
  const sender = protocol.decodeSemanticWorkerRequest(requestEnvelope(protocol, {
    method: "prepareCallHierarchy",
    expectedDocumentVersion: 0,
    args: { position: { line: 4, character: 7 } },
  }))
  const clonedMessage = new Promise((resolve) => channel.port2.once("message", resolve))

  channel.port1.postMessage(sender)
  const receiver = protocol.decodeSemanticWorkerRequest(await clonedMessage)

  assert.equal(receiver.method, "prepareCallHierarchy")
  assert.equal(receiver.expectedDocumentVersion, 0)
  assert.deepEqual(receiver.args, { position: { line: 4, character: 7 } })
  assert.notEqual(receiver.args, sender.args)
  assert.equal(Object.isFrozen(receiver.args), true)
  assert.equal(Object.isFrozen(receiver.args.position), true)
})

test("clones and decodes one disk-snapshot outgoing request with a separate source proof", async (t) => {
  const protocol = buildDriver(t)
  const channel = new MessageChannel()
  t.after(() => {
    channel.port1.close()
    channel.port2.close()
  })
  const item = callHierarchyInputItem()
  const sender = protocol.decodeSemanticWorkerRequest(requestEnvelope(protocol, {
    method: "outgoingCalls",
    expectedDocumentVersion: null,
    args: { item, sourceFingerprint: "a".repeat(64) },
  }))
  const clonedMessage = new Promise((resolve) => channel.port2.once("message", resolve))

  channel.port1.postMessage(sender)
  const receiver = protocol.decodeSemanticWorkerRequest(await clonedMessage)

  assert.equal(receiver.method, "outgoingCalls")
  assert.equal(receiver.expectedDocumentVersion, null)
  assert.deepEqual(receiver.args, { item, sourceFingerprint: "a".repeat(64) })
  assert.notEqual(receiver.args.item, item)
  assert.equal(Object.isFrozen(receiver.args.item), true)
  assert.equal(Object.isFrozen(receiver.args.item.selectionRange.start), true)
})

test("decodes an incoming request against open document version zero", (t) => {
  const protocol = buildDriver(t)
  const item = callHierarchyInputItem({ name: "render", kind: "function" })

  const request = protocol.decodeSemanticWorkerRequest(requestEnvelope(protocol, {
    method: "incomingCalls",
    expectedDocumentVersion: 0,
    args: { item, sourceFingerprint: "b".repeat(64) },
  }))

  assert.equal(request.method, "incomingCalls")
  assert.equal(request.expectedDocumentVersion, 0)
  assert.deepEqual(request.args, { item, sourceFingerprint: "b".repeat(64) })
})

test("rejects malformed or hostile call hierarchy request identities without invoking getters", (t) => {
  const protocol = buildDriver(t)
  const validFollowup = requestEnvelope(protocol, {
    method: "outgoingCalls",
    expectedDocumentVersion: null,
    args: {
      item: callHierarchyInputItem(),
      sourceFingerprint: "c".repeat(64),
    },
  })
  let getterCalled = false
  const hostileItem = callHierarchyInputItem()
  Object.defineProperty(hostileItem, "name", {
    enumerable: true,
    get() {
      getterCalled = true
      return "executed"
    },
  })
  const invalid = [
    requestEnvelope(protocol, {
      method: "prepareCallHierarchy",
      expectedDocumentVersion: null,
    }),
    { ...validFollowup, expectedDocumentVersion: -1 },
    { ...validFollowup, uri: "file:///workspace/Other.ets" },
    { ...validFollowup, args: { ...validFollowup.args, ignored: true } },
    { ...validFollowup, args: { ...validFollowup.args, ignored: undefined } },
    { ...validFollowup, args: { ...validFollowup.args, sourceFingerprint: "C".repeat(64) } },
    { ...validFollowup, args: { ...validFollowup.args, sourceFingerprint: "c".repeat(63) } },
    { ...validFollowup, args: { ...validFollowup.args, sourceFingerprint: "c".repeat(65) } },
    {
      ...validFollowup,
      args: {
        ...validFollowup.args,
        item: callHierarchyInputItem({ sourceFingerprint: "d".repeat(64) }),
      },
    },
    {
      ...validFollowup,
      args: {
        ...validFollowup.args,
        item: callHierarchyInputItem({ sourceFingerprint: undefined }),
      },
    },
    {
      ...validFollowup,
      args: { ...validFollowup.args, item: callHierarchyInputItem({ data: { route: "client" } }) },
    },
    {
      ...validFollowup,
      args: { ...validFollowup.args, item: callHierarchyInputItem({ kind: "namespace" }) },
    },
    {
      ...validFollowup,
      args: { ...validFollowup.args, item: callHierarchyInputItem({ uri: "file:///%77orkspace/Main.ets" }) },
    },
    {
      ...validFollowup,
      args: {
        ...validFollowup.args,
        item: callHierarchyInputItem({
          selectionRange: {
            start: { line: 2, character: 0 },
            end: { line: 2, character: 1 },
          },
        }),
      },
    },
    { ...validFollowup, args: { ...validFollowup.args, item: hostileItem } },
  ]

  for (const [index, candidate] of invalid.entries()) {
    assert.throws(
      () => protocol.decodeSemanticWorkerRequest(candidate),
      (error) => (
        error instanceof protocol.SemanticWorkerProtocolError
        && error.message === "Invalid semantic worker request"
      ),
      `invalid candidate ${index}`,
    )
  }
  assert.equal(getterCalled, false)
})
