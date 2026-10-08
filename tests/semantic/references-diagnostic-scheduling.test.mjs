import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

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

async function waitForEvent(logDirectory, event, timeoutMs = 10_000) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (readEvents(logDirectory).some((entry) => entry.event === event)) return
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
