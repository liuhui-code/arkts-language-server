import { buildSync } from "esbuild"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { LspSession } from "./support/lsp-session.mjs"
import { projectRoot } from "./support/lsp-process.mjs"
import { nativeWireAuditOptions, readNativeWireAudit } from "./support/native-wire-audit-options.mjs"

test("production framed LSP negotiates file maintenance and writes only the edited file", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-lsp-versioned-"))
  const evidence = process.env.ARKTS_TEST_EVIDENCE_DIR
  let session
  t.after(async () => {
    if (session) {
      await session.close().catch(() => {})
      fs.writeFileSync(path.join(root, "lsp-transcript.json"), JSON.stringify(session.transport.transcriptEntries))
      fs.writeFileSync(path.join(root, "lsp-stderr.txt"),
        Buffer.concat([session.transport.stderrHead, session.transport.stderrTail]))
    }
    if (evidence) {
      fs.mkdirSync(evidence, { recursive: true })
      for (const file of ["wire.jsonl", "lsp-transcript.json", "lsp-stderr.txt"]) {
        const source = path.join(root, file)
        if (fs.existsSync(source)) fs.copyFileSync(source, path.join(evidence, file))
      }
    }
    fs.rmSync(root, { recursive: true, force: true })
  })
  const workspace = path.join(root, "workspace")
  fs.mkdirSync(workspace)
  for (let index = 0; index < 128; index++) {
    fs.writeFileSync(path.join(workspace, `${String(index).padStart(4, "0")}.ets`),
      `export class HashFirst${index} {}\n`)
  }
  const audit = path.join(root, "wire.jsonl")
  session = new LspSession({
    args: [path.join(projectRoot, "dist/server.cjs"), "--stdio"],
    rootUri: pathToFileURL(workspace).href,
    capabilities: { window: { workDoneProgress: true } },
    env: {
      ...nativeWireAuditOptions(audit),
      ARKTS_INDEX_CACHE_DIR: path.join(root, "cache"),
      ARKTS_LSP_LOG_DIR: path.join(root, "logs"),
      ARKLINE_HARMONY_SDK_PATH: path.join(root, "missing-sdk"),
      DEVECO_SDK_HOME: path.join(root, "missing-deveco"),
    },
  })
  const frames = () => readNativeWireAudit(audit)
  const initialization = await session.initialize({ timeoutMs: 10_000 })
  assert.equal(initialization.result.capabilities.textDocumentSync.save, true)
  const create = await session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  let lastReport
  for (;;) {
    const message = await session.transport.progress(create.params.token, () => true, 30_000)
    if (message.params.value.kind === "end") {
      assert.match(lastReport?.message, /Indexed 128\/128 files/)
      break
    }
    if (message.params.value.kind === "report") lastReport = message.params.value
  }
  const unchanged = await session.request("workspace/symbol", { query: "HashFirst127" })
  assert.equal(unchanged.error, undefined)
  assert.equal(unchanged.result.length, 1)
  const cold = frames()
  const start = cold.find(entry => entry.kind === "request" && entry.frame.method === "maintenance/start")
  assert.ok(start, "default production LSP must negotiate maintenance rather than legacy full catalog")
  assert.ok(cold.some(entry => entry.frame?.event === "maintenance/terminal"
    && entry.frame.outcome === "qualified"), "cold catalog must have a complete qualification")
  const changed = path.join(workspace, "0000.ets")
  fs.writeFileSync(changed, "export class ChangedFile {}\n")
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
    params: { changes: [{ uri: pathToFileURL(changed).href, type: 2 }] } })
  const deadline = Date.now() + 30_000
  let completed
  while (Date.now() < deadline) {
    completed = frames().slice(cold.length).find(entry => entry.frame?.event === "maintenance/terminal"
      && entry.frame.outcome === "qualified")?.frame
    if (completed) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.ok(completed, "edited input must regain complete qualification")
  const changedFrames = frames().slice(cold.length)
  const delivered = changedFrames.find(entry => entry.kind === "request" && entry.frame.method === "maintenance/changes")?.frame
  assert.ok(delivered, "watched source URI must reach Native maintenance instead of becoming only a catalog request")
  const initialized = cold.find(entry => entry.kind === "response" && entry.frame.result?.workspaceIdentity)?.frame.result
  const canonicalChanged = `${initialized.workspaceIdentity}/0000.ets`
  assert.deepEqual(delivered.params.changes, [{ uri: canonicalChanged, kind: "changed" }])
  assert.deepEqual(delivered.params.uncertainty, [])
  assert.deepEqual(completed.input, delivered.params.input)
  const point = changedFrames.find(entry => entry.frame?.event === "maintenance/terminal"
    && entry.frame.scope === "file" && entry.frame.uri === canonicalChanged)?.frame
  assert.ok(point, "precise source maintenance must finish before its successor full qualification")
  assert.equal(point.outcome, "data-updated")
  assert.equal(point.writtenDocuments, 1)
  assert.equal(completed.writtenDocuments, 0, "the successor qualification must not write the already updated source again")
  assert.equal((await session.request("workspace/symbol", { query: "ChangedFile" })).result.length, 1)
  assert.equal((await session.request("workspace/symbol", { query: "HashFirst0" })).result.length, 0)
  assert.equal((await session.request("workspace/symbol", { query: "HashFirst127" })).result.length, 1)

  async function nextQualification(changes, action, reason = []) {
    const before = frames().length
    action()
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
    return finishQualification(before, reason)
  }
  async function finishQualification(before, reason) {
    const until = Date.now() + 30_000
    let terminal
    while (Date.now() < until) {
      terminal = frames().slice(before).find(entry => entry.frame?.event === "maintenance/terminal"
        && entry.frame.outcome === "qualified" && entry.frame.currentInput)?.frame
      if (terminal) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.ok(terminal, `qualification missing for ${JSON.stringify(reason)}`)
    const observed = frames().slice(before)
    const change = observed.find(entry => entry.kind === "request" && entry.frame.method === "maintenance/changes")?.frame
    assert.ok(change, "the actual input must be delivered")
    assert.deepEqual(change.params.uncertainty, reason)
    assert.deepEqual(terminal.input, change.params.input)
    return { terminal, observed, change }
  }

  const duplicate = await nextQualification([{ uri: pathToFileURL(changed).href, type: 2 }], () => {})
  const noChange = duplicate.observed.find(entry => entry.frame?.scope === "file"
    && entry.frame.event === "maintenance/terminal")?.frame
  assert.equal(noChange?.outcome, "unchanged")
  assert.equal(noChange.writtenDocuments, 0)
  assert.equal(duplicate.terminal.writtenDocuments, 0)
  assert.equal(duplicate.terminal.qualification.head, completed.qualification.head)

  const savedUri = pathToFileURL(changed).href
  session.openDocument({ uri: savedUri, version: 1, text: "export class ChangedFile {}\n" })
  session.changeDocument({ uri: savedUri, version: 2, text: "export class SavedIndexTarget {}\n" })
  const beforeOverlay = frames().length
  assert.equal((await session.request("workspace/symbol", { query: "SavedIndexTarget" })).result.length, 1)
  assert.equal(frames().slice(beforeOverlay).filter(entry => entry.kind === "request"
    && entry.frame.method === "maintenance/changes").length, 0, "an unsaved overlay must not mutate disk facts")
  const beforeSave = frames().length
  fs.writeFileSync(changed, "export class SavedIndexTarget {}\n")
  session.transport.send({ jsonrpc: "2.0", method: "textDocument/didSave",
    params: { textDocument: { uri: savedUri }, text: "export class ForgedSavePayload {}\n" } })
  const saved = await finishQualification(beforeSave, [])
  assert.equal(saved.change.params.changes.length, 1)
  assert.equal(saved.terminal.writtenDocuments, 0)
  assert.equal(saved.observed.find(entry => entry.frame?.scope === "file"
    && entry.frame.event === "maintenance/terminal")?.frame.writtenDocuments, 1)
  session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri: savedUri } } })
  assert.equal((await session.request("workspace/symbol", { query: "SavedIndexTarget" })).result.length, 1)
  assert.equal((await session.request("workspace/symbol", { query: "ForgedSavePayload" })).result.length, 0)
  const watchAfterSave = await nextQualification([{ uri: savedUri, type: 2 }], () => {})
  assert.equal(watchAfterSave.terminal.writtenDocuments, 0)
  assert.equal(watchAfterSave.terminal.qualification.head, saved.terminal.qualification.head)
  assert.equal(watchAfterSave.observed.find(entry => entry.frame?.scope === "file"
    && entry.frame.event === "maintenance/terminal")?.frame.writtenDocuments, 0)

  const directory = path.join(workspace, "new-module")
  const created = path.join(directory, "MixedCase.ets")
  const createdUri = pathToFileURL(created).href
  const added = await nextQualification([{ uri: createdUri, type: 1 }], () => {
    fs.mkdirSync(directory)
    fs.writeFileSync(created, "export class CreatedForInput {}\n")
  }, ["namespace"])
  assert.deepEqual(added.change.params.changes,
    [{ uri: `${initialized.workspaceIdentity}/new-module/MixedCase.ets`, kind: "created" }])
  assert.equal(added.terminal.indexedDocuments, 129)
  assert.equal(added.terminal.writtenDocuments, 1)
  const addedSearch = await session.request("workspace/symbol", { query: "CreatedForInput" })
  assert.equal(addedSearch.result.length, 1)
  assert.equal(addedSearch.result[0].location.uri, createdUri)

  const moved = path.join(directory, "Moved.ets")
  const movedUri = pathToFileURL(moved).href
  const movedResult = await nextQualification([{ uri: createdUri, type: 3 }, { uri: movedUri, type: 1 }],
    () => fs.renameSync(created, moved), ["namespace"])
  assert.deepEqual(movedResult.change.params.changes.map(change => change.kind), ["removed", "created"])
  assert.equal(movedResult.terminal.indexedDocuments, 129)
  const movedSearch = await session.request("workspace/symbol", { query: "CreatedForInput" })
  assert.equal(movedSearch.result.length, 1)
  assert.equal(movedSearch.result[0].location.uri, movedUri)

  const removed = await nextQualification([{ uri: movedUri, type: 3 }], () => {
    fs.unlinkSync(moved)
    fs.rmdirSync(directory)
  }, ["namespace"])
  assert.equal(removed.terminal.indexedDocuments, 128)
  assert.equal((await session.request("workspace/symbol", { query: "CreatedForInput" })).result.length, 0)
  const restored = await nextQualification([{ uri: createdUri, type: 1 }], () => {
    fs.mkdirSync(directory)
    fs.writeFileSync(created, "export class CreatedForInput {}\n")
  }, ["namespace"])
  assert.equal(restored.terminal.indexedDocuments, 129)
  assert.equal((await session.request("workspace/symbol", { query: "CreatedForInput" })).result[0].location.uri, createdUri)

  const ignore = path.join(workspace, ".gitignore")
  const ignoredUri = pathToFileURL(path.join(workspace, "0001.ets")).href
  const ignored = await nextQualification([{ uri: pathToFileURL(ignore).href, type: 1 }],
    () => fs.writeFileSync(ignore, "0001.ets\n"), ["configuration"])
  assert.equal(ignored.change.params.changes.length, 0)
  assert.equal(ignored.terminal.indexedDocuments, 128)
  assert.equal(ignored.terminal.writtenDocuments, 0)
  assert.ok(!(await session.request("workspace/symbol", { query: "HashFirst1" })).result
    .some(symbol => symbol.location.uri === ignoredUri))
  const unignored = await nextQualification([{ uri: pathToFileURL(ignore).href, type: 3 }],
    () => fs.unlinkSync(ignore), ["configuration", "namespace"])
  assert.equal(unignored.terminal.indexedDocuments, 129)
  assert.ok(unignored.terminal.writtenDocuments <= 1, "only the restored member may need facts")
  assert.ok((await session.request("workspace/symbol", { query: "HashFirst1" })).result
    .some(symbol => symbol.location.uri === ignoredUri))

  const exclude = path.join(workspace, ".git/info/exclude")
  const excluded = await nextQualification([{ uri: pathToFileURL(exclude).href, type: 1 }], () => {
    fs.mkdirSync(path.dirname(exclude), { recursive: true })
    fs.writeFileSync(exclude, "0002.ets\n")
  }, ["configuration"])
  assert.equal(excluded.terminal.indexedDocuments, 128)
  assert.equal(excluded.terminal.writtenDocuments, 0)
  const restoredExclusion = await nextQualification([{ uri: pathToFileURL(exclude).href, type: 3 }],
    () => fs.unlinkSync(exclude), ["configuration", "namespace"])
  assert.equal(restoredExclusion.terminal.indexedDocuments, 129)
  assert.ok(restoredExclusion.terminal.writtenDocuments <= 1)

  const beforeConfig = frames().length
  session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
    params: { settings: { arkts: { sdk: { path: path.join(root, "missing-sdk") } } } } })
  const configured = await finishQualification(beforeConfig, ["configuration"])
  assert.deepEqual(configured.change.params.changes, [])
  assert.equal(configured.terminal.writtenDocuments, 0)
  assert.equal(configured.terminal.qualification.head, restoredExclusion.terminal.qualification.head)

  const opaqueDirectory = path.join(workspace, "late.module")
  const opaqueUri = pathToFileURL(opaqueDirectory).href
  const namespaceAdded = await nextQualification([{ uri: opaqueUri, type: 1 }], () => {
    fs.mkdirSync(opaqueDirectory)
    fs.writeFileSync(path.join(opaqueDirectory, "Missed.ets"), "export class DirectoryInputTarget {}\n")
  }, ["namespace"])
  assert.deepEqual(namespaceAdded.change.params.changes, [], "an uncertain directory is never a guessed source URI")
  assert.equal(namespaceAdded.terminal.indexedDocuments, 130)
  assert.equal(namespaceAdded.terminal.writtenDocuments, 1)
  assert.equal((await session.request("workspace/symbol", { query: "DirectoryInputTarget" })).result.length, 1)
  const namespaceRemoved = await nextQualification([{ uri: opaqueUri, type: 3 }],
    () => fs.rmSync(opaqueDirectory, { recursive: true }), ["namespace"])
  assert.equal(namespaceRemoved.terminal.indexedDocuments, 129)
  assert.equal(namespaceRemoved.terminal.writtenDocuments, 0)
  assert.equal((await session.request("workspace/symbol", { query: "DirectoryInputTarget" })).result.length, 0)

})


test("resource-only disk inputs preserve semantic delivery without queuing a source catalog", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-index-routing-"))
  const workspace = path.join(directory, "workspace")
  const audit = path.join(directory, "inputs.jsonl")
  fs.mkdirSync(workspace)
  const source = path.join(workspace, "Main.ets")
  const resource = path.join(workspace, "resources/base/element/string.json")
  const config = path.join(workspace, "build-profile.json5")
  fs.writeFileSync(source, "export class Routed {}\n")
  fs.mkdirSync(path.dirname(resource), { recursive: true })
  fs.writeFileSync(resource, '{"string":[]}')
  fs.writeFileSync(config, "{}")
  fs.writeFileSync(audit, "")
  const server = path.join(directory, "routing.cjs")
  buildSync({ entryPoints: [path.join(projectRoot, "tests/fixtures/lsp/index-input-routing-server.ts")],
    outfile: server, bundle: true, platform: "node", format: "cjs" })
  const rootUri = pathToFileURL(workspace).href
  const session = new LspSession({ rootUri, cwd: workspace, args: [server, "--stdio"],
    capabilities: { window: { workDoneProgress: true } },
    env: { ARKTS_INPUT_ROUTING_AUDIT: audit, ARKTS_LSP_LOG_DIR: path.join(directory, "logs") } })
  t.after(async () => {
    try { await session.close() } finally { fs.rmSync(directory, { recursive: true, force: true }) }
  })
  await session.initialize()
  const create = await session.transport.serverRequest("window/workDoneProgress/create")
  session.transport.send({ jsonrpc: "2.0", id: create.id, result: null })
  await session.transport.progress(create.params.token, m => m.params.value.kind === "end")
  const records = () => fs.readFileSync(audit, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
  const event = file => ({ uri: pathToFileURL(file).href, type: 2 })
  for (const [name, changes, catalog, resourceChanged] of [
    ["resource", [event(resource)], false, true],
    ["source", [event(source)], true, false],
    ["mixed", [event(source), event(resource)], true, true],
    ["configuration", [event(config)], true, false],
    ["index-rules", [event(path.join(workspace, ".gitignore"))], true, false],
    ["mixed-rules", [event(path.join(workspace, ".gitignore")), event(source)], true, false],
    ["outside-index-rules", [event(path.join(directory, ".gitignore"))], false, false],
  ]) {
    const before = records().length
    session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles", params: { changes } })
    const barrier = await session.request("workspace/symbol", { query: "ordered-notification-barrier" })
    assert.equal(barrier.error, undefined)
    const observed = records().slice(before)
    if (name === "outside-index-rules") { assert.deepEqual(observed, []); continue }
    if (name === "index-rules") {
      assert.equal(observed.filter(row => row.kind === "semantic").length, 1)
      const batch = observed.find(row => row.kind === "observe").data[0]
      assert.equal(batch.catalogRulesChanged, true)
      assert.equal(batch.configurationChanged, undefined)
      assert.equal(batch.rootDirty, false)
      assert.deepEqual(batch.changes, [{ uri: changes[0].uri, kind: "changed" }])
      assert.deepEqual(observed.filter(row => row.kind === "catalog").flatMap(row => row.data), [rootUri])
      continue
    }
    assert.deepEqual(observed.slice(0, 2).map(row => row.kind), ["observe", "semantic"], name)
    const batches = observed.find(row => row.kind === "semantic").data
    assert.equal(batches.length, 1, name)
    assert.equal(batches[0].resourceChanged === true, resourceChanged, name)
    assert.equal(batches[0].rootDirty, name === "configuration", name)
    assert.deepEqual(observed.filter(row => row.kind === "catalog").flatMap(row => row.data),
      catalog ? [rootUri] : [], name)
  }
})
