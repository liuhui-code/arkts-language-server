import assert from "node:assert/strict"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { buildSync } from "esbuild"

import { buildScriptedSemanticServer } from "./support/build-test-server.mjs"
import { LspProcess, projectRoot } from "./support/lsp-process.mjs"

const scriptedServerPath = buildScriptedSemanticServer()

test("a didOpen in the same workspace makes an in-flight references result ContentModified", async (t) => {
  const session = await openMultiRootServer(t)
  const queryUri = session.uri("first", "Query.ets")
  openDocument(session.server, queryUri, "// WORKSPACE_GLOBAL_IGNORES_ABORT")

  const entered = session.server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`workspace-global references entered ${queryUri}`),
  )
  session.server.send(referenceRequest(10, queryUri))
  await entered

  const changedUri = session.uri("first", "NewlyOpened.ets")
  const released = mutationProcessed(session.server, changedUri)
  openDocument(session.server, changedUri, "struct NewlyOpened {}")
  await released

  const response = await session.server.response(10)
  assert.equal(response.result, undefined, "a stale Location[] must never be returned")
  assert.equal(response.error?.code, -32801)
})

test("a didChange in the same workspace makes an in-flight references result ContentModified", async (t) => {
  const session = await openMultiRootServer(t)
  const queryUri = session.uri("first", "Query.ets")
  const changedUri = session.uri("first", "Changed.ets")
  openDocument(session.server, queryUri, "// WORKSPACE_GLOBAL_IGNORES_ABORT")
  openDocument(session.server, changedUri, "struct Before {}")

  const entered = session.server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`workspace-global references entered ${queryUri}`),
  )
  session.server.send(referenceRequest(20, queryUri))
  await entered

  const released = mutationProcessed(session.server, `${changedUri}@2`)
  changeDocument(session.server, changedUri, "struct After {}", 2)
  await released

  const response = await session.server.response(20)
  assert.equal(response.result, undefined, "a stale Location[] must never be returned")
  assert.equal(response.error?.code, -32801)
})

test("a didClose in the same workspace makes an in-flight references result ContentModified", async (t) => {
  const session = await openMultiRootServer(t)
  const queryUri = session.uri("first", "Query.ets")
  const closedUri = session.uri("first", "Closed.ets")
  openDocument(session.server, queryUri, "// WORKSPACE_GLOBAL_IGNORES_ABORT")
  openDocument(session.server, closedUri, "struct Closed {}")

  const entered = session.server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`workspace-global references entered ${queryUri}`),
  )
  session.server.send(referenceRequest(30, queryUri))
  await entered

  const released = mutationProcessed(session.server, `${closedUri}@close`)
  closeDocument(session.server, closedUri)
  await released

  const response = await session.server.response(30)
  assert.equal(response.result, undefined, "a stale Location[] must never be returned")
  assert.equal(response.error?.code, -32801)
})

test("a watched source change in the same workspace makes references ContentModified", async (t) => {
  const session = await openMultiRootServer(t)
  const queryUri = session.uri("first", "Query.ets")
  openDocument(session.server, queryUri, "// WORKSPACE_GLOBAL_IGNORES_ABORT")

  const entered = session.server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`workspace-global references entered ${queryUri}`),
  )
  session.server.send(referenceRequest(40, queryUri))
  await entered

  const released = mutationProcessed(session.server, session.rootUri("first"))
  watchedSourceChanged(session.server, session.uri("first", "Watched.ets"))
  await released

  const response = await session.server.response(40)
  assert.equal(response.result, undefined, "a stale Location[] must never be returned")
  assert.equal(response.error?.code, -32801)
})

test("every same-workspace mutation makes cancellation-resistant prepareRename ContentModified", async (t) => {
  const session = await openMultiRootServer(t)
  for (const [index, lifecycle] of mutationLifecycles.entries()) {
    const queryUri = session.uri("first", `Prepare${index}.ets`)
    const mutation = prepareMutation(session, "first", `Prepare${index}`, lifecycle)
    openDocument(session.server, queryUri, "// WORKSPACE_GLOBAL_IGNORES_ABORT")

    const entered = session.server.notification(
      "window/logMessage",
      ({ params }) => params.message.includes(`workspace-global prepareRename entered ${queryUri}`),
    )
    const id = 50 + index
    session.server.send(globalRequest(id, "textDocument/prepareRename", queryUri))
    await entered

    const released = mutationProcessed(session.server, mutation.processedMarker)
    mutation.send()
    await released

    const response = await session.server.response(id)
    assert.equal(response.result, undefined, "a stale prepare range must never be returned")
    assert.equal(response.error?.code, -32801, lifecycle)
  }
})

test("every same-workspace mutation makes cancellation-resistant rename ContentModified", async (t) => {
  const session = await openMultiRootServer(t)
  for (const [index, lifecycle] of mutationLifecycles.entries()) {
    const queryUri = session.uri("first", `Rename${index}.ets`)
    const mutation = prepareMutation(session, "first", `Rename${index}`, lifecycle)
    openDocument(session.server, queryUri, "// WORKSPACE_GLOBAL_IGNORES_ABORT")

    const entered = session.server.notification(
      "window/logMessage",
      ({ params }) => params.message.includes(`workspace-global rename entered ${queryUri}`),
    )
    const id = 60 + index
    session.server.send(globalRequest(id, "textDocument/rename", queryUri))
    await entered

    const released = mutationProcessed(session.server, mutation.processedMarker)
    mutation.send()
    await released

    const response = await session.server.response(id)
    assert.equal(response.result, undefined, "a stale WorkspaceEdit must never be returned")
    assert.equal(response.error?.code, -32801, lifecycle)
  }
})

test("a client cancel arriving after didChange preserves ContentModified as the first cause", async (t) => {
  const session = await openMultiRootServer(t)
  const queryUri = session.uri("first", "MutationFirst.ets")
  const changedUri = session.uri("first", "MutationFirstBarrier.ets")
  openDocument(session.server, queryUri, "// RENAME_IGNORES_ABORT")
  openDocument(
    session.server,
    changedUri,
    "// WORKSPACE_MUTATION_PROBE\nstruct Before {}",
  )

  const entered = session.server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes("scripted resistant rename entered"),
  )
  session.server.send(globalRequest(65, "textDocument/rename", queryUri))
  await entered

  const mutationObserved = mutationProcessed(session.server, `${changedUri}@2`)
  changeDocument(
    session.server,
    changedUri,
    "// WORKSPACE_MUTATION_PROBE\nstruct After {}",
    2,
  )
  await mutationObserved

  session.server.send({
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id: 65 },
  })
  session.server.send(completionRequest(66, changedUri))
  assert.equal((await session.server.response(66)).error, undefined)

  changeDocument(session.server, queryUri, "// RENAME_IGNORES_ABORT", 2)
  const response = await session.server.response(65)
  assert.equal(response.result, undefined, "a stale WorkspaceEdit must never be returned")
  assert.deepEqual(response.error, {
    code: -32801,
    message: "Rename request is stale",
  })
})

test("a didChange arriving after client cancel preserves RequestCancelled as the first cause", async (t) => {
  const session = await openMultiRootServer(t)
  const queryUri = session.uri("first", "ClientFirst.ets")
  const changedUri = session.uri("first", "ClientFirstBarrier.ets")
  openDocument(session.server, queryUri, "// RENAME_IGNORES_ABORT")
  openDocument(
    session.server,
    changedUri,
    "// WORKSPACE_MUTATION_PROBE\nstruct Before {}",
  )

  const entered = session.server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes("scripted resistant rename entered"),
  )
  session.server.send(globalRequest(67, "textDocument/rename", queryUri))
  await entered

  session.server.send({
    jsonrpc: "2.0",
    method: "$/cancelRequest",
    params: { id: 67 },
  })
  session.server.send(completionRequest(68, changedUri))
  assert.equal((await session.server.response(68)).error, undefined)

  const mutationObserved = mutationProcessed(session.server, `${changedUri}@2`)
  changeDocument(
    session.server,
    changedUri,
    "// WORKSPACE_MUTATION_PROBE\nstruct After {}",
    2,
  )
  await mutationObserved

  changeDocument(session.server, queryUri, "// RENAME_IGNORES_ABORT", 2)
  const response = await session.server.response(67)
  assert.equal(response.result, undefined, "a cancelled WorkspaceEdit must never be returned")
  assert.deepEqual(response.error, {
    code: -32800,
    message: "Request cancelled by client",
  })
})

test("the first cause is exposed as a typed request abort reason", (t) => {
  const { RequestAbortError, RequestFreshness } = buildRequestFreshnessDriver(t)
  let cancelFromClient
  const token = {
    isCancellationRequested: false,
    onCancellationRequested(callback) {
      cancelFromClient = callback
      return { dispose() {} }
    },
  }
  const mutationFirst = new RequestFreshness()
  const staleRequest = mutationFirst.start(
    "rename",
    token,
    { kind: "workspace", workspaceId: "file:///workspace" },
  )

  mutationFirst.cancelWorkspace("file:///workspace")
  cancelFromClient()

  assert.ok(staleRequest.signal.reason instanceof RequestAbortError)
  assert.equal(staleRequest.signal.reason.kind, "content-modified")
  assert.equal(staleRequest.clientCancelled(), false)

  const clientFirst = new RequestFreshness()
  const cancelledRequest = clientFirst.start(
    "rename",
    token,
    { kind: "workspace", workspaceId: "file:///workspace" },
  )

  cancelFromClient()
  clientFirst.cancelWorkspace("file:///workspace")

  assert.ok(cancelledRequest.signal.reason instanceof RequestAbortError)
  assert.equal(cancelledRequest.signal.reason.kind, "client-cancelled")
  assert.equal(cancelledRequest.clientCancelled(), true)
})

test("mutations in another workspace do not invalidate workspace-global requests", async (t) => {
  const session = await openMultiRootServer(t)
  const releaseUri = session.uri("first", "Release.ets")
  openDocument(session.server, releaseUri, "// RELEASE_WORKSPACE_GLOBAL_BARRIER")
  const methods = [
    "textDocument/references",
    "textDocument/prepareRename",
    "textDocument/rename",
  ]

  for (const [index, method] of methods.entries()) {
    const queryUri = session.uri("first", `OtherWorkspace${index}.ets`)
    const changedUri = session.uri("second", `OtherWorkspace${index}.ets`)
    openDocument(session.server, queryUri, "// WORKSPACE_GLOBAL_IGNORES_ABORT")
    openDocument(session.server, changedUri, "// WORKSPACE_MUTATION_PROBE\nstruct Before {}")

    const entered = session.server.notification(
      "window/logMessage",
      ({ params }) => params.message.includes(
        `workspace-global ${semanticMethodName(method)} entered ${queryUri}`,
      ),
    )
    const requestId = 70 + index * 10
    session.server.send(globalRequest(requestId, method, queryUri))
    await entered

    const otherWorkspaceProcessed = mutationProcessed(
      session.server,
      `${changedUri}@2`,
    )
    changeDocument(
      session.server,
      changedUri,
      "// WORKSPACE_MUTATION_PROBE\nstruct After {}",
      2,
    )
    await otherWorkspaceProcessed

    const releaseProcessed = mutationProcessed(
      session.server,
      `semantic-release:${releaseUri}`,
    )
    session.server.send(completionRequest(requestId + 1, releaseUri))
    await releaseProcessed
    assert.equal((await session.server.response(requestId + 1)).error, undefined)

    const response = await session.server.response(requestId)
    assert.equal(response.error, undefined, `${method} must remain current`)
    assert.ok(response.result, `${method} must return its semantic result`)
  }
})

test("completion remains current when another document in its workspace changes", async (t) => {
  const session = await openMultiRootServer(t)
  const queryUri = session.uri("first", "Completion.ets")
  const changedUri = session.uri("first", "CompletionMutation.ets")
  openDocument(
    session.server,
    queryUri,
    "// WORKSPACE_MUTATION_RELEASES_COMPLETION",
  )
  openDocument(session.server, changedUri, "struct Before {}")

  const entered = session.server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`workspace-global completion entered ${queryUri}`),
  )
  session.server.send(completionRequest(100, queryUri))
  await entered

  const released = mutationProcessed(session.server, `${changedUri}@2`)
  changeDocument(session.server, changedUri, "struct After {}", 2)
  await released

  const response = await session.server.response(100)
  assert.equal(response.error, undefined)
  assert.equal(response.result?.items?.[0]?.label, "fixture-v1")
})

async function openMultiRootServer(t) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-global-freshness-"))
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))
  const roots = {
    first: path.join(temporaryRoot, "first"),
    second: path.join(temporaryRoot, "second"),
  }
  fs.mkdirSync(roots.first)
  fs.mkdirSync(roots.second)
  const server = new LspProcess({ serverPath: scriptedServerPath })
  t.after(() => server.close())
  server.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      processId: process.pid,
      rootUri: pathToFileURL(roots.first).href,
      workspaceFolders: Object.entries(roots).map(([name, root]) => ({
        name,
        uri: pathToFileURL(root).href,
      })),
      capabilities: renameCapableClientCapabilities(),
    },
  })
  await server.response(1)
  server.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  return {
    server,
    rootUri(workspace) {
      return pathToFileURL(roots[workspace]).href
    },
    uri(workspace, name) {
      return pathToFileURL(path.join(roots[workspace], name)).href
    },
  }
}

function watchedSourceChanged(server, uri) {
  server.send({
    jsonrpc: "2.0",
    method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri, type: 2 }] },
  })
}

const mutationLifecycles = ["open", "change", "close", "watched"]

function prepareMutation(session, workspace, stem, lifecycle) {
  const uri = session.uri(workspace, `${stem}Mutation.ets`)
  if (lifecycle === "change" || lifecycle === "close") {
    openDocument(session.server, uri, "struct Before {}")
  }
  if (lifecycle === "open") {
    return {
      processedMarker: `${uri}@1`,
      send: () => openDocument(session.server, uri, "struct Opened {}"),
    }
  }
  if (lifecycle === "change") {
    return {
      processedMarker: `${uri}@2`,
      send: () => changeDocument(session.server, uri, "struct Changed {}", 2),
    }
  }
  if (lifecycle === "close") {
    return {
      processedMarker: `${uri}@close`,
      send: () => closeDocument(session.server, uri),
    }
  }
  return {
    processedMarker: session.rootUri(workspace),
    send: () => watchedSourceChanged(session.server, uri),
  }
}

function openDocument(server, uri, text, version = 1) {
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didOpen",
    params: { textDocument: { uri, languageId: "arkts", version, text } },
  })
}

function changeDocument(server, uri, text, version) {
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didChange",
    params: {
      textDocument: { uri, version },
      contentChanges: [{ text }],
    },
  })
}

function closeDocument(server, uri) {
  server.send({
    jsonrpc: "2.0",
    method: "textDocument/didClose",
    params: { textDocument: { uri } },
  })
}

function referenceRequest(id, uri) {
  return {
    jsonrpc: "2.0",
    id,
    method: "textDocument/references",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
      context: { includeDeclaration: true },
    },
  }
}

function globalRequest(id, method, uri) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
      ...(method === "textDocument/references"
        ? { context: { includeDeclaration: true } }
        : {}),
      ...(method === "textDocument/rename" ? { newName: "Renamed" } : {}),
    },
  }
}

function completionRequest(id, uri) {
  return {
    jsonrpc: "2.0",
    id,
    method: "textDocument/completion",
    params: {
      textDocument: { uri },
      position: { line: 0, character: 0 },
    },
  }
}

function semanticMethodName(method) {
  if (method === "textDocument/prepareRename") return "prepareRename"
  return method.slice(method.lastIndexOf("/") + 1)
}

function mutationProcessed(server, changedUri) {
  return server.notification(
    "window/logMessage",
    ({ params }) => params.message.includes(`workspace mutation processed`)
      && params.message.includes(changedUri),
  )
}

function renameCapableClientCapabilities() {
  return {
    workspace: {
      workspaceEdit: {
        documentChanges: true,
        failureHandling: "transactional",
      },
    },
    textDocument: { rename: { prepareSupport: true } },
  }
}

function buildRequestFreshnessDriver(t) {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-request-freshness-"))
  t.after(() => fs.rmSync(outputRoot, { recursive: true, force: true }))
  const outfile = path.join(outputRoot, "request-freshness.cjs")
  buildSync({
    entryPoints: [path.join(projectRoot, "src", "lsp", "request-freshness.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile,
  })
  return createRequire(import.meta.url)(outfile)
}
