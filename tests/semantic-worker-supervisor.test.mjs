import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

test("fails the root closed when prepare returns an item without a source proof", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const request = supervisor.request({
    method: "prepareCallHierarchy",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 3, character: 2 } },
  })
  const wire = endpoint.sent[0]

  endpoint.message(successResponse(protocol, wire, {
    status: "complete",
    items: [callHierarchyWorkerItem({ sourceFingerprint: undefined })],
  }))

  await assert.rejects(request.result, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "worker-unavailable"
  ))
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    }),
    error => error.code === "worker-unavailable",
  )
  assert.equal(endpoint.terminateCalls, 1)
})

test("correlates every call hierarchy response with its dispatched method schema", async (t) => {
  const protocol = buildDriver(t)
  const followupArgs = {
    item: callHierarchyRequestItem(),
    sourceFingerprint: "f".repeat(64),
  }
  const cases = [
    {
      method: "prepareCallHierarchy",
      args: { position: { line: 3, character: 2 } },
      value: {
        status: "complete",
        items: Array.from({ length: 17 }, (_, index) => callHierarchyWorkerItem({
          uri: `file:///workspace/Prepared${index}.ets`,
          name: `prepared${index}`,
        })),
      },
    },
    {
      method: "outgoingCalls",
      args: followupArgs,
      value: {
        status: "complete",
        calls: [{
          to: callHierarchyWorkerItem({ sourceFingerprint: undefined }),
          fromRanges: [],
        }],
      },
    },
    {
      method: "incomingCalls",
      args: followupArgs,
      value: {
        status: "complete",
        calls: [{
          from: callHierarchyWorkerItem({
            selectionRange: {
              start: { line: 20, character: 0 },
              end: { line: 20, character: 1 },
            },
          }),
          fromRanges: [],
        }],
      },
    },
  ]

  for (const [index, candidate] of cases.entries()) {
    const endpoint = new FakeEndpoint()
    const supervisor = createSupervisor(protocol, endpoint)
    const request = supervisor.request({
      method: candidate.method,
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: candidate.args,
    })
    endpoint.message(successResponse(protocol, endpoint.sent[0], candidate.value))

    await assert.rejects(
      request.result,
      error => error.code === "worker-unavailable",
      `method-invalid case ${index}`,
    )
    assert.throws(
      () => supervisor.request({
        method: "hover",
        uri: "file:///workspace/Main.ets",
        expectedDocumentVersion: 1,
        args: { position: { line: 0, character: 0 } },
      }),
      error => error.code === "worker-unavailable",
    )
    assert.equal(endpoint.terminateCalls, 1)
  }
})

test("acknowledges every mutation before dispatching a revision-bound query", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = new protocol.RootSemanticWorkerSupervisor({
    rootUri: "file:///workspace",
    epoch: 7,
    endpoint,
    waitForDisposeDeadline: never,
  })

  const mutation = supervisor.mutate(changeMutation(1, "const value = 1\n"))
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 6 } },
  })

  assert.equal(endpoint.sent.length, 1)
  assert.equal(endpoint.sent[0].kind, "change")
  assert.equal(endpoint.sent[0].revision, 1)
  endpoint.message({
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 7,
    appliedRevision: 1,
  })
  await mutation

  assert.equal(endpoint.sent.length, 2)
  assert.equal(endpoint.sent[1].method, "hover")
  assert.equal(endpoint.sent[1].requiredRevision, 1)
  endpoint.message(successResponse(protocol, endpoint.sent[1], { contents: "number" }))

  assert.deepEqual(await request.result, { contents: "number" })
  await supervisor.dispose()
})

test("allows one active command plus 64 waiting requests and rejects the 65th", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const mutation = supervisor.mutate(changeMutation(1, "const value = 1\n"))
  mutation.catch(() => {})
  const waiting = Array.from({ length: 64 }, (_, index) => supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: index, character: 0 } },
  }))
  for (const handle of waiting) handle.result.catch(() => {})

  const overflow = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 65, character: 0 } },
  })

  await assert.rejects(overflow.result, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "queue-overflow"
  ))
  assert.equal(endpoint.sent.length, 1)
  endpoint.error()
  await Promise.allSettled([mutation, ...waiting.map(handle => handle.result)])
})

test("prioritizes mutations, coalesces the latest URI snapshot, and invalidates older queries", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const first = supervisor.mutate(changeMutation(
    1,
    "const other = 1\n",
    "file:///workspace/Other.ets",
  ))
  const stale = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const oldSnapshot = supervisor.mutate(changeMutation(1, "const value = 1\n"))
  const latestSnapshot = supervisor.mutate(changeMutation(2, "const value = 2\n"))

  assert.equal(oldSnapshot, latestSnapshot)
  await assert.rejects(stale.result, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "content-modified"
  ))
  endpoint.message(mutationAck(protocol, 1))
  await first

  assert.equal(endpoint.sent.length, 2)
  assert.equal(endpoint.sent[1].kind, "change")
  assert.equal(endpoint.sent[1].documentVersion, 2)
  assert.equal(endpoint.sent[1].text, "const value = 2\n")
  assert.equal(endpoint.sent[1].revision, 2)
  endpoint.message(mutationAck(protocol, 2))

  await Promise.all([oldSnapshot, latestSnapshot])
  assert.equal(endpoint.sent.some(message => message.method === "hover"), false)
  await supervisor.dispose()
})

test("keeps an active content-modified request pending until its terminal response", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const settlement = observeSettlement(request.result)
  const mutation = supervisor.mutate(changeMutation(2, "const value = 2\n"))

  await Promise.resolve()
  assert.equal(settlement.state, "pending")
  assert.equal(endpoint.sent.length, 1)
  assert.equal(
    Atomics.load(new Int32Array(endpoint.sent[0].cancelCell), 0),
    protocol.SemanticWorkerCancelState.contentModified,
  )

  endpoint.message(successResponse(protocol, endpoint.sent[0], { contents: "stale" }))
  await assert.rejects(request.result, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "content-modified"
  ))
  assert.equal(endpoint.sent[1].kind, "change")
  assert.equal(endpoint.sent[1].revision, 1)
  endpoint.message(mutationAck(protocol, 1))
  await mutation
  await supervisor.dispose()
})

test("fails the root closed exactly once after a mismatched worker response", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 3,
    args: { position: { line: 0, character: 0 } },
  })
  let settlements = 0
  request.result.then(
    () => { settlements += 1 },
    () => { settlements += 1 },
  )
  endpoint.message({
    ...successResponse(protocol, endpoint.sent[0], { contents: "stale" }),
    documentVersion: 2,
  })

  await assert.rejects(request.result, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "worker-unavailable"
  ))
  assert.equal(
    Atomics.load(new Int32Array(endpoint.sent[0].cancelCell), 0),
    protocol.SemanticWorkerCancelState.supervisorDisposing,
  )
  endpoint.error(new Error("late error"))
  endpoint.exit(1)
  await Promise.resolve()
  assert.equal(settlements, 1)
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 3,
      args: { position: { line: 0, character: 0 } },
    }),
    error => (
      error instanceof protocol.SemanticWorkerSupervisorError
      && error.code === "worker-unavailable"
    ),
  )
  assert.equal(endpoint.terminateCalls, 1)
})

test("disposes idempotently only after an active request terminates or its deadline wins", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "references",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 }, includeDeclaration: true },
  })
  const settlement = observeSettlement(request.result)

  const firstDispose = supervisor.dispose()
  const secondDispose = supervisor.dispose()
  assert.equal(firstDispose, secondDispose)
  assert.equal(
    Atomics.load(new Int32Array(endpoint.sent[0].cancelCell), 0),
    protocol.SemanticWorkerCancelState.supervisorDisposing,
  )
  await Promise.resolve()
  assert.equal(settlement.state, "pending")
  assert.equal(endpoint.terminateCalls, 0)

  deadline.resolve()
  await firstDispose
  await assert.rejects(request.result, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "worker-unavailable"
  ))
  assert.equal(endpoint.terminateCalls, 1)
  assert.throws(
    () => supervisor.mutate(changeMutation(2, "const value = 2\n")),
    error => (
      error instanceof protocol.SemanticWorkerSupervisorError
      && error.code === "worker-unavailable"
    ),
  )
})

test("removes a queued cancellation but fences a dispatched cancellation until terminal", async (t) => {
  const protocol = buildDriver(t)
  const queuedEndpoint = new FakeEndpoint()
  const queuedSupervisor = createSupervisor(protocol, queuedEndpoint)
  const mutation = queuedSupervisor.mutate(changeMutation(1, "const value = 1\n"))
  mutation.catch(() => {})
  const queued = Array.from({ length: 64 }, (_, index) => queuedSupervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: index, character: 0 } },
  }))
  for (const handle of queued) handle.result.catch(() => {})

  assert.equal(
    queued[0].cancel(protocol.SemanticWorkerCancelState.clientCancelled),
    protocol.SemanticWorkerCancelState.clientCancelled,
  )
  assert.equal(
    queued[0].cancel(protocol.SemanticWorkerCancelState.contentModified),
    protocol.SemanticWorkerCancelState.clientCancelled,
  )
  await assert.rejects(queued[0].result, error => error.code === "client-cancelled")
  const replacement = queuedSupervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 99, character: 0 } },
  })
  replacement.result.catch(() => {})
  queuedEndpoint.error()
  await Promise.allSettled([
    mutation,
    replacement.result,
    ...queued.slice(1).map(handle => handle.result),
  ])

  const activeEndpoint = new FakeEndpoint()
  const activeSupervisor = createSupervisor(protocol, activeEndpoint)
  const active = activeSupervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const settlement = observeSettlement(active.result)
  assert.equal(
    active.cancel(protocol.SemanticWorkerCancelState.clientCancelled),
    protocol.SemanticWorkerCancelState.clientCancelled,
  )
  await Promise.resolve()
  assert.equal(settlement.state, "pending")
  activeEndpoint.message(successResponse(protocol, activeEndpoint.sent[0], null))
  await assert.rejects(active.result, error => error.code === "client-cancelled")
  await activeSupervisor.dispose()
})

test("enforces real URI path boundaries for each isolated root", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)

  const outsideRequest = {
    method: "hover",
    uri: "file:///workspace-evil/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  }
  assert.throws(
    () => supervisor.request(outsideRequest),
    error => error.code === "invalid-request",
  )
  assert.throws(
    () => supervisor.mutate(changeMutation(
      1,
      "const stolen = true\n",
      "file:///workspace-evil/Main.ets",
    )),
    error => error.code === "invalid-request",
  )
  assert.throws(
    () => supervisor.mutate({
      kind: "workspaceFilesChanged",
      rootUri: "file:///other",
      rootDirty: true,
      resourceDirty: false,
      resourceChanged: false,
      changes: [],
    }),
    error => error.code === "invalid-request",
  )
  assert.equal(endpoint.sent.length, 0)

  const valid = supervisor.request({ ...outsideRequest, uri: "file:///workspace/Main.ets" })
  endpoint.message(successResponse(protocol, endpoint.sent[0], null))
  assert.equal(await valid.result, null)
  await supervisor.dispose()

  assert.throws(
    () => createSupervisor(protocol, new FakeEndpoint(), {
      rootUri: "https://example.com/workspace",
    }),
    error => error.code === "invalid-request",
  )
  assert.throws(
    () => createSupervisor(protocol, new FakeEndpoint(), { epoch: 0 }),
    error => error.code === "invalid-request",
  )
  assert.throws(
    () => createSupervisor(protocol, new FakeEndpoint(), {
      rootUri: `file:///${"r".repeat(17 * 1024)}`,
    }),
    error => error.code === "invalid-request",
  )
})

test("coalesces queued workspace invalidations without losing distinct file changes", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const active = supervisor.mutate(changeMutation(1, "const value = 1\n"))
  const first = supervisor.mutate({
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace",
    rootDirty: false,
    resourceDirty: false,
    resourceChanged: false,
    changes: [{ uri: "file:///workspace/A.ets", kind: "created" }],
  })
  const second = supervisor.mutate({
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace",
    rootDirty: true,
    resourceDirty: true,
    resourceChanged: true,
    changes: [
      { uri: "file:///workspace/A.ets", kind: "changed" },
      { uri: "file:///workspace/B.ets", kind: "deleted" },
    ],
  })

  endpoint.message(mutationAck(protocol, 1))
  await active
  assert.equal(endpoint.sent.length, 2)
  assert.deepEqual(endpoint.sent[1], {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 7,
    revision: 2,
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace",
    rootDirty: true,
    resourceDirty: true,
    resourceChanged: true,
    changes: [
      { uri: "file:///workspace/A.ets", kind: "created" },
      { uri: "file:///workspace/B.ets", kind: "deleted" },
    ],
  })
  endpoint.message(mutationAck(protocol, 2))
  await Promise.all([first, second])
  assert.equal(endpoint.sent.length, 2)
  await supervisor.dispose()
})

test("fails the entire root closed when the bounded mutation journal overflows", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint)
  const active = supervisor.mutate(changeMutation(1, "const active = true\n"))
  active.catch(() => {})
  const queued = Array.from({ length: 32 }, (_, index) => supervisor.mutate({
    kind: "close",
    uri: `file:///workspace/Queued${index}.ets`,
    documentVersion: 1,
  }))
  for (const mutation of queued) mutation.catch(() => {})

  const overflow = supervisor.mutate({
    kind: "close",
    uri: "file:///workspace/Overflow.ets",
    documentVersion: 1,
  })

  await assert.rejects(overflow, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "restart-required"
  ))
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    }),
    error => error.code === "restart-required",
  )
  assert.equal(endpoint.terminateCalls, 1)
  assert.equal(observeSettlement(active).state, "pending")
  assert.ok((await Promise.allSettled(queued)).every(result => (
    result.status === "rejected" && result.reason.code === "restart-required"
  )))

  endpoint.terminateGate.resolve()
  await assert.rejects(active, error => error.code === "restart-required")
  assert.equal(endpoint.terminateCalls, 1)
})

test("fails closed when coalesced workspace invalidations exceed the wire bound", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint)
  const active = supervisor.mutate(changeMutation(1, "const active = true\n"))
  active.catch(() => {})
  const changes = (start) => Array.from({ length: 600 }, (_, offset) => ({
    uri: `file:///workspace/Generated${start + offset}.ets`,
    kind: "changed",
  }))
  const first = supervisor.mutate({
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace",
    rootDirty: false,
    resourceDirty: false,
    resourceChanged: false,
    changes: changes(0),
  })
  first.catch(() => {})

  const overflow = supervisor.mutate({
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace",
    rootDirty: false,
    resourceDirty: false,
    resourceChanged: false,
    changes: changes(600),
  })

  await assert.rejects(overflow, error => error.code === "restart-required")
  assert.throws(
    () => supervisor.mutate(changeMutation(2, "const value = 2\n")),
    error => error.code === "restart-required",
  )
  endpoint.terminateGate.resolve()
  await Promise.allSettled([active, first])
  assert.equal(endpoint.terminateCalls, 1)
})

test("accounts queued mutation UTF-8 bytes by the replacement snapshot", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const limit = protocol.RootSemanticWorkerSupervisor.maxQueuedMutationTextBytes
  const active = supervisor.mutate(changeMutation(
    1,
    "const active = true\n",
    "file:///workspace/Active.ets",
  ))
  const old = supervisor.mutate(changeMutation(1, "x".repeat(3 * 1024 * 1024)))
  const replacement = supervisor.mutate(changeMutation(2, "🙂"))
  const exactRemainder = supervisor.mutate(changeMutation(
    1,
    "y".repeat(limit - Buffer.byteLength("🙂")),
    "file:///workspace/Second.ets",
  ))

  endpoint.message(mutationAck(protocol, 1))
  await active
  assert.equal(endpoint.sent[1].text, "🙂")
  endpoint.message(mutationAck(protocol, 2))
  await Promise.all([old, replacement])
  assert.equal(Buffer.byteLength(endpoint.sent[2].text), limit - 4)
  endpoint.message(mutationAck(protocol, 3))
  await exactRemainder
  await supervisor.dispose()
})

test("rejects every stale response identity field and non-gapless acknowledgement", async (t) => {
  const protocol = buildDriver(t)
  const corruptions = [
    response => ({ ...response, epoch: response.epoch + 1 }),
    response => ({ ...response, id: response.id + 1 }),
    response => ({ ...response, appliedRevision: response.appliedRevision + 1 }),
    response => ({ ...response, documentVersion: response.documentVersion + 1 }),
  ]
  for (const corrupt of corruptions) {
    const endpoint = new FakeEndpoint()
    const supervisor = createSupervisor(protocol, endpoint)
    const request = supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 4,
      args: { position: { line: 0, character: 0 } },
    })
    endpoint.message(corrupt(successResponse(protocol, endpoint.sent[0], null)))
    await assert.rejects(request.result, error => error.code === "worker-unavailable")
  }

  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const mutation = supervisor.mutate(changeMutation(1, "const value = 1\n"))
  endpoint.message(mutationAck(protocol, 2))
  await assert.rejects(mutation, error => error.code === "worker-unavailable")
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    }),
    error => error.code === "worker-unavailable",
  )
})

test("keeps independent root generations, queues, and cancellation cells isolated", async (t) => {
  const protocol = buildDriver(t)
  const endpointA = new FakeEndpoint()
  const endpointB = new FakeEndpoint()
  const supervisorA = createSupervisor(protocol, endpointA, { rootUri: "file:///root-a" })
  const supervisorB = createSupervisor(protocol, endpointB, { rootUri: "file:///root-b" })
  const requestA = supervisorA.request({
    method: "hover",
    uri: "file:///root-a/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const requestB = supervisorB.request({
    method: "hover",
    uri: "file:///root-b/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const mutationA = supervisorA.mutate(changeMutation(
    2,
    "const value = 2\n",
    "file:///root-a/Main.ets",
  ))

  assert.equal(
    Atomics.load(new Int32Array(endpointA.sent[0].cancelCell), 0),
    protocol.SemanticWorkerCancelState.contentModified,
  )
  assert.equal(
    Atomics.load(new Int32Array(endpointB.sent[0].cancelCell), 0),
    protocol.SemanticWorkerCancelState.active,
  )
  endpointA.message(successResponse(protocol, endpointA.sent[0], null))
  endpointB.message(successResponse(protocol, endpointB.sent[0], { contents: "root-b" }))
  await assert.rejects(requestA.result, error => error.code === "content-modified")
  assert.deepEqual(await requestB.result, { contents: "root-b" })
  endpointA.message(mutationAck(protocol, 1))
  await mutationA
  await Promise.all([supervisorA.dispose(), supervisorB.dispose()])
})

test("turns a synchronous terminate throw into one stable rejected dispose", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.throwOnTerminate = true
  endpoint.terminateError = new Error("deterministic terminate failure")
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  request.result.catch(() => {})

  const first = supervisor.dispose()
  deadline.resolve()
  await assert.rejects(first, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "worker-unavailable"
    && error.message === "Semantic worker unavailable"
  ))
  assert.equal(supervisor.dispose(), first)
  await assert.rejects(request.result, error => error.code === "worker-unavailable")
  assert.equal(endpoint.terminateCalls, 1)
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    }),
    error => error.code === "worker-unavailable",
  )
})

test("preserves an undispatched open when coalescing its latest full-text change", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const active = supervisor.mutate(changeMutation(
    1,
    "const active = true\n",
    "file:///workspace/Active.ets",
  ))
  const opened = supervisor.mutate({
    kind: "open",
    uri: "file:///workspace/Main.ets",
    documentVersion: 1,
    text: "const value = 1\n",
  })
  const changed = supervisor.mutate(changeMutation(2, "const value = 2\n"))

  endpoint.message(mutationAck(protocol, 1))
  await active
  assert.equal(endpoint.sent[1].kind, "open")
  assert.equal(endpoint.sent[1].documentVersion, 2)
  assert.equal(endpoint.sent[1].text, "const value = 2\n")
  endpoint.message(mutationAck(protocol, 2))
  await Promise.all([opened, changed])
  await supervisor.dispose()
})

test("normalizes malformed public inputs without poisoning the healthy root", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)

  assert.throws(
    () => supervisor.mutate(changeMutation(-1, "invalid")),
    error => (
      error instanceof protocol.SemanticWorkerSupervisorError
      && error.code === "invalid-request"
    ),
  )
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: -1, character: 0 } },
    }),
    error => (
      error instanceof protocol.SemanticWorkerSupervisorError
      && error.code === "invalid-request"
    ),
  )
  assert.equal(endpoint.sent.length, 0)

  const healthy = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  endpoint.message(successResponse(protocol, endpoint.sent[0], null))
  assert.equal(await healthy.result, null)
  await supervisor.dispose()
})

test("settles fail-closed when a worker corrupts the shared cancellation cell", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const wire = endpoint.sent[0]
  Atomics.store(new Int32Array(wire.cancelCell), 0, 99)

  endpoint.message(successResponse(protocol, wire, null))

  await assert.rejects(request.result, error => error.code === "worker-unavailable")
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    }),
    error => error.code === "worker-unavailable",
  )
})

test("degrades the root instead of dropping one individually over-bound mutation", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const oversizedText = "x".repeat(
    protocol.RootSemanticWorkerSupervisor.maxQueuedMutationTextBytes + 1,
  )
  assert.throws(
    () => supervisor.mutate(changeMutation(
      1,
      oversizedText,
      "file:///workspace-evil/Main.ets",
    )),
    error => error.code === "invalid-request",
  )
  assert.equal(endpoint.terminateCalls, 0)
  const overflow = supervisor.mutate(changeMutation(1, oversizedText))

  await assert.rejects(overflow, error => error.code === "restart-required")
  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    }),
    error => error.code === "restart-required",
  )
  assert.equal(endpoint.terminateCalls, 1)
})

test("rejects hostile top-level inputs without executing accessors", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  let getterCalls = 0
  const accessorMutation = {}
  Object.defineProperty(accessorMutation, "kind", {
    enumerable: true,
    get() {
      getterCalls += 1
      throw new Error("must not execute")
    },
  })
  const accessorRequest = {}
  Object.defineProperty(accessorRequest, "method", {
    enumerable: true,
    get() {
      getterCalls += 1
      throw new Error("must not execute")
    },
  })
  const symbol = Symbol("hostile")
  const validMutation = changeMutation(1, "const value = 1\n")
  const validRequest = {
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  }
  const mutationInputs = [
    Object.assign(Object.create({ inherited: true }), validMutation),
    accessorMutation,
    { ...validMutation, extra: true },
    Object.assign({ ...validMutation }, { [symbol]: true }),
  ]
  const requestInputs = [
    Object.assign(Object.create(null), validRequest),
    accessorRequest,
    { ...validRequest, extra: true },
    Object.assign({ ...validRequest }, { [symbol]: true }),
  ]

  for (const input of mutationInputs) {
    assert.throws(
      () => supervisor.mutate(input),
      error => fixedSupervisorError(protocol, error, "invalid-request"),
    )
  }
  for (const input of requestInputs) {
    assert.throws(
      () => supervisor.request(input),
      error => fixedSupervisorError(protocol, error, "invalid-request"),
    )
  }
  assert.equal(getterCalls, 0)
  assert.equal(endpoint.sent.length, 0)

  const healthy = supervisor.request(validRequest)
  endpoint.message(successResponse(protocol, endpoint.sent[0], null))
  assert.equal(await healthy.result, null)
  await supervisor.dispose()
})

test("bounds idle disposal when terminate never settles and observes a late rejection", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })

  const disposal = supervisor.dispose()
  const settlement = observeSettlement(disposal)
  await Promise.resolve()
  assert.equal(endpoint.terminateCalls, 1)
  assert.equal(settlement.state, "pending")

  deadline.resolve()
  await disposal
  assert.equal(settlement.state, "fulfilled")
  assert.equal(endpoint.terminateCalls, 1)

  endpoint.terminateGate.reject(new Error("late orphan rejection"))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(endpoint.terminateCalls, 1)
})

test("bounds active disposal when terminate never settles after the grace deadline", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const requestSettlement = observeSettlement(request.result)

  const disposal = supervisor.dispose()
  await Promise.resolve()
  assert.equal(endpoint.terminateCalls, 0)
  assert.equal(requestSettlement.state, "pending")

  deadline.resolve()
  await disposal
  await assert.rejects(request.result, error => error.code === "worker-unavailable")
  assert.equal(endpoint.terminateCalls, 1)

  endpoint.terminateGate.reject(new Error("late active orphan rejection"))
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(endpoint.terminateCalls, 1)
})

test("preserves a client cancellation that wins before disposal times out", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })

  assert.equal(
    request.cancel(protocol.SemanticWorkerCancelState.clientCancelled),
    protocol.SemanticWorkerCancelState.clientCancelled,
  )
  const disposal = supervisor.dispose()
  deadline.resolve()

  await disposal
  await assert.rejects(request.result, error => error.code === "client-cancelled")
  assert.equal(
    Atomics.load(new Int32Array(endpoint.sent[0].cancelCell), 0),
    protocol.SemanticWorkerCancelState.clientCancelled,
  )
  assert.equal(endpoint.terminateCalls, 1)
  endpoint.terminateGate.resolve()
})

test("preserves content-modified when a later protocol fault closes the root", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint)
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const mutation = supervisor.mutate(changeMutation(2, "const value = 2\n"))
  mutation.catch(() => {})

  endpoint.message({
    ...successResponse(protocol, endpoint.sent[0], null),
    id: endpoint.sent[0].id + 1,
  })
  endpoint.terminateGate.resolve()

  await assert.rejects(request.result, error => error.code === "content-modified")
  await assert.rejects(mutation, error => error.code === "worker-unavailable")
  assert.equal(endpoint.terminateCalls, 1)
})

test("preserves content-modified when overflow reaches the termination deadline", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const requestSettlement = observeSettlement(request.result)
  const queued = [supervisor.mutate(changeMutation(2, "const value = 2\n"))]
  for (let index = 1; index < 32; index += 1) {
    queued.push(supervisor.mutate({
      kind: "close",
      uri: `file:///workspace/Queued${index}.ets`,
      documentVersion: 1,
    }))
  }
  for (const mutation of queued) mutation.catch(() => {})

  const overflow = supervisor.mutate({
    kind: "close",
    uri: "file:///workspace/Overflow.ets",
    documentVersion: 1,
  })
  await assert.rejects(overflow, error => error.code === "restart-required")
  await Promise.resolve()
  assert.equal(requestSettlement.state, "pending")

  deadline.resolve()
  await assert.rejects(request.result, error => error.code === "content-modified")
  assert.ok((await Promise.allSettled(queued)).every(result => (
    result.status === "rejected" && result.reason.code === "restart-required"
  )))
  assert.equal(endpoint.terminateCalls, 1)
  endpoint.terminateGate.resolve()
})

test("still terminates once and reports a fixed error when listener cleanup throws", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.throwOnUnlisten = true
  endpoint.unlistenError = new Error("hostile listener cleanup")
  const supervisor = createSupervisor(protocol, endpoint)

  const first = supervisor.dispose()
  assert.equal(supervisor.dispose(), first)
  await assert.rejects(first, error => (
    error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === "worker-unavailable"
    && error.message === "Semantic worker unavailable"
  ))
  assert.equal(endpoint.unlistenCalls, 1)
  assert.equal(endpoint.terminateCalls, 1)
})

test("keeps a protocol-faulted request fenced until termination or deadline", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const settlement = observeSettlement(request.result)

  endpoint.message({
    ...successResponse(protocol, endpoint.sent[0], null),
    id: endpoint.sent[0].id + 1,
  })
  await Promise.resolve()
  assert.equal(endpoint.terminateCalls, 1)
  assert.equal(settlement.state, "pending")

  deadline.resolve()
  await assert.rejects(request.result, error => error.code === "worker-unavailable")
  assert.equal(endpoint.terminateCalls, 1)
  endpoint.terminateGate.reject(new Error("late protocol-fault orphan rejection"))
  await Promise.resolve()
  await Promise.resolve()
})

test("ignores post-fault messages when listener cleanup could not detach", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.throwOnUnlisten = true
  endpoint.terminateGate = testDeferred()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  const wire = endpoint.sent[0]
  const settlement = observeSettlement(request.result)

  endpoint.message({ ...successResponse(protocol, wire, null), id: wire.id + 1 })
  await Promise.resolve()
  assert.equal(endpoint.terminateCalls, 1)
  endpoint.message(successResponse(protocol, wire, { contents: "untrusted" }))
  await Promise.resolve()
  assert.equal(settlement.state, "pending")

  deadline.resolve()
  await assert.rejects(request.result, error => error.code === "worker-unavailable")
  endpoint.terminateGate.resolve()
})

test("fences send and decode faults until termination completes", async (t) => {
  const protocol = buildDriver(t)
  for (const fault of ["send", "decode"]) {
    const endpoint = new FakeEndpoint()
    endpoint.terminateGate = testDeferred()
    if (fault === "send") endpoint.sendError = new Error("send failed")
    const supervisor = createSupervisor(protocol, endpoint)
    const request = supervisor.request({
      method: "hover",
      uri: "file:///workspace/Main.ets",
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    })
    const settlement = observeSettlement(request.result)
    if (fault === "decode") endpoint.message({ malformed: true })

    await Promise.resolve()
    assert.equal(endpoint.terminateCalls, 1, fault)
    assert.equal(settlement.state, "pending", fault)

    endpoint.terminateGate.resolve()
    await assert.rejects(
      request.result,
      error => error.code === "worker-unavailable",
      fault,
    )
    assert.equal(endpoint.terminateCalls, 1, fault)
  }
})

test("treats endpoint error as terminal without waiting for terminate", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const deadline = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint, {
    waitForDisposeDeadline: () => deadline.promise,
  })
  const request = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })

  endpoint.error(new Error("terminal endpoint error"))
  await assert.rejects(request.result, error => error.code === "worker-unavailable")
  await Promise.resolve()
  assert.equal(endpoint.terminateCalls, 1)

  deadline.resolve()
  endpoint.terminateGate.resolve()
})

test("does not coalesce across document and workspace mutation barriers", async (t) => {
  const protocol = buildDriver(t)
  const documentEndpoint = new FakeEndpoint()
  const documentSupervisor = createSupervisor(protocol, documentEndpoint)
  const activeDocument = documentSupervisor.mutate(changeMutation(
    1,
    "const active = true\n",
    "file:///workspace/Active.ets",
  ))
  const beforeWorkspace = documentSupervisor.mutate(changeMutation(
    1,
    "const value = 1\n",
    "file:///workspace/A.ets",
  ))
  const workspaceBarrier = documentSupervisor.mutate(workspaceMutation([
    { uri: "file:///workspace/A.ets", kind: "deleted" },
  ]))
  const afterWorkspace = documentSupervisor.mutate({
    kind: "close",
    uri: "file:///workspace/A.ets",
    documentVersion: 2,
  })

  documentEndpoint.message(mutationAck(protocol, 1))
  await activeDocument
  assert.equal(documentEndpoint.sent[1].kind, "change")
  documentEndpoint.message(mutationAck(protocol, 2))
  await beforeWorkspace
  assert.equal(documentEndpoint.sent[2].kind, "workspaceFilesChanged")
  documentEndpoint.message(mutationAck(protocol, 3))
  await workspaceBarrier
  assert.equal(documentEndpoint.sent[3].kind, "close")
  documentEndpoint.message(mutationAck(protocol, 4))
  await afterWorkspace
  await documentSupervisor.dispose()

  const workspaceEndpoint = new FakeEndpoint()
  const workspaceSupervisor = createSupervisor(protocol, workspaceEndpoint)
  const activeWorkspace = workspaceSupervisor.mutate(changeMutation(
    1,
    "const active = true\n",
    "file:///workspace/Active.ets",
  ))
  const beforeDocument = workspaceSupervisor.mutate(workspaceMutation([
    { uri: "file:///workspace/A.ets", kind: "changed" },
  ]))
  const documentBarrier = workspaceSupervisor.mutate({
    kind: "close",
    uri: "file:///workspace/B.ets",
    documentVersion: 1,
  })
  const afterDocument = workspaceSupervisor.mutate(workspaceMutation([
    { uri: "file:///workspace/C.ets", kind: "created" },
  ]))

  workspaceEndpoint.message(mutationAck(protocol, 1))
  await activeWorkspace
  assert.equal(workspaceEndpoint.sent[1].kind, "workspaceFilesChanged")
  assert.deepEqual(workspaceEndpoint.sent[1].changes, [
    { uri: "file:///workspace/A.ets", kind: "changed" },
  ])
  workspaceEndpoint.message(mutationAck(protocol, 2))
  await beforeDocument
  assert.equal(workspaceEndpoint.sent[2].kind, "close")
  workspaceEndpoint.message(mutationAck(protocol, 3))
  await documentBarrier
  assert.equal(workspaceEndpoint.sent[3].kind, "workspaceFilesChanged")
  assert.deepEqual(workspaceEndpoint.sent[3].changes, [
    { uri: "file:///workspace/C.ets", kind: "created" },
  ])
  workspaceEndpoint.message(mutationAck(protocol, 4))
  await afterDocument
  await workspaceSupervisor.dispose()
})

test("counts barrier-separated workspace invalidations in the mutation queue bound", async (t) => {
  const protocol = buildDriver(t)
  assert.equal(protocol.RootSemanticWorkerSupervisor.maxQueuedMutationRecords, 32)
  const endpoint = new FakeEndpoint()
  endpoint.terminateGate = testDeferred()
  const supervisor = createSupervisor(protocol, endpoint)
  const active = supervisor.mutate(changeMutation(
    1,
    "const active = true\n",
    "file:///workspace/Active.ets",
  ))
  active.catch(() => {})
  const queued = []
  for (let index = 0; index < 16; index += 1) {
    queued.push(supervisor.mutate(workspaceMutation([
      { uri: `file:///workspace/External${index}.ets`, kind: "changed" },
    ])))
    queued.push(supervisor.mutate({
      kind: "close",
      uri: `file:///workspace/Open${index}.ets`,
      documentVersion: 1,
    }))
  }
  for (const mutation of queued) mutation.catch(() => {})

  const overflow = supervisor.mutate(workspaceMutation([
    { uri: "file:///workspace/Overflow.ets", kind: "created" },
  ]))
  await assert.rejects(overflow, error => error.code === "restart-required")
  assert.throws(
    () => supervisor.mutate(changeMutation(2, "const value = 2\n")),
    error => error.code === "restart-required",
  )
  assert.equal(endpoint.terminateCalls, 1)

  endpoint.terminateGate.resolve()
  await Promise.allSettled([active, ...queued])
})

test("rejects malformed over-bound workspace changes without poisoning the root", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  let getterCalls = 0
  const malformedChange = { kind: "changed" }
  Object.defineProperty(malformedChange, "uri", {
    enumerable: true,
    get() {
      getterCalls += 1
      throw new Error("must not execute")
    },
  })
  const changes = Array.from(
    { length: 1_025 },
    (_, index) => index === 1_024
      ? malformedChange
      : { uri: `file:///workspace/External${index}.ets`, kind: "changed" },
  )

  await assert.rejects(
    Promise.resolve().then(() => supervisor.mutate(workspaceMutation(changes))),
    error => fixedSupervisorError(protocol, error, "invalid-request"),
  )
  assert.equal(getterCalls, 0)
  assert.equal(endpoint.terminateCalls, 0)

  const healthy = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  endpoint.message(successResponse(protocol, endpoint.sent[0], null))
  assert.equal(await healthy.result, null)
  await supervisor.dispose()
})

test("rejects lexical file URI aliases before they become scheduler keys", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = createSupervisor(protocol, endpoint)
  const alias = "file:///workspace/%41.ets"

  assert.throws(
    () => supervisor.request({
      method: "hover",
      uri: alias,
      expectedDocumentVersion: 1,
      args: { position: { line: 0, character: 0 } },
    }),
    error => fixedSupervisorError(protocol, error, "invalid-request"),
  )
  assert.throws(
    () => supervisor.mutate(changeMutation(1, "const value = 1\n", alias)),
    error => fixedSupervisorError(protocol, error, "invalid-request"),
  )
  assert.throws(
    () => supervisor.mutate(workspaceMutation([
      { uri: alias, kind: "changed" },
    ])),
    error => fixedSupervisorError(protocol, error, "invalid-request"),
  )
  assert.throws(
    () => createSupervisor(protocol, new FakeEndpoint(), {
      rootUri: "file:///%77orkspace",
    }),
    error => fixedSupervisorError(protocol, error, "invalid-request"),
  )
  assert.equal(endpoint.sent.length, 0)

  const healthy = supervisor.request({
    method: "hover",
    uri: "file:///workspace/A.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  endpoint.message(successResponse(protocol, endpoint.sent[0], null))
  assert.equal(await healthy.result, null)
  await supervisor.dispose()
})

class FakeEndpoint {
  sent = []
  terminateCalls = 0
  unlistenCalls = 0
  terminateGate
  terminateError
  sendError
  throwOnTerminate = false
  throwOnUnlisten = false
  unlistenError
  #handlers

  listen(handlers) {
    this.#handlers = handlers
    return () => {
      this.unlistenCalls += 1
      if (this.throwOnUnlisten) {
        throw this.unlistenError ?? new Error("unlisten failed")
      }
      if (this.#handlers === handlers) this.#handlers = undefined
    }
  }

  send(message) {
    if (this.sendError) throw this.sendError
    this.sent.push(message)
  }

  message(message) {
    this.#handlers?.message(message)
  }

  error(error = new Error("worker failed")) {
    this.#handlers?.error(error)
  }

  exit(code = 1) {
    this.#handlers?.exit(code)
  }

  terminate() {
    this.terminateCalls += 1
    if (this.throwOnTerminate) throw this.terminateError ?? new Error("terminate failed")
    if (this.terminateGate) return this.terminateGate.promise
    if (this.terminateError) return Promise.reject(this.terminateError)
  }
}

function callHierarchyWorkerItem(overrides = {}) {
  const item = {
    uri: "file:///workspace/Main.ets",
    name: "build",
    kind: "method",
    sourceFingerprint: "a".repeat(64),
    range: {
      start: { line: 3, character: 2 },
      end: { line: 8, character: 3 },
    },
    selectionRange: {
      start: { line: 3, character: 2 },
      end: { line: 3, character: 7 },
    },
    ...overrides,
  }
  return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))
}

function callHierarchyRequestItem() {
  const { sourceFingerprint: _sourceFingerprint, ...item } = callHierarchyWorkerItem()
  return item
}

function changeMutation(documentVersion, text, uri = "file:///workspace/Main.ets") {
  return { kind: "change", uri, documentVersion, text }
}

function workspaceMutation(changes) {
  return {
    kind: "workspaceFilesChanged",
    rootUri: "file:///workspace",
    rootDirty: false,
    resourceDirty: false,
    resourceChanged: false,
    changes,
  }
}

function fixedSupervisorError(protocol, error, code) {
  return error instanceof protocol.SemanticWorkerSupervisorError
    && error.code === code
    && error.message === "Invalid semantic worker request"
}

function createSupervisor(protocol, endpoint, overrides = {}) {
  return new protocol.RootSemanticWorkerSupervisor({
    rootUri: "file:///workspace",
    epoch: 7,
    endpoint,
    waitForDisposeDeadline: never,
    ...overrides,
  })
}

function successResponse(protocol, request, value) {
  return {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: request.epoch,
    id: request.id,
    appliedRevision: request.requiredRevision,
    documentVersion: request.expectedDocumentVersion,
    ok: true,
    value,
  }
}

function mutationAck(protocol, appliedRevision) {
  return {
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 7,
    appliedRevision,
  }
}

function never() {
  return new Promise(() => {})
}

function observeSettlement(promise) {
  const observation = { state: "pending" }
  promise.then(
    () => { observation.state = "fulfilled" },
    () => { observation.state = "rejected" },
  )
  return observation
}

function testDeferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function buildDriver(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-semantic-supervisor-"))
  const outfile = path.join(directory, "semantic-worker-supervisor.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "semantic", "semantic-worker-supervisor.ts")],
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
