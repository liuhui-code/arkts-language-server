import assert from "node:assert/strict"
import test from "node:test"
import { MessageChannel } from "node:worker_threads"
import { buildDriver, successEnvelope, callHierarchyResultItem, callEdgesWithTotalRanges } from "./support/semantic-worker-call-hierarchy-protocol.mjs"

test("clones and method-decodes one complete prepare result with worker source proofs", async (t) => {
  const protocol = buildDriver(t)
  const channel = new MessageChannel()
  t.after(() => {
    channel.port1.close()
    channel.port2.close()
  })
  const item = callHierarchyResultItem()
  const envelope = successEnvelope(protocol, {
    status: "complete",
    items: [item],
  })
  const sender = protocol.decodeSemanticWorkerResponseForMethod(
    "prepareCallHierarchy",
    envelope,
  )
  const clonedMessage = new Promise((resolve) => channel.port2.once("message", resolve))

  channel.port1.postMessage(sender)
  const receiver = protocol.decodeSemanticWorkerResponseForMethod(
    "prepareCallHierarchy",
    await clonedMessage,
  )

  assert.deepEqual(receiver.value, { status: "complete", items: [item] })
  assert.notEqual(receiver.value.items[0], item)
  assert.equal(Object.isFrozen(receiver.value), true)
  assert.equal(Object.isFrozen(receiver.value.items), true)
  assert.equal(Object.isFrozen(receiver.value.items[0].range.start), true)
})

test("accepts only exact allowlisted incomplete prepare outcomes", (t) => {
  const protocol = buildDriver(t)
  const reasons = [
    "project-membership-incomplete",
    "source-outside-workspace",
    "source-unavailable",
    "source-unmappable",
    "result-limit-exceeded",
  ]

  assert.deepEqual(protocol.SEMANTIC_WORKER_CALL_HIERARCHY_FAILURE_REASONS, reasons)
  for (const reason of reasons) {
    const response = protocol.decodeSemanticWorkerResponseForMethod(
      "prepareCallHierarchy",
      successEnvelope(protocol, { status: "incomplete", reason }),
    )
    assert.deepEqual(response.value, { status: "incomplete", reason })
    assert.equal(Object.isFrozen(response.value), true)
  }
  for (const value of [
    { status: "incomplete", reason: "permission-denied" },
    { status: "incomplete", reason: "source-unavailable", detail: "/private/path" },
    { status: "stale-item" },
  ]) {
    assert.throws(
      () => protocol.decodeSemanticWorkerResponseForMethod(
        "prepareCallHierarchy",
        successEnvelope(protocol, value),
      ),
      /Invalid semantic worker response/,
    )
  }
})

test("decodes a disk outgoing result with exact target proof and call-site ranges", (t) => {
  const protocol = buildDriver(t)
  const to = callHierarchyResultItem({
    uri: "file:///workspace/Target.ets",
    name: "target",
    sourceFingerprint: "2".repeat(64),
  })
  const fromRange = {
    start: { line: 6, character: 4 },
    end: { line: 6, character: 12 },
  }

  const response = protocol.decodeSemanticWorkerResponseForMethod(
    "outgoingCalls",
    successEnvelope(protocol, {
      status: "complete",
      calls: [{ to, fromRanges: [fromRange] }],
    }, { documentVersion: null }),
  )

  assert.equal(response.documentVersion, null)
  assert.deepEqual(response.value, {
    status: "complete",
    calls: [{ to, fromRanges: [fromRange] }],
  })
  assert.notEqual(response.value.calls[0].to, to)
  assert.equal(Object.isFrozen(response.value.calls), true)
  assert.equal(Object.isFrozen(response.value.calls[0].fromRanges[0].start), true)
})

test("method-decodes incoming callers and requires each caller source proof", (t) => {
  const protocol = buildDriver(t)
  const from = callHierarchyResultItem({
    uri: "file:///workspace/Caller.ets",
    name: "caller",
    sourceFingerprint: "3".repeat(64),
  })
  const fromRanges = [{
    start: { line: 10, character: 6 },
    end: { line: 10, character: 12 },
  }]
  const value = { status: "complete", calls: [{ from, fromRanges }] }

  const response = protocol.decodeSemanticWorkerResponseForMethod(
    "incomingCalls",
    successEnvelope(protocol, value, { documentVersion: 0 }),
  )

  assert.deepEqual(response.value, value)
  assert.equal(Object.isFrozen(response.value.calls[0].from), true)
  assert.throws(
    () => protocol.decodeSemanticWorkerResponseForMethod(
      "incomingCalls",
      successEnvelope(protocol, {
        status: "complete",
        calls: [{
          from: { ...from, sourceFingerprint: "3".repeat(63) },
          fromRanges,
        }],
      }),
    ),
    /Invalid semantic worker response/,
  )
})

test("accepts exactly 16 prepare items and rejects the 17th", (t) => {
  const protocol = buildDriver(t)
  const decode = (count) => protocol.decodeSemanticWorkerResponseForMethod(
    "prepareCallHierarchy",
    successEnvelope(protocol, {
      status: "complete",
      items: Array.from({ length: count }, (_, index) => callHierarchyResultItem({
        uri: `file:///workspace/Prepared${index}.ets`,
        name: `prepared${index}`,
      })),
    }),
  )

  assert.equal(decode(16).value.items.length, 16)
  assert.throws(() => decode(17), /Invalid semantic worker response/)
})

test("accepts exactly 256 call edges and rejects the 257th", (t) => {
  const protocol = buildDriver(t)
  const decode = (count) => protocol.decodeSemanticWorkerResponseForMethod(
    "outgoingCalls",
    successEnvelope(protocol, {
      status: "complete",
      calls: Array.from({ length: count }, (_, index) => ({
        to: callHierarchyResultItem({
          uri: `file:///workspace/Target${index}.ets`,
          name: `target${index}`,
        }),
        fromRanges: [],
      })),
    }, { documentVersion: null }),
  )

  assert.equal(decode(256).value.calls.length, 256)
  assert.throws(() => decode(257), /Invalid semantic worker response/)
})

test("accepts exactly 64 ranges per edge and rejects the 65th", (t) => {
  const protocol = buildDriver(t)
  const decode = (count) => protocol.decodeSemanticWorkerResponseForMethod(
    "incomingCalls",
    successEnvelope(protocol, {
      status: "complete",
      calls: [{
        from: callHierarchyResultItem(),
        fromRanges: Array.from({ length: count }, (_, index) => ({
          start: { line: index, character: 0 },
          end: { line: index, character: 1 },
        })),
      }],
    }),
  )

  assert.equal(decode(64).value.calls[0].fromRanges.length, 64)
  assert.throws(() => decode(65), /Invalid semantic worker response/)
})

test("accepts exactly 2048 total call ranges and rejects the 2049th", (t) => {
  const protocol = buildDriver(t)
  const decode = (total) => protocol.decodeSemanticWorkerResponseForMethod(
    "outgoingCalls",
    successEnvelope(protocol, {
      status: "complete",
      calls: callEdgesWithTotalRanges(total),
    }),
  )

  assert.equal(
    decode(2_048).value.calls.reduce((sum, call) => sum + call.fromRanges.length, 0),
    2_048,
  )
  assert.throws(() => decode(2_049), /Invalid semantic worker response/)
})

test("rejects every over-limit call hierarchy collection before scanning elements", (t) => {
  const protocol = buildDriver(t)
  const cases = [
    tracked => ({
      method: "prepareCallHierarchy",
      value: { status: "complete", items: tracked.value },
    }),
    tracked => ({
      method: "outgoingCalls",
      value: { status: "complete", calls: tracked.value },
    }),
    tracked => ({
      method: "outgoingCalls",
      value: {
        status: "complete",
        calls: [{ to: callHierarchyResultItem(), fromRanges: tracked.value }],
      },
    }),
  ]

  for (const [index, candidate] of cases.entries()) {
    const counters = { lengthGets: 0, ownKeyScans: 0, elementDescriptorReads: 0 }
    const tracked = {
      counters,
      value: new Proxy(new Array(10_000).fill(null), {
        get(target, key, receiver) {
          if (key === "length") counters.lengthGets += 1
          return Reflect.get(target, key, receiver)
        },
        ownKeys(target) {
          counters.ownKeyScans += 1
          return Reflect.ownKeys(target)
        },
        getOwnPropertyDescriptor(target, key) {
          if (key !== "length") counters.elementDescriptorReads += 1
          return Reflect.getOwnPropertyDescriptor(target, key)
        },
      }),
    }
    const { method, value } = candidate(tracked)

    assert.throws(
      () => protocol.decodeSemanticWorkerResponseForMethod(
        method,
        successEnvelope(protocol, value),
      ),
      /Invalid semantic worker response/,
      `collection case ${index}`,
    )
    assert.deepEqual(counters, {
      lengthGets: 0,
      ownKeyScans: 0,
      elementDescriptorReads: 0,
    })
  }
})

test("rejects a record above its exact key bound before reading unknown descriptors", (t) => {
  const protocol = buildDriver(t)
  const target = callHierarchyResultItem()
  for (let index = 0; index < 70_000; index += 1) {
    target[`ignored${index}`] = index
  }
  let getterCalls = 0
  let ownKeyScans = 0
  let descriptorReads = 0
  const item = new Proxy(target, {
    get(targetValue, key, receiver) {
      getterCalls += 1
      return Reflect.get(targetValue, key, receiver)
    },
    ownKeys(targetValue) {
      ownKeyScans += 1
      return Reflect.ownKeys(targetValue)
    },
    getOwnPropertyDescriptor(targetValue, key) {
      descriptorReads += 1
      return Reflect.getOwnPropertyDescriptor(targetValue, key)
    },
  })

  assert.throws(
    () => protocol.decodeSemanticWorkerResponseForMethod(
      "prepareCallHierarchy",
      successEnvelope(protocol, { status: "complete", items: [item] }),
    ),
    /Invalid semantic worker response/,
  )
  assert.equal(getterCalls, 0)
  assert.equal(ownKeyScans, 1)
  assert.equal(descriptorReads, 0)

  const { sourceFingerprint: _sourceFingerprint, ...unknownAtExactCount } = (
    callHierarchyResultItem()
  )
  unknownAtExactCount.ignored = true
  let exactCountDescriptorReads = 0
  const exactCountItem = new Proxy(unknownAtExactCount, {
    getOwnPropertyDescriptor(targetValue, key) {
      exactCountDescriptorReads += 1
      return Reflect.getOwnPropertyDescriptor(targetValue, key)
    },
  })
  assert.throws(
    () => protocol.decodeSemanticWorkerResponseForMethod(
      "prepareCallHierarchy",
      successEnvelope(protocol, { status: "complete", items: [exactCountItem] }),
    ),
    /Invalid semantic worker response/,
  )
  assert.equal(exactCountDescriptorReads, 0)
})

test("rejects non-exact or hostile call hierarchy results without invoking getters", (t) => {
  const protocol = buildDriver(t)
  const validItem = callHierarchyResultItem()
  let getterCalled = false
  const hostileItem = callHierarchyResultItem()
  Object.defineProperty(hostileItem, "name", {
    enumerable: true,
    get() {
      getterCalled = true
      return "executed"
    },
  })
  const invalid = [
    ["prepareCallHierarchy", { status: "complete", items: [validItem], ignored: undefined }],
    ["prepareCallHierarchy", {
      status: "complete",
      items: [{ ...validItem, data: undefined }],
    }],
    ["prepareCallHierarchy", {
      status: "complete",
      items: [{ ...validItem, sourceFingerprint: "F".repeat(64) }],
    }],
    ["prepareCallHierarchy", {
      status: "complete",
      items: [{ ...validItem, sourceFingerprint: undefined }],
    }],
    ["prepareCallHierarchy", {
      status: "complete",
      items: [{ ...validItem, uri: "file:///%77orkspace/Main.ets" }],
    }],
    ["prepareCallHierarchy", {
      status: "complete",
      items: [{ ...validItem, kind: "namespace" }],
    }],
    ["prepareCallHierarchy", {
      status: "complete",
      items: [{
        ...validItem,
        range: {
          start: { line: 8, character: 0 },
          end: { line: 3, character: 0 },
        },
      }],
    }],
    ["prepareCallHierarchy", {
      status: "complete",
      items: [{
        ...validItem,
        selectionRange: {
          start: { line: 20, character: 0 },
          end: { line: 20, character: 1 },
        },
      }],
    }],
    ["outgoingCalls", {
      status: "complete",
      calls: [{ to: validItem, fromRanges: [], ignored: undefined }],
    }],
    ["incomingCalls", {
      status: "complete",
      calls: [{ from: validItem, fromRanges: [{ start: {}, end: {} }] }],
    }],
    ["prepareCallHierarchy", { status: "complete", items: [hostileItem] }],
  ]

  for (const [index, [method, value]] of invalid.entries()) {
    assert.throws(
      () => protocol.decodeSemanticWorkerResponseForMethod(
        method,
        successEnvelope(protocol, value),
      ),
      (error) => (
        error instanceof protocol.SemanticWorkerProtocolError
        && error.message === "Invalid semantic worker response"
      ),
      `invalid result candidate ${index}`,
    )
  }
  assert.equal(getterCalled, false)
})

test("decodes exact stale, incomplete, and disk-error follow-up outcomes", (t) => {
  const protocol = buildDriver(t)

  for (const method of ["outgoingCalls", "incomingCalls"]) {
    const stale = protocol.decodeSemanticWorkerResponseForMethod(
      method,
      successEnvelope(protocol, { status: "stale-item" }, { documentVersion: null }),
    )
    assert.deepEqual(stale.value, { status: "stale-item" })
    for (const reason of protocol.SEMANTIC_WORKER_CALL_HIERARCHY_FAILURE_REASONS) {
      const incomplete = protocol.decodeSemanticWorkerResponseForMethod(
        method,
        successEnvelope(
          protocol,
          { status: "incomplete", reason },
          { documentVersion: null },
        ),
      )
      assert.deepEqual(incomplete.value, { status: "incomplete", reason })
    }
    const failed = protocol.decodeSemanticWorkerResponseForMethod(method, {
      protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
      epoch: 1,
      id: 1,
      appliedRevision: 1,
      documentVersion: null,
      ok: false,
      error: protocol.createSemanticWorkerError("workspace-incomplete"),
    })
    assert.equal(failed.ok, false)
    assert.equal(failed.documentVersion, null)
    assert.deepEqual(failed.error, {
      code: "workspace-incomplete",
      message: "Semantic workspace is incomplete",
    })
  }

  assert.throws(
    () => protocol.decodeSemanticWorkerResponseForMethod(
      "complete",
      successEnvelope(protocol, [], { documentVersion: null }),
    ),
    /Invalid semantic worker response/,
  )
})
