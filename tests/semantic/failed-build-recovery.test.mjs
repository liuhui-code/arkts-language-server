import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { createReadinessFixture } from "../support/semantic-readiness-lsp.mjs"

function fixture(t, stage = "snapshot", remaining = 1, env = {}) {
  const value = createReadinessFixture(t, {
    ARKTS_MEMORY_BUDGET_MB: "4096", ARKTS_BENCHMARK_CONTROL: "0", ARKTS_REFERENCES_RESIDENT_FAST_PATH: "1",
    NODE_OPTIONS: `--require=${JSON.stringify(path.resolve("tests/fixtures/failed-semantic-build.cjs"))}`,
    ...env,
  })
  fs.writeFileSync(path.join(value.workspace, "Spare.ets"), "export const spare = 1\n")
  const setFault = (stage, remaining = 1) => fs.writeFileSync(path.join(value.directory, "build-fault.json"),
    JSON.stringify({ stage, remaining }))
  setFault(stage, remaining)
  return { ...value, setFault,
    state: () => JSON.parse(fs.readFileSync(path.join(value.directory, "build-state.json"), "utf8")),
    readiness: prepare => value.session.request("arkts/semanticReadiness", { rootUri: value.rootUri, prepare }),
    configure: () => value.session.transport.send({ jsonrpc: "2.0", method: "workspace/didChangeConfiguration",
      params: { settings: { arkts: { sdk: { path: value.sdk } } } } }),
  }
}

test("a failed cold Program retries unchanged inputs and releases every failed-owner lease", { timeout: 30_000 }, async t => {
  const f = fixture(t)
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } }, timeoutMs: 10_000 })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10_000)
  assert.equal(f.state().attempts, 1)
  const status = await f.readiness(false)
  assert.notEqual(status.result.semanticState, "ready")
  const retried = await f.readiness(true)
  assert.equal(retried.result?.semanticState, "ready", JSON.stringify(retried))
  assert.equal(f.state().attempts, 2, "a new attempt needs no fabricated edit/configuration event")
  f.configure()
  await f.readiness(false)
  assert.equal(f.state().projectRefs, 0, "retired success and failed builds both balance their leases")
  assert.ok(f.state().sdkRefs > 0, "SDK cache ownership survives retiring the LS")
  assert.equal((await f.readiness(true)).result.semanticState, "ready")
  assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

async function waitEvent(f, name, count = 1) {
  const deadline = Date.now() + 10_000
  while (f.events().filter(e => e.event === name).length < count) {
    if (Date.now() > deadline) throw Error(`missing ${name} ${count}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

test("fatal recovery cannot renew a completed root's initial pressure exemption", { timeout: 30_000 }, async t => {
  const f = fixture(t, null, 0, { ARKTS_MEMORY_BUDGET_MB: "1" })
  await initializeReady(f)
  f.setFault("exit-idle")
  await waitEvent(f, "semantic.worker.recovery.complete")
  const response = await f.readiness(true)
  assert.equal(response.result?.semanticState, "degraded", JSON.stringify(response))
  assert.deepEqual(response.result.unavailableReasons, ["resource-budget-exceeded"])
})

for (const stage of ["before", "snapshot", "after", "checker", "observe"]) {
  test(`three ${stage} failures recover without edits and leave no failed-owner leases`, { timeout: 30_000 }, async t => {
    const f = fixture(t, stage, 3)
    await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
    await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10_000)
    for (let i = 0; i < 2; i++) assert.equal((await f.readiness(true)).error?.code, -32803)
    assert.equal(f.state().attempts, 3)
    assert.equal(f.state().projectRefs, 0, "every interrupted build cleans its own partial acquisitions")
    assert.equal((await f.readiness(true)).result.semanticState, "ready")
    f.configure(); await f.readiness(false)
    assert.equal(f.state().projectRefs, 0)
    assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
  })
}

test("closing a session after a partial build releases resources without any successful retry", { timeout: 30_000 }, async t => {
  const f = fixture(t)
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10_000)
  assert.equal(f.state().projectRefs, 0)
  assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

test("a failed hot Program update can retry the same overlay version", { timeout: 30_000 }, async t => {
  const f = fixture(t, null, 0)
  await initializeReady(f)
  const text = "// changed overlay\n" + f.sources["Main.ets"]
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text })
  f.setFault("snapshot")
  assert.equal((await f.readiness(true)).error?.code, -32803)
  assert.equal(f.state().projectRefs, 0)
  assert.equal((await f.readiness(true)).result.semanticState, "ready")
  const definition = await f.session.request("textDocument/definition", {
    textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 23 } })
  assert.equal(definition.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(definition))
})

test("a group failure preserves the other active owner sharing its SDK Registry", { timeout: 30_000 }, async t => {
  const f = fixture(t, "snapshot")
  const modules = ["Alpha", "Beta"]
  fs.writeFileSync(path.join(f.workspace, "build-profile.json5"), JSON.stringify({
    app: { products: [{ name: "default" }] }, modules: modules.map(name => ({ name, srcPath: `./${name}`,
      targets: [{ name: "default", applyToProducts: ["default"] }] })) }))
  for (const name of modules) {
    const directory = path.join(f.workspace, name)
    fs.mkdirSync(path.join(directory, "src/main/ets"), { recursive: true })
    fs.writeFileSync(path.join(directory, "build-profile.json5"), "{targets:[{name:'default'}]}")
    const file = name === "Alpha" ? "Healthy.ets" : "Spare.ets"
    fs.writeFileSync(path.join(directory, "oh-package.json5"), JSON.stringify({ name,
      main: `./src/main/ets/${file}`, dependencies: {} }))
    fs.writeFileSync(path.join(directory, "src/main/ets", file), "export const chosen = 1\n")
  }
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10_000)
  assert.equal(f.state().projectRefs, 1, "the healthy Alpha owner remains leased")
  const before = f.state().attempts
  assert.equal((await f.readiness(true)).result.semanticState, "ready")
  assert.equal(f.state().attempts, before + 2, "retry Beta and complete root, without rebuilding Alpha")
  f.configure(); await f.readiness(false)
  assert.equal(f.state().projectRefs, 0)
})

test("repeated fatal exits stop after three restarts in the recovery window", { timeout: 30_000 }, async t => {
  const f = fixture(t, null, 0)
  await initializeReady(f)
  for (let i = 1; i <= 3; i++) {
    f.setFault("exit-idle")
    await waitEvent(f, "semantic.worker.recovery.complete", i)
    assert.equal((await f.readiness(true)).result.semanticState, "ready")
  }
  f.setFault("exit-idle")
  await waitEvent(f, "semantic.worker.recovery.stopped")
  for (let i = 0; i < 2; i++) assert.equal((await f.readiness(true)).error?.code, -32803)
  assert.equal(f.events().filter(e => e.event === "semantic.worker.started").length, 4)
  assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

test("shutdown during fatal recovery finishes without leaving a replacement Worker", { timeout: 30_000 }, async t => {
  const f = fixture(t, null, 0)
  await initializeReady(f)
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  await f.readiness(true)
  fs.writeFileSync(path.join(f.directory, "hold-startup"), "hold")
  f.setFault("exit-idle")
  const deadline = Date.now() + 5_000
  while (!fs.existsSync(path.join(f.directory, "startup-entered"))) {
    if (Date.now() > deadline) throw Error("replacement did not enter startup")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

async function initializeReady(f) {
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  const terminal = await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "complete", 10_000)
  assert.equal(terminal.params.report.semanticState, "ready")
}

async function cancelEntered(f, method, params) {
  fs.rmSync(path.join(f.directory, "build-entered.json"), { force: true })
  const id = f.session.nextRequestId++
  f.session.transport.send({ jsonrpc: "2.0", id, method, params })
  const deadline = Date.now() + 5_000
  while (!fs.existsSync(path.join(f.directory, "build-entered.json"))) {
    if (Date.now() > deadline) throw Error("compiler stage not reached")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  f.session.transport.send({ jsonrpc: "2.0", method: "$/cancelRequest", params: { id } })
  const response = await f.session.transport.response(id, 10_000)
  assert.equal(response.error?.code, -32800, JSON.stringify(response))
  return id
}

test("real in-build cancellation retains a completed Program until normal owner retirement", { timeout: 30_000 }, async t => {
  const f = fixture(t, null, 0)
  await initializeReady(f)
  for (let i = 0; i < 3; i++) {
    f.configure(); await f.readiness(false)
    const before = f.state()
    f.setFault("pause")
    const id = await cancelEntered(f, "arkts/semanticReadiness", { rootUri: f.rootUri, prepare: true })
    t.diagnostic(JSON.stringify({ afterCancel: f.state() }))
    assert.equal(f.state().completed, before.completed + 1)
    assert.ok(f.state().projectRefs > 0, "the successfully committed Program owns these leases")
    const attempts = f.state().attempts
    assert.equal((await f.readiness(true)).result.semanticState, "ready")
    assert.equal(f.state().attempts, attempts, "same-version preparation must not rebuild")
    assert.equal(f.session.transport.transcriptEntries.filter(({ entry }) =>
      entry.direction === "receive" && entry.id === id && entry.method === null).length, 1)
  }
  f.configure(); await f.readiness(false)
  assert.equal(f.state().projectRefs, 0)
})

test("a fatal Worker exit permits same-session recovery with the latest unsaved input", { timeout: 30_000 }, async t => {
  const f = fixture(t, "exit")
  await f.session.initialize({ initializationOptions: { sdk: { path: f.sdk } } })
  await f.session.transport.notification("arkts/semanticPreparation", m => m.params.phase === "failed", 10_000)
  const changed = "// latest unsaved source\n" + f.sources["Main.ets"]
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: changed })
  const ready = await f.readiness(true)
  assert.equal(ready.result?.semanticState, "ready", JSON.stringify(ready))
  const response = await f.session.request("textDocument/definition", {
    textDocument: { uri: f.uri("Main.ets") }, position: { line: 2, character: 23 } })
  assert.deepEqual(response.result, [{ uri: f.uri("Unopened.ets"), range: {
    start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
  assert.ok(f.events().some(e => e.event === "semantic.worker.recovery.complete"))
  assert.deepEqual((await f.session.close({ timeoutMs: 5_000 })).exit, { code: 0, signal: null })
})

test("post-build query cancellation retains the healthy Program and ordinary queries still work", { timeout: 30_000 }, async t => {
  const f = fixture(t, null, 0)
  await initializeReady(f)
  f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
  assert.equal((await f.readiness(true)).result.semanticState, "ready")
  const attempts = f.state().attempts
  f.setFault("query-pause")
  const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 23 } }
  await cancelEntered(f, "textDocument/definition", params)
  assert.equal((await f.readiness(true)).result.semanticState, "ready")
  assert.equal(f.state().attempts, attempts, "a cancelled query does not retire an already synchronized Program")
  const result = await f.session.request("textDocument/definition", params)
  assert.deepEqual(result.result, [{ uri: f.uri("Unopened.ets"), range: {
    start: { line: 0, character: 16 }, end: { line: 0, character: 28 } } }])
})

test("cancelling an edited completion preserves its completed synchronization for the next same-input request",
  { timeout: 30_000 }, async t => {
    const f = fixture(t, null, 0, { ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "10000" })
    await initializeReady(f)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    assert.equal((await f.readiness(true)).result.semanticState, "ready")
    const before = f.state()
    f.setFault("pause-main")
    f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2,
      text: f.sources["Main.ets"] + "// local edit\n" })
    const params = { textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 } }
    const id = await cancelEntered(f, "textDocument/completion", params)
    const cancelled = f.state()
    assert.equal(cancelled.completed, before.completed + 1,
      "client cancellation must not interrupt the in-place Program synchronization")
    const next = await f.session.request("textDocument/completion", params)
    assert.equal(next.error, undefined, JSON.stringify(next))
    assert.ok(next.result.items.some(item => item.label === "neverQueried"), JSON.stringify(next))
    assert.equal(f.state().attempts, cancelled.attempts, "the next completion must reuse the synchronized Program")
    assert.equal((await f.readiness(true)).result.semanticState, "ready")
    assert.equal(f.state().attempts, cancelled.attempts, "readiness must reuse that same Program too")
    assert.equal(f.events().filter(event => event.event === "semantic.worker.started").length, 1)
    assert.equal(f.session.transport.transcriptEntries.filter(({ entry }) =>
      entry.direction === "receive" && entry.id === id && entry.method === null).length, 1)
    f.configure(); await f.readiness(false)
    assert.equal(f.state().projectRefs, 0, "preserved successful Program leases still release on disposal")
  })

test("a newer edit during synchronization cannot publish the old completion or retain its cancellation shield",
  { timeout: 30_000 }, async t => {
    const f = fixture(t, null, 0, { ARKTS_TEST_DIAGNOSTIC_DELAY_MS: "10000" })
    await initializeReady(f)
    f.session.openDocument({ uri: f.uri("Main.ets"), version: 1, text: f.sources["Main.ets"] })
    assert.equal((await f.readiness(true)).result.semanticState, "ready")
    f.setFault("pause-main")
    f.session.changeDocument({ uri: f.uri("Main.ets"), version: 2,
      text: f.sources["Main.ets"] + "// first edit\n" })
    const id = f.session.nextRequestId++
    f.session.transport.send({ jsonrpc: "2.0", id, method: "textDocument/completion", params: {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 } } })
    const deadline = Date.now() + 5000
    while (!fs.existsSync(path.join(f.directory, "build-entered.json"))) {
      if (Date.now() > deadline) throw Error("edited completion did not enter synchronization")
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    const changed = 'import { neverQueried as currentAlias } from "./Unopened"\nexport const result = currentAlias()\n'
    f.session.changeDocument({ uri: f.uri("Main.ets"), version: 3, text: changed })
    const old = await f.session.transport.response(id, 5000)
    assert.equal(old.error, undefined, JSON.stringify(old))
    assert.deepEqual(old.result, { isIncomplete: false, items: [] }, "the existing stale-completion contract is an empty list")
    const fresh = await f.session.request("textDocument/completion", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 26 } })
    assert.equal(fresh.error, undefined, JSON.stringify(fresh))
    assert.ok(fresh.result.items.some(item => item.label === "currentAlias"), JSON.stringify(fresh))
    const definition = await f.session.request("textDocument/definition", {
      textDocument: { uri: f.uri("Main.ets") }, position: { line: 1, character: 25 } })
    assert.equal(definition.result?.[0]?.uri, f.uri("Unopened.ets"), JSON.stringify(definition))
    assert.equal((await f.readiness(true)).result.semanticState, "ready")
    f.configure(); await f.readiness(false)
    assert.equal(f.state().projectRefs, 0)
    assert.equal(f.events().filter(event => event.event === "semantic.worker.started").length, 1)
  })
