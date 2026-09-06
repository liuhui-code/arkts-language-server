import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

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
  await assert.rejects(first, /deterministic terminate failure/)
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

class FakeEndpoint {
  sent = []
  terminateCalls = 0
  terminateGate
  terminateError
  throwOnTerminate = false
  #handlers

  listen(handlers) {
    this.#handlers = handlers
    return () => {
      if (this.#handlers === handlers) this.#handlers = undefined
    }
  }

  send(message) {
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

function changeMutation(documentVersion, text, uri = "file:///workspace/Main.ets") {
  return { kind: "change", uri, documentVersion, text }
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
  const promise = new Promise(onResolve => { resolve = onResolve })
  return { promise, resolve }
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
