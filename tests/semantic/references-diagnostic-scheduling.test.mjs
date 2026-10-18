import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"
import { makeQueryLayerFixture } from "../support/query-layer-fixture.mjs"

test("an uncached cross-file definition overtakes a queued second diagnostic", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-diagnostic-priority-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const files = {
    Target: "export class ReferencedThing {}\n",
    Query: 'import { ReferencedThing } from "./Target"\nexport const query = new ReferencedThing()\n',
    Use: 'import { ReferencedThing } from "./Target"\nexport const use = new ReferencedThing()\n',
    Navigation: "/* 😀 */ export class NavigationTarget {}\n",
    Jump: 'import { NavigationTarget } from "./Navigation"\nexport const jump = new NavigationTarget()\n',
    DiagnosticA: 'const brokenA: number = "wrong"\n',
    DiagnosticB: 'const brokenB: number = "wrong"\n',
  }
  for (const [name, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(workspace, `${name}.ets`), source)
  }
  const uri = (name) => pathToFileURL(path.join(workspace, `${name}.ets`)).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { general: { positionEncodings: ["utf-16"] },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_SEMANTIC_QUEUE_TRACE: undefined,
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })

  for (const name of ["Query", "Jump"]) {
    session.openDocument({ uri: uri(name), version: 1, text: files[name] })
    const published = await diagnostic(session, uri(name))
    assert.equal(published.params.version, 1)
  }
  const references = await session.request("textDocument/references", {
    textDocument: { uri: uri("Query") },
    position: positionAt(files.Query, files.Query.lastIndexOf("ReferencedThing") + 1),
    context: { includeDeclaration: true },
  }, { timeoutMs: 20_000 })
  assert.equal(references.error, undefined, JSON.stringify(references.error))
  assert.ok(references.result.some((location) => location.uri === uri("Target")))

  const firstPublication = diagnostic(session, uri("DiagnosticA"))
  const secondPublication = diagnostic(session, uri("DiagnosticB"))
  let secondPublished = false
  void secondPublication.then(() => { secondPublished = true }, () => {})
  session.openDocument({ uri: uri("DiagnosticA"), version: 1, text: files.DiagnosticA })
  session.openDocument({ uri: uri("DiagnosticB"), version: 1, text: files.DiagnosticB })
  // Open both before either semantic diagnostic starts: opening B after A is
  // admitted would invalidate A's workspace snapshot and suppress v1 output.
  await waitForEvent(logDirectory, "semantic.test.diagnose.hold.start")
  await session.transport.notification("window/logMessage", (message) => (
    message.params.message.includes(`diagnostics test delay settled ${uri("DiagnosticB")}`)
  ), 10_000)
  // The first Worker diagnosis is still admitted, while the second diagnosis
  // has passed the normal debounce and been submitted to semantic.diagnose.
  assert.equal(readEvents(logDirectory).some(({ event }) =>
    event === "semantic.test.diagnose.hold.end"), false)

  const definition = await session.request("textDocument/definition", {
    textDocument: { uri: uri("Jump") },
    position: positionAt(files.Jump, files.Jump.lastIndexOf("NavigationTarget") + 1),
  }, { timeoutMs: 20_000 })
  assert.equal(definition.error, undefined, JSON.stringify(definition.error))
  assert.deepEqual(definition.result, [{
    uri: uri("Navigation"),
    range: rangeAt(files.Navigation, files.Navigation.indexOf("NavigationTarget"), "NavigationTarget"),
  }])
  const secondPublishedAtDefinition = secondPublished
  const [first, second] = await Promise.all([firstPublication, secondPublication])
  assert.deepEqual([first.params.version, second.params.version], [1, 1])
  assert.ok(Array.isArray(first.params.diagnostics))
  assert.ok(Array.isArray(second.params.diagnostics))
  assert.ok(first.params.diagnostics.length > 0, "first diagnostic was not computed")
  assert.ok(second.params.diagnostics.length > 0, "second diagnostic was not computed")
  assert.equal(secondPublishedAtDefinition, false,
    "definition waited for the queued second diagnostic")
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
  assert.equal(readEvents(logDirectory).some(({ event }) => event.startsWith("semantic.queue.")), false,
    "queue tracing must be absent unless explicitly enabled")
})

test("uncached inherited completion overtakes a queued diagnostic without suppressing either diagnosis",
  { timeout: 30_000 }, async t => {
    const files = {
      "Base.ets": fs.readFileSync(path.join(projectRoot, "fixtures/semantic/inherited-this/Base.ets"), "utf8"),
      "Derived.ets": fs.readFileSync(path.join(projectRoot, "fixtures/semantic/inherited-this/Derived.ets"), "utf8"),
      "OtherDerived.ets": fs.readFileSync(path.join(projectRoot, "fixtures/semantic/inherited-this/Derived.ets"), "utf8"),
      "DiagnosticA.ets": 'const brokenA: number = "wrong"\n',
      "DiagnosticB.ets": 'const brokenB: number = "wrong"\n',
    }
    const ranges = [
      { start: { line: 0, character: 9 }, end: { line: 0, character: 18 } },
      { start: { line: 2, character: 27 }, end: { line: 2, character: 36 } },
    ]
    const fixture = await makeQueryLayerFixture(t, {
      files,
      target: { kind: "references", file: "Base.ets", symbol: "BasePanel",
        position: { line: 0, character: 15 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: ["Derived.ets", "OtherDerived.ets"]
        .flatMap(file => ranges.map(range => ({ file, range }))) },
    })
    const uri = name => pathToFileURL(path.join(fixture.suite.workspace, name)).href
    const logDirectory = path.join(fixture.directory, "logs")
    const session = new LspSession({
      command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"),
        ARKTS_LSP_LOG_DIR: logDirectory,
        ARKTS_SEMANTIC_QUEUE_TRACE: "1",
        ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100",
        ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
        ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000,
      initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    for (const name of ["Base.ets", "Derived.ets", "OtherDerived.ets"]) {
      session.openDocument({ uri: uri(name), version: 1, text: files[name] })
      const initial = await diagnostic(session, uri(name))
      assert.equal(initial.params.version, 1)
    }
    const warm = await session.request("textDocument/references", {
      textDocument: { uri: uri("Base.ets") }, position: { line: 0, character: 15 },
      context: { includeDeclaration: false },
    }, { timeoutMs: 20_000 })
    assert.equal(warm.error, undefined, JSON.stringify(warm.error))
    assert.deepEqual(warm.result, ["Derived.ets", "OtherDerived.ets"]
      .flatMap(file => ranges.map(range => ({ uri: uri(file), range }))))

    const firstPublication = diagnostic(session, uri("DiagnosticA.ets"))
    const secondPublication = diagnostic(session, uri("DiagnosticB.ets"))
    let secondPublished = false
    void secondPublication.then(() => { secondPublished = true }, () => {})
    for (const name of ["DiagnosticA.ets", "DiagnosticB.ets"]) {
      session.openDocument({ uri: uri(name), version: 1, text: files[name] })
    }
    await waitForEvent(logDirectory, "semantic.test.diagnose.hold.start")
    await session.transport.notification("window/logMessage", message => (
      message.params.message.includes(`diagnostics test delay settled ${uri("DiagnosticB.ets")}`)
    ), 10_000)
    assert.equal(readEvents(logDirectory).some(({ event }) => event === "semantic.test.diagnose.hold.end"), false)

    const complete = file => session.request("textDocument/completion", {
      textDocument: { uri: uri(file) }, position: { line: 4, character: 9 },
    })
    const firstCompletion = complete("Derived.ets")
    const followingCompletion = complete("OtherDerived.ets")
    const completion = await firstCompletion
    const secondPublishedAtCompletion = secondPublished
    const following = await followingCompletion
    const secondPublishedAtFollowingCompletion = secondPublished
    assert.equal(completion.error, undefined, JSON.stringify(completion.error))
    assert.equal(following.error, undefined, JSON.stringify(following.error))
    const items = Array.isArray(completion.result) ? completion.result : completion.result.items
    const followingItems = Array.isArray(following.result) ? following.result : following.result.items
    assert.deepEqual(followingItems.map(({ label, kind }) => ({ label, kind })),
      items.map(({ label, kind }) => ({ label, kind })))
    assert.deepEqual(items.map(({ label, kind }) => ({ label, kind })).sort((a, b) => a.label.localeCompare(b.label)), [
      { label: "build", kind: 2 },
      { label: "inheritedRefresh", kind: 2 },
      { label: "inheritedTitle", kind: 5 },
    ])
    const [first, second] = await Promise.all([firstPublication, secondPublication])
    assert.deepEqual([first.params.version, second.params.version], [1, 1])
    assert.ok([first, second].every(message => message.params.diagnostics.some(diagnostic => diagnostic.code === 2322)))
    assert.equal(secondPublishedAtCompletion, false,
      "completion must not wait for a diagnostic that has not started executing")
    assert.equal(secondPublishedAtFollowingCompletion, true,
      "the oldest diagnostic must run before a second independent completion can bypass it")
    const queueEvents = readEvents(logDirectory).filter(({ event }) => event.startsWith("semantic.queue."))
    const sent = queueEvents.filter(({ event, method }) => event === "semantic.queue.send.returned" && method === "complete")
    assert.equal(sent.length, 2, "both real completions must retain their queue boundary receipts")
    for (const receipt of sent) {
      const enqueued = queueEvents.filter(entry => entry.event === "semantic.queue.enqueued"
        && entry.epoch === receipt.epoch && entry.traceId === receipt.traceId)
      assert.equal(enqueued.length, 1)
      assert.equal(receipt.rootUri, pathToFileURL(fixture.suite.workspace).href)
      assert.equal(receipt.uri, enqueued[0].uri)
      assert.equal(receipt.expectedDocumentVersion, 1)
      assert.ok(Number.isSafeInteger(receipt.workerRequestId) && receipt.workerRequestId > 0)
      assert.ok(Number.isSafeInteger(receipt.requiredAppliedRevision) && receipt.requiredAppliedRevision >= 0)
      assert.ok(Number.isFinite(enqueued[0].monotonicMs) && enqueued[0].monotonicMs >= 0)
      assert.ok(receipt.monotonicMs >= enqueued[0].monotonicMs)
      assert.equal(receipt.supervisorAdmissionToSendReturnedMs, receipt.monotonicMs - enqueued[0].monotonicMs)
      assert.ok(receipt.supervisorAdmissionToSendReturnedMs > 0)
      const started = queueEvents.filter(entry => entry.event === "semantic.queue.worker.dispatch.started"
        && entry.epoch === receipt.epoch && entry.workerRequestId === receipt.workerRequestId)
      assert.equal(started.length, 1, "physical Worker dispatch must be independently witnessed")
      assert.equal(started[0].uri, receipt.uri)
      assert.equal(started[0].method, receipt.method)
      assert.equal(started[0].requiredAppliedRevision, receipt.requiredAppliedRevision)
      assert.ok(Number.isSafeInteger(started[0].workerThreadId) && started[0].workerThreadId > 0)
      assert.ok(Number.isFinite(started[0].workerReceivedMonotonicMs) && started[0].workerReceivedMonotonicMs >= 0)
      assert.ok(started[0].workerDispatchMonotonicMs >= started[0].workerReceivedMonotonicMs)
      assert.equal(started[0].workerReceivedToDispatchMs,
        started[0].workerDispatchMonotonicMs - started[0].workerReceivedMonotonicMs)
    }
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("queued completion cancellation publishes once and a changed overlay recovers current members",
  { timeout: 30_000 }, async t => {
    const files = {
      "Base.ets": fs.readFileSync(path.join(projectRoot, "fixtures/semantic/inherited-this/Base.ets"), "utf8"),
      "Derived.ets": fs.readFileSync(path.join(projectRoot, "fixtures/semantic/inherited-this/Derived.ets"), "utf8"),
      "DiagnosticA.ets": 'const brokenA: number = "wrong"\n',
      "DiagnosticB.ets": 'const brokenB: number = "wrong"\n',
    }
    const fixture = await makeQueryLayerFixture(t, {
      files,
      target: { kind: "references", file: "Base.ets", symbol: "BasePanel",
        position: { line: 0, character: 15 }, includeDeclaration: false },
      oracle: { schemaVersion: 1, locations: [0, 2].map(line => ({ file: "Derived.ets", range: {
        start: { line, character: line === 0 ? 9 : 27 }, end: { line, character: line === 0 ? 18 : 36 },
      } })) },
    })
    const uri = name => pathToFileURL(path.join(fixture.suite.workspace, name)).href
    const logDirectory = path.join(fixture.directory, "logs")
    const session = new LspSession({
      command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logDirectory,
        ARKTS_SEMANTIC_QUEUE_TRACE: "1",
        ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100",
        ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
        ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000,
      initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    for (const name of ["Base.ets", "Derived.ets"]) {
      session.openDocument({ uri: uri(name), version: 1, text: files[name] })
      await diagnostic(session, uri(name))
    }
    for (const name of ["DiagnosticA.ets", "DiagnosticB.ets"]) {
      session.openDocument({ uri: uri(name), version: 1, text: files[name] })
    }
    await waitForEvent(logDirectory, "semantic.test.diagnose.hold.start")
    await session.transport.notification("window/logMessage", message => (
      message.params.message.includes(`diagnostics test delay settled ${uri("DiagnosticB.ets")}`)
    ), 10_000)
    const params = { textDocument: { uri: uri("Derived.ets") }, position: { line: 4, character: 9 } }
    const old = session.transport.response(50)
    session.transport.send({ jsonrpc: "2.0", id: 50, method: "textDocument/completion", params })
    await waitForEvent(logDirectory, "semantic.queue.enqueued", 10_000,
      entry => entry.method === "complete" && entry.uri === uri("Derived.ets"))
    const admission = readEvents(logDirectory).find(entry => entry.event === "semantic.queue.enqueued"
      && entry.method === "complete" && entry.uri === uri("Derived.ets"))
    session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id: 50 } })
    const cancelled = await old
    assert.equal(cancelled.error?.code, -32800, JSON.stringify(cancelled))
    assert.equal(cancelled.result, undefined)
    assert.equal(readEvents(logDirectory).some(({ event }) => event === "semantic.test.diagnose.hold.end"), false)

    const changed = 'class DetailsPanel {\n  currentTitle: string = ""\n\n  build(): void {\n    this.\n  }\n}\n'
    const latestPublication = session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === uri("Derived.ets") && message.params.version === 2, 20_000)
    session.changeDocument({ uri: uri("Derived.ets"), version: 2, text: changed })
    const fresh = await session.request("textDocument/completion", params)
    assert.equal(fresh.error, undefined, JSON.stringify(fresh.error))
    const items = Array.isArray(fresh.result) ? fresh.result : fresh.result.items
    assert.deepEqual(items.map(({ label, kind }) => ({ label, kind })).sort((a, b) => a.label.localeCompare(b.label)), [
      { label: "build", kind: 2 }, { label: "currentTitle", kind: 5 },
    ])
    const latest = await latestPublication
    assert.ok(latest.params.diagnostics.some(({ code }) => code === 1003), JSON.stringify(latest.params))
    const transcript = session.transport.diagnosticSnapshot().transcript
    assert.equal(transcript.droppedEntries, 0)
    assert.equal(transcript.entries.filter(entry => entry.direction === "receive" && entry.id === 50).length, 1)
    assert.equal(readEvents(logDirectory).some(entry => entry.event === "semantic.queue.send.returned"
      && entry.epoch === admission.epoch && entry.traceId === admission.traceId), false,
    "cancelled pending work must not acquire a successful send receipt")
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("completion priority cannot cross a queued global implementation query",
  { timeout: 30_000 }, async t => {
    const files = {
      "Base.ets": fs.readFileSync(path.join(projectRoot, "fixtures/semantic/inherited-this/Base.ets"), "utf8"),
      "Derived.ets": fs.readFileSync(path.join(projectRoot, "fixtures/semantic/inherited-this/Derived.ets"), "utf8"),
      "DiagnosticA.ets": 'const brokenA: number = "wrong"\n',
      "DiagnosticB.ets": 'const brokenB: number = "wrong"\n',
    }
    const fixture = await makeQueryLayerFixture(t, {
      files,
      target: { kind: "implementation", file: "Base.ets", symbol: "BasePanel",
        position: { line: 0, character: 15 } },
      oracle: { schemaVersion: 1, locations: [{ file: "Derived.ets", range: {
        start: { line: 2, character: 6 }, end: { line: 2, character: 18 },
      } }] },
    })
    const uri = name => pathToFileURL(path.join(fixture.suite.workspace, name)).href
    const logDirectory = path.join(fixture.directory, "logs")
    const session = new LspSession({
      command: process.execPath, args: [fixture.suite.server, "--stdio"],
      rootUri: pathToFileURL(fixture.suite.workspace).href,
      capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
      env: {
        ARKLINE_HARMONY_SDK_PATH: fixture.suite.sdk,
        ARKTS_INDEX_CACHE_DIR: path.join(fixture.directory, "index"), ARKTS_LSP_LOG_DIR: logDirectory,
        ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100",
        ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
        ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800",
      },
    })
    t.after(() => session.close().catch(() => {}))
    await session.initialize({ timeoutMs: 10_000,
      initializationOptions: { sdk: { path: fixture.suite.sdk } } })
    for (const name of ["Base.ets", "Derived.ets"]) {
      session.openDocument({ uri: uri(name), version: 1, text: files[name] })
      await diagnostic(session, uri(name))
    }
    const firstPublication = diagnostic(session, uri("DiagnosticA.ets"))
    const secondPublication = diagnostic(session, uri("DiagnosticB.ets"))
    let secondPublished = false
    void secondPublication.then(() => { secondPublished = true }, () => {})
    for (const name of ["DiagnosticA.ets", "DiagnosticB.ets"]) {
      session.openDocument({ uri: uri(name), version: 1, text: files[name] })
    }
    await waitForEvent(logDirectory, "semantic.test.diagnose.hold.start")
    await session.transport.notification("window/logMessage", message => (
      message.params.message.includes(`diagnostics test delay settled ${uri("DiagnosticB.ets")}`)
    ), 10_000)
    assert.equal(readEvents(logDirectory).some(({ event }) => event === "semantic.test.diagnose.hold.end"), false)
    let globalPublished = false
    const implementation = session.request("textDocument/implementation", {
      textDocument: { uri: uri("Base.ets") }, position: { line: 0, character: 15 },
    })
    void implementation.then(() => { globalPublished = true }, () => {})
    const completion = await session.request("textDocument/completion", {
      textDocument: { uri: uri("Derived.ets") }, position: { line: 4, character: 9 },
    })
    assert.equal(completion.error, undefined, JSON.stringify(completion.error))
    assert.equal(globalPublished, true, "priority must not jump the preceding global request")
    assert.equal(secondPublished, true, "a global barrier also preserves the preceding diagnostic order")
    const global = await implementation
    assert.equal(global.error, undefined, JSON.stringify(global.error))
    assert.deepEqual(global.result, [{ uri: uri("Derived.ets"), range: {
      start: { line: 2, character: 6 }, end: { line: 2, character: 18 },
    } }])
    const items = Array.isArray(completion.result) ? completion.result : completion.result.items
    assert.deepEqual(items.map(item => item.label).sort(), ["build", "inheritedRefresh", "inheritedTitle"])
    await Promise.all([firstPublication, secondPublication])
    assert.deepEqual((await session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })

test("an edit invalidates a definition queued behind diagnostics", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-diagnostic-edit-priority-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const workspace = path.join(root, "workspace")
  const logDirectory = path.join(root, "logs")
  fs.mkdirSync(workspace)
  const files = {
    Navigation: "/* 😀 */ export class NavigationTarget {}\n",
    Jump: 'import { NavigationTarget } from "./Navigation"\nexport const jump = new NavigationTarget()\n',
    DiagnosticA: 'const brokenA: number = "wrong"\n',
    DiagnosticB: 'const brokenB: number = "wrong"\n',
  }
  for (const [name, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(workspace, `${name}.ets`), source)
  }
  const uri = (name) => pathToFileURL(path.join(workspace, `${name}.ets`)).href
  const session = new LspSession({
    command: process.execPath,
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot,
    rootUri: pathToFileURL(workspace).href,
    capabilities: { general: { positionEncodings: ["utf-16"] },
      textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: logDirectory,
      ARKTS_REFERENCES_STRATEGY: "legacy",
      ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "100",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_URI_SUFFIX: "/DiagnosticA.ets",
      ARKTS_TEST_WORKER_DIAGNOSE_HOLD_MS: "1800",
    },
  })
  t.after(() => session.close().catch(() => {}))
  await session.initialize({ timeoutMs: 10_000 })

  session.openDocument({ uri: uri("Jump"), version: 1, text: files.Jump })
  const initial = await diagnostic(session, uri("Jump"))
  assert.equal(initial.params.version, 1)
  session.openDocument({ uri: uri("DiagnosticA"), version: 1, text: files.DiagnosticA })
  session.openDocument({ uri: uri("DiagnosticB"), version: 1, text: files.DiagnosticB })
  await waitForEvent(logDirectory, "semantic.test.diagnose.hold.start")
  await session.transport.notification("window/logMessage", (message) => (
    message.params.message.includes(`diagnostics test delay settled ${uri("DiagnosticB")}`)
  ), 10_000)
  assert.equal(readEvents(logDirectory).some(({ event }) =>
    event === "semantic.test.diagnose.hold.end"), false)

  const position = positionAt(files.Jump, files.Jump.lastIndexOf("NavigationTarget") + 1)
  const request = () => session.request("textDocument/definition", {
    textDocument: { uri: uri("Jump") }, position,
  }, { timeoutMs: 20_000 })
  const oldDefinition = request()
  const changedJump = `${files.Jump}const edited: number = "wrong"\n`
  const changedDiagnostics = session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === uri("Jump") && message.params.version === 2, 20_000)
  session.changeDocument({ uri: uri("Jump"), version: 2, text: changedJump })
  const old = await oldDefinition
  if (old.error) {
    assert.equal(old.error.code, -32801, JSON.stringify(old.error))
  } else {
    assert.deepEqual(old.result, [], "the old definition must not publish a stale location")
  }
  const latest = await changedDiagnostics
  assert.equal(latest.params.version, 2)
  assert.ok(latest.params.diagnostics.some(({ message }) => /not assignable/i.test(message)))

  const fresh = await request()
  assert.equal(fresh.error, undefined, JSON.stringify(fresh.error))
  assert.deepEqual(fresh.result, [{
    uri: uri("Navigation"),
    range: rangeAt(files.Navigation, files.Navigation.indexOf("NavigationTarget"), "NavigationTarget"),
  }])
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })
})

function diagnostic(session, uri) {
  return session.transport.notification("textDocument/publishDiagnostics",
    (message) => message.params.uri === uri && message.params.version === 1, 20_000)
}

function readEvents(logDirectory) {
  const logPath = path.join(logDirectory, "server.log")
  return fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).map(JSON.parse)
    : []
}

async function waitForEvent(logDirectory, event, timeoutMs = 10_000, predicate = () => true) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (readEvents(logDirectory).some((entry) => entry.event === event && predicate(entry))) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${event}`)
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1,
    character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeAt(source, offset, text) {
  return { start: positionAt(source, offset), end: positionAt(source, offset + text.length) }
}
