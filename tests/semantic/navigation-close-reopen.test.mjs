import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

test("unchanged close/reopen preserves the returned Program while renewing document authority",
  { timeout: 30_000 }, async t => {
    const f = await start(t)
    const uri = f.uri("Main.ets"), text = f.sources["Main.ets"]
    const define = async () => {
      const response = await f.session.request("textDocument/definition", {
        textDocument: { uri }, position: { line: 1, character: 25 },
      }, { timeoutMs: 10_000 })
      assert.equal(response.error, undefined, JSON.stringify(response))
      assert.deepEqual(response.result, [{ uri: f.uri("Unopened.ets"), range: {
        start: { line: 0, character: 16 }, end: { line: 0, character: 28 },
      } }])
      return f.events().filter(e => e.event === "semantic.definition.complete").at(-1)
    }
    f.session.openDocument({ uri, version: 7, text })
    await f.session.transport.notification("textDocument/publishDiagnostics",
      m => m.params.uri === uri && m.params.version === 7, 10_000)
    const before = await define()
    for (let cycle = 0; cycle < 3; cycle++) {
      close(f)
      f.session.openDocument({ uri, version: 1, text })
      const after = await define()
      t.diagnostic(JSON.stringify({ cycle, before, after }))
      assert.equal(after.programSequence, before.programSequence,
        "same input bytes and roots do not create a new Program when only the document lifecycle changes")
    }
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })

test("closing an unsaved source restores actual disk bytes and unchanged reopen reuses only that current Program",
  { timeout: 30_000 }, async t => {
    const f = await start(t, {}, workspace => fs.writeFileSync(path.join(workspace, "Other.ets"),
      "export function neverQueried(): string { return 'other' }\n"))
    const uri = f.uri("Main.ets"), disk = f.sources["Main.ets"], overlay = disk.replace("./Unopened", "./Other")
    f.session.openDocument({ uri, version: 7, text: overlay })
    const original = await definition(f, "Other.ets")
    close(f)
    const restored = await definition(f, "Unopened.ets")
    assert.notEqual(restored.programSequence, original.programSequence, "different disk authority updates the compiler input")
    f.session.openDocument({ uri, version: 1, text: disk })
    const reopened = await definition(f, "Unopened.ets")
    assert.equal(reopened.programSequence, restored.programSequence)
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), overlay)
    await definition(f, "Unopened.ets") // Unnotified disk bytes cannot replace the still-open overlay.
    close(f)
    await definition(f, "Other.ets")
  })

test("an unchanged reopened query cannot hide an unnotified dependency edit",
  { timeout: 30_000 }, async t => {
    const f = await start(t), uri = f.uri("Main.ets"), text = f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 7, text })
    const before = await definition(f, "Unopened.ets")
    close(f)
    fs.writeFileSync(path.join(f.workspace, "Unopened.ets"), "// actual dependency edit\n" + f.sources["Unopened.ets"])
    f.session.openDocument({ uri, version: 1, text })
    const after = await definition(f, "Unopened.ets", 1)
    assert.notEqual(after.programSequence, before.programSequence)
  })

test("an unchanged reopen still rejects an SDK mutation after the actual compiler lookup and recovers",
  { timeout: 30_000 }, async t => {
    const f = await start(t, {
      NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/navigation-validation-observation.cjs"))}`,
    })
    const uri = f.uri("Main.ets"), text = f.sources["Main.ets"]
    f.session.openDocument({ uri, version: 7, text })
    await definition(f, "Unopened.ets")
    close(f)
    f.session.openDocument({ uri, version: 1, text })
    const input = path.join(f.sdk, "ets/component/common.d.ts")
    fs.writeFileSync(path.join(f.directory, "navigation-mutate-after-lookup.json"), JSON.stringify({
      file: input, text: fs.readFileSync(input, "utf8") + "\ninterface ActuallyChangedSDK {}\n",
    }))
    const stale = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 },
    })
    assert.equal(fs.existsSync(path.join(f.directory, "navigation-mutation-applied.json")), true)
    assert.equal(stale.error?.code, -32803, JSON.stringify(stale))
    assert.equal(stale.result, undefined)
    const sdk = path.join(f.directory, "sdk-next")
    fs.cpSync(f.sdk, sdk, { recursive: true })
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: sdk } } } } })
    await definition(f, "Unopened.ets")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })

test("an unchanged reopen cannot keep a dependency whose parent now points outside the workspace",
  { timeout: 30_000 }, async t => {
    const f = await start(t, {}, workspace => {
      fs.mkdirSync(path.join(workspace, "dep"))
      fs.writeFileSync(path.join(workspace, "dep/Target.ets"), "export function neverQueried(): number { return 1 }\n")
    })
    const uri = f.uri("Main.ets"), text = f.sources["Main.ets"].replace("./Unopened", "./dep/Target")
    fs.writeFileSync(path.join(f.workspace, "Main.ets"), text)
    f.session.openDocument({ uri, version: 7, text: text.replace("./dep/Target", "./MissingTarget") })
    const unresolved = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 },
    })
    assert.equal(unresolved.error, undefined, JSON.stringify(unresolved))
    assert.deepEqual(unresolved.result, [{ uri, range: {
      start: { line: 0, character: 9 }, end: { line: 0, character: 21 },
    } }], "the actual compiler returns the local import binding for an unresolved module")
    f.session.changeDocument({ uri, version: 8, text })
    await definition(f, "dep/Target.ets")
    close(f)
    const source = path.join(f.workspace, "dep"), outside = path.join(f.directory, "external-target")
    fs.renameSync(source, outside)
    fs.symlinkSync(outside, source, process.platform === "win32" ? "junction" : "dir")
    f.session.openDocument({ uri, version: 1, text })
    const rejected = await f.session.request("textDocument/definition", {
      textDocument: { uri }, position: { line: 1, character: 25 },
    })
    assert.equal(rejected.error, undefined, JSON.stringify(rejected))
    assert.deepEqual(rejected.result, unresolved.result,
      "retargeting outside the workspace must match the compiler's unresolved-module control")
    fs.unlinkSync(source)
    fs.renameSync(outside, source)
    f.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeWatchedFiles",
      params: { changes: [{ uri: f.uri("dep/Target.ets"), type: 1 }] } })
    await definition(f, "dep/Target.ets")
    assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 1)
  })

async function start(t, env = {}, setup = () => {}) {
  const f = createReadinessFixture(t, { ARKTS_BENCHMARK_CONTROL: "0", ARKTS_MEMORY_BUDGET_MB: undefined,
    ARKTS_REFERENCES_RESIDENT_FAST_PATH: undefined, ...env })
  setup(f.workspace)
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  const progress = await f.session.transport.serverRequest("window/workDoneProgress/create", () => true, 10_000)
  f.session.transport.send({ jsonrpc: "2.0", id: progress.id, result: null })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
  return f
}

function close(f) {
  const uri = f.uri("Main.ets")
  f.session.transport.send({ jsonrpc: "2.0", method: "textDocument/didClose", params: { textDocument: { uri } } })
  f.session.documentVersions.delete(uri)
}

async function definition(f, target, line = 0) {
  const response = await f.session.request("textDocument/definition", {
    textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 },
  }, { timeoutMs: 10_000 })
  assert.equal(response.error, undefined, JSON.stringify(response))
  assert.deepEqual(response.result, [{ uri: f.uri(target), range: {
    start: { line, character: 16 }, end: { line, character: 28 },
  } }])
  return f.events().filter(e => e.event === "semantic.definition.complete").at(-1)
}
