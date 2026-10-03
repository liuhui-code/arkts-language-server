import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

import { LspSession } from "../support/lsp-session.mjs"
import { projectRoot } from "../support/lsp-process.mjs"

for (const sessionReuse of ["off", "experimental"]) {
  test("session reuse " + sessionReuse + ": a consumed disk delta cannot certify the other root alias",
    async t => replay(t, sessionReuse))
}

async function replay(t, sessionReuse) {
  const fixture = await openFixture(t, sessionReuse)
  const { session, roots, targetPath, otherPath } = fixture
  const first = { uri: uri(roots[0], "First.ets"), version: 1,
    text: "export const first = new TargetType()\n" }
  const second = { uri: uri(roots[1], "Second.ets"), version: 1,
    text: "export const second = new TargetType()\n" }
  const originalTarget = "const face = '😀'\nclass TargetType {}\n"
  const targetUris = roots.map(root => uri(root, "Target.ets"))

  const firstSequence = await warm(first)
  const secondSequence = await warm(second)
  assert.notEqual(firstSequence, secondSequence, "the lexical roots must own distinct LS contexts")

  // An unimported global is loaded by completion, not by the later request's
  // dependency closure. Reloading an imported dependency cannot hide a lost delta.
  const replacementTarget = "// watched comment 😀\n"
    + originalTarget.replace("TargetType", "ReplacementType")
  fs.writeFileSync(targetPath, replacementTarget)
  const firstFence = fixture.events().length
  watched(targetUris[0])
  const refreshed = await complete(first)
  assert.ok(refreshed.items.some(item => item.label === "ReplacementType"))
  assert.equal(refreshed.items.some(item => item.label === "TargetType"), false)
  const firstEvents = fixture.events().slice(firstFence)
  const activeFirstSequence = lastReuse(firstEvents)
  if (sessionReuse === "experimental") {
    assert.equal(activeFirstSequence, firstSequence, "the complete first delta must keep the first LS")
    assert.equal(firstEvents.some(event => event.event === "semantic.context.evict"), false)
  } else {
    assert.notEqual(activeFirstSequence, firstSequence, "the off baseline must reconstruct the first LS")
    assert.ok(firstEvents.some(event => event.event === "semantic.context.evict"
      && event.contextSequence === firstSequence && event.reason === "content-revision-change"
      && event.leaseCount === 0))
    assert.ok(firstEvents.some(event => event.event === "semantic.context.create"
      && event.contextSequence === activeFirstSequence))
  }

  // Give the second alias a newer pending delta as well: the existence of a
  // nonempty latest batch must not certify delivery of the already consumed one.
  fs.writeFileSync(otherPath, "const unrelated = 2\n")
  const secondFence = fixture.events().length
  watched(uri(roots[0], "Other.ets"))
  second.text = "// second alias still uses the removed name 😀\n" + second.text
  second.version += 1
  session.changeDocument(second)
  assert.deepEqual(await define(second, "TargetType"), [])
  const missing = await diagnostic(second)
  assert.deepEqual(missing.params.diagnostics.map(value => ({ code: value.code, range: value.range })), [
    { code: 2304, range: rangeOf(second.text, "TargetType") },
  ])
  const secondEvents = fixture.events().slice(secondFence)
  assert.ok(secondEvents.some(event => event.event === "semantic.context.evict"
    && event.contextSequence === secondSequence && event.reason === "content-revision-change"
    && event.leaseCount === 0))
  const replacementSequence = lastReuse(secondEvents)
  assert.notEqual(replacementSequence, secondSequence, "the stale second LS must be reconstructed")
  assert.ok(secondEvents.some(event => event.event === "semantic.context.create"
    && event.contextSequence === replacementSequence))

  // A fresh complete inventory restores the replacement global. Its location
  // and the normal next-version diagnostic publication must both be current.
  const inventory = await complete(second)
  assert.ok(inventory.items.some(item => item.label === "ReplacementType"))
  assert.equal(inventory.items.some(item => item.label === "TargetType"), false)
  second.text = second.text.replace("TargetType", "ReplacementType")
  second.version += 1
  session.changeDocument(second)
  assertTarget(await define(second, "ReplacementType"), replacementTarget, "ReplacementType")
  assert.deepEqual((await diagnostic(second)).params.diagnostics, [])
  const closed = await session.close({ timeoutMs: 5_000 })
  assert.deepEqual(closed.exit, { code: 0, signal: null })

  async function warm(document) {
    const before = fixture.events().length
    session.openDocument(document)
    const completed = await complete(document)
    assert.ok(completed.items.some(item => item.label === "TargetType"))
    assertTarget(await define(document, "TargetType"), originalTarget, "TargetType")
    document.text = "// warmed alias 😀\n" + document.text
    document.version += 1
    session.changeDocument(document)
    assert.deepEqual((await diagnostic(document)).params.diagnostics, [])
    const events = fixture.events().slice(before)
    const sequence = lastReuse(events)
    assert.ok(events.some(event => event.event === "semantic.context.create"
      && event.contextSequence === sequence))
    return sequence
  }

  async function complete(document) {
    const response = await session.request("textDocument/completion", {
      textDocument: { uri: document.uri },
      position: positionAt(document.text, document.text.indexOf("TargetType")),
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return Array.isArray(response.result) ? { items: response.result } : response.result
  }

  async function define(document, name) {
    const response = await session.request("textDocument/definition", {
      textDocument: { uri: document.uri },
      position: positionAt(document.text, document.text.lastIndexOf(name) + 1),
    }, { timeoutMs: 20_000 })
    assert.equal(response.error, undefined, JSON.stringify(response.error))
    return response.result ?? []
  }

  function watched(targetUri) {
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: targetUri, type: 2 }] } })
  }

  function diagnostic(document) {
    return session.transport.notification("textDocument/publishDiagnostics",
      message => message.params.uri === document.uri && message.params.version === document.version, 20_000)
  }

  function assertTarget(locations, source, name) {
    assert.equal(locations.length, 1, JSON.stringify(locations))
    assert.ok(targetUris.includes(locations[0].uri), JSON.stringify(locations[0]))
    assert.equal(fs.realpathSync(fileURLToPath(locations[0].uri)), fs.realpathSync(targetPath))
    assert.deepEqual(locations[0].range, rangeOf(source, name))
  }
}

async function openFixture(t, sessionReuse) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-session-reuse-alias-"))
  const physicalRoot = path.join(directory, "physical")
  const roots = ["first", "second"].map(name => path.join(directory, name))
  fs.mkdirSync(physicalRoot)
  for (const root of roots) fs.symlinkSync(physicalRoot, root, "dir")
  fs.writeFileSync(path.join(physicalRoot, "First.ets"), "export const first = new TargetType()\n")
  fs.writeFileSync(path.join(physicalRoot, "Second.ets"), "export const second = new TargetType()\n")
  const targetPath = path.join(physicalRoot, "Target.ets")
  const otherPath = path.join(physicalRoot, "Other.ets")
  fs.writeFileSync(targetPath, "const face = '😀'\nclass TargetType {}\n")
  fs.writeFileSync(otherPath, "const unrelated = 1\n")
  const sdk = path.join(directory, "sdk")
  fs.mkdirSync(path.join(sdk, "ets", "component"), { recursive: true })
  fs.mkdirSync(path.join(sdk, "toolchains"))
  fs.writeFileSync(path.join(sdk, "ets", "component", "common.d.ts"), "interface FixtureAmbient {}\n")
  const logs = path.join(directory, "logs")
  const session = new LspSession({
    command: process.execPath, args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    cwd: projectRoot, rootUri: pathToFileURL(roots[0]).href,
    capabilities: { textDocument: { publishDiagnostics: { versionSupport: true } } },
    env: {
      ARKLINE_HARMONY_SDK_PATH: sdk, DEVECO_SDK_HOME: sdk,
      ARKTS_INDEX_CACHE_DIR: path.join(directory, "cache"), ARKTS_LSP_LOG_DIR: logs,
      ARKTS_REFERENCES_TRACE: "1", ARKTS_REFERENCES_STRATEGY: "indexed-batched",
      ARKTS_REFERENCES_CONTEXT_RETENTION: "dispose", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "0",
      ARKTS_REFERENCES_ANCHOR_REUSE: "0", ARKTS_SEMANTIC_SESSION_REUSE: sessionReuse,
      ARKTS_AUTO_IMPORT_PROJECT_ROOT_PROFILE: "workspace",
    },
  })
  t.after(async () => {
    await session.close().catch(() => {})
    fs.rmSync(directory, { recursive: true, force: true })
  })
  // LspSession's convenience initializer accepts only one root. Use the
  // existing real-transcript convention to initialize both lexical roots.
  const initializeId = session.nextRequestId++
  session.transport.send({ jsonrpc: "2.0", id: initializeId, method: "initialize", params: {
    processId: process.pid, rootUri: session.rootUri, capabilities: session.capabilities,
    workspaceFolders: roots.map(root => ({ name: path.basename(root), uri: pathToFileURL(root).href })),
    initializationOptions: { sdk: { path: sdk } },
  } })
  const initialized = await session.transport.response(initializeId, 10_000)
  assert.equal(initialized.error, undefined, JSON.stringify(initialized.error))
  session.initialized = true
  session.transport.send({ jsonrpc: "2.0", method: "initialized", params: {} })
  return {
    session, roots, targetPath, otherPath,
    events() {
      const logPath = path.join(logs, "server.log")
      if (!fs.existsSync(logPath)) return []
      return fs.readFileSync(logPath, "utf8").split("\n")
        .filter(Boolean).map(line => JSON.parse(line))
    },
  }
}

function lastReuse(events) {
  const sequence = events.filter(event => event.event === "semantic.context.reuse").at(-1)?.contextSequence
  assert.ok(Number.isSafeInteger(sequence), "the public lifecycle trace must identify the active LS")
  return sequence
}

function uri(root, file) {
  return pathToFileURL(path.join(root, file)).href
}

function positionAt(source, offset) {
  const prefix = source.slice(0, offset)
  return { line: prefix.split("\n").length - 1, character: offset - prefix.lastIndexOf("\n") - 1 }
}

function rangeOf(source, name) {
  const start = source.indexOf(name)
  return { start: positionAt(source, start), end: positionAt(source, start + name.length) }
}
