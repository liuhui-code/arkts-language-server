import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import test from "node:test"

import { buildSync } from "esbuild"

import { projectRoot } from "./support/lsp-process.mjs"

test("routes an interactive response while references remain detached", async (t) => {
  const protocol = buildDriver(t)
  const endpoint = new FakeEndpoint()
  const supervisor = new protocol.RootSemanticWorkerSupervisor({
    rootUri: "file:///workspace",
    epoch: 7,
    endpoint,
    waitForDisposeDeadline: () => new Promise(() => {}),
  })
  const references = supervisor.request({
    method: "references",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 }, includeDeclaration: true },
  })
  const hover = supervisor.request({
    method: "hover",
    uri: "file:///workspace/Main.ets",
    expectedDocumentVersion: 1,
    args: { position: { line: 0, character: 0 } },
  })
  assert.deepEqual(endpoint.sent.map(message => message.method), ["references", "hover"])

  endpoint.message(success(protocol, endpoint.sent[1], { contents: "interactive" }))
  assert.deepEqual(await hover.result, { contents: "interactive" })
  let referencesSettled = false
  void references.result.then(
    () => { referencesSettled = true },
    () => { referencesSettled = true },
  )
  await Promise.resolve()
  assert.equal(referencesSettled, false)

  const mutation = supervisor.mutate({
    kind: "change",
    uri: "file:///workspace/Main.ets",
    documentVersion: 2,
    text: "const current = 2\n",
  })
  assert.equal(endpoint.sent[2].kind, "change")
  assert.equal(
    Atomics.load(new Int32Array(endpoint.sent[0].cancelCell), 0),
    protocol.SemanticWorkerCancelState.contentModified,
  )
  endpoint.message({
    protocol: protocol.SEMANTIC_WORKER_PROTOCOL_VERSION,
    epoch: 7,
    appliedRevision: 1,
  })
  await mutation
  endpoint.message(success(protocol, endpoint.sent[0], { status: "complete", references: [] }))
  await assert.rejects(references.result, error => error.code === "content-modified")
  await supervisor.dispose()
})

class FakeEndpoint {
  sent = []
  handlers

  listen(handlers) {
    this.handlers = handlers
    return () => { this.handlers = undefined }
  }

  send(message) {
    this.sent.push(message)
  }

  message(message) {
    this.handlers?.message(message)
  }

  terminate() {}
}

function success(protocol, request, value) {
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

function buildDriver(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-supervisor-lanes-"))
  const outfile = path.join(directory, "driver.cjs")
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
